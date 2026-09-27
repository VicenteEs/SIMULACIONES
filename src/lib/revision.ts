/**
 * La revisión del contenido que llega hecho, sin nada del servidor (D-142).
 *
 * El contenido de la plataforma va a llegar en bloque, redactado por un modelo
 * de lenguaje a partir de libros de traumatología, y lo revisan traumatólogos
 * con cuenta de editor. El dueño quiere saber dos cosas de cada ficha y de cada
 * revisor: cuánto se cambió el texto que llegó, y cuánto tiempo de verdad se
 * le dedicó antes de darlo por bueno. Aquí están las dos cuentas y los
 * umbrales con que se juzgan, puras, para que se prueben sin base y para que el
 * editor, el servidor y la pantalla de auditoría digan exactamente lo mismo.
 *
 * Lo que se mide son **palabras**, no caracteres: corregir «10 mg» por «100 mg»
 * es una palabra cambiada, que es como lo contaría el traumatólogo, y no un
 * carácter sobre miles. Y se mide sección a sección, las mismas pestañas del
 * editor, para poder decir «en Manejo se cambió el 40 %, en Definición nada».
 */

import { BLOQUES } from '@/admin/bloques'
import type { Campo, EsquemaDeColeccion } from '@/admin/esquema'
import { textoPlano } from '@/lib/textoRico'

// ------------------------------------------------------------------ catálogos

/**
 * Los cinco módulos que pueden entrar en revisión, en el orden de siempre.
 *
 * Es `SLUGS_DE_MODULOS` escrito otra vez, y a propósito: aquel vive en
 * `src/collections/index.ts`, que importa la colección `revisiones`, y esta
 * necesita la lista para sus opciones; importarla de allí cerraría un ciclo que
 * la dejaría sin definir al cargar. `tests/unit/revision.test.ts` comprueba
 * que las dos listas digan lo mismo.
 */
export const MODULOS_EN_REVISION = [
  'patologias',
  'maniobras',
  'casos-ao',
  'cirugias',
  'estudios-ia',
] as const

export const ESTADOS_DE_REVISION = [
  { label: 'Pendiente de revisión', value: 'pendiente' },
  { label: 'En revisión', value: 'en-revision' },
  { label: 'Lista para publicar', value: 'lista' },
  { label: 'Devuelta al revisor', value: 'devuelta' },
  { label: 'Publicada', value: 'publicada' },
] as const

export type EstadoDeRevision = (typeof ESTADOS_DE_REVISION)[number]['value']

export const ORIGENES_DE_CONTENIDO = [
  { label: 'Generado por IA', value: 'ia' },
  { label: 'Escrito a mano', value: 'manual' },
] as const

export type OrigenDeContenido = (typeof ORIGENES_DE_CONTENIDO)[number]['value']

export const ACCIONES_DE_REVISION = [
  { label: 'Entró en revisión', value: 'registrada' },
  { label: 'Asignada', value: 'asignada' },
  { label: 'Validada', value: 'lista' },
  { label: 'Editada después de validarla', value: 'reabierta' },
  { label: 'Devuelta al revisor', value: 'devuelta' },
  { label: 'Publicada', value: 'publicada' },
  { label: 'Retirada de publicación', value: 'retirada' },
] as const

export type AccionDeRevision = (typeof ACCIONES_DE_REVISION)[number]['value']

const ETIQUETA_DE_ESTADO: Record<string, string> = Object.fromEntries(
  ESTADOS_DE_REVISION.map((e) => [e.value, e.label]),
)
const ETIQUETA_DE_ACCION: Record<string, string> = Object.fromEntries(
  ACCIONES_DE_REVISION.map((a) => [a.value, a.label]),
)
const ETIQUETA_DE_ORIGEN: Record<string, string> = Object.fromEntries(
  ORIGENES_DE_CONTENIDO.map((o) => [o.value, o.label]),
)

export const estadoEnPalabras = (estado: unknown): string =>
  (typeof estado === 'string' && ETIQUETA_DE_ESTADO[estado]) || 'Sin revisión'
export const accionEnPalabras = (accion: unknown): string =>
  (typeof accion === 'string' && ETIQUETA_DE_ACCION[accion]) || String(accion ?? '')
export const origenEnPalabras = (origen: unknown): string =>
  (typeof origen === 'string' && ETIQUETA_DE_ORIGEN[origen]) || '—'

// ------------------------------------------------------------------ umbrales

/**
 * Más deprisa que esto no es una revisión atenta, en palabras por minuto de
 * revisión activa.
 *
 * La lectura silenciosa corriente de un adulto ronda las 200–300 palabras por
 * minuto sobre texto fácil; revisar texto clínico buscando errores de dosis,
 * de clasificación o de lado va bastante más despacio. Se pone el listón en lo
 * alto del rango de la lectura corriente a propósito: lo que se quiere señalar
 * es lo que no se pudo leer, no a quien lee rápido. Una validación por encima
 * de esto no se impide; se marca.
 */
export const RITMO_MAXIMO_DE_LECTURA = 250

/** Por debajo de esto, ninguna ficha se ha revisado, sea del largo que sea. */
export const SEGUNDOS_MINIMOS_DE_REVISION = 30

/**
 * Cuánto tiene que estar una sección abierta, con actividad, para darla por
 * vista: lo justo para que pasar de pestaña en pestaña con el ratón no cuente.
 */
export const SEGUNDOS_PARA_DAR_POR_VISTA = 5

/**
 * Sin tocar nada durante esto, el tiempo deja de contar como activo aunque la
 * pestaña siga a la vista. Leer un párrafo largo sin mover el ratón cabe de
 * sobra; una ficha abierta mientras se atiende a un paciente, no.
 */
export const INACTIVIDAD_QUE_NO_CUENTA_MS = 90_000

/** Cada cuánto manda el editor lo que ha medido. */
export const LATIDO_DE_REVISION_MS = 15_000

// ----------------------------------------------------------- palabras de una ficha

export interface SeccionEnPalabras {
  seccion: string
  palabras: string[]
}

/**
 * Las palabras de un texto. Separa por espacios y se queda con lo que tiene al
 * menos una letra o una cifra: el «·» con que `textoPlano` junta los puntos de
 * una lista no es una palabra que nadie haya escrito.
 */
export function palabrasDe(texto: unknown): string[] {
  if (typeof texto !== 'string' || texto.trim() === '') return []
  return texto.split(/\s+/).filter((trozo) => /[\p{L}\p{N}]/u.test(trozo))
}

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

/**
 * Lo que un campo aporta a la cuenta, en orden de lectura.
 *
 * El texto cuenta por palabras. Lo que no es texto —una opción, un número, una
 * relación, un archivo— cuenta como UNA «palabra» con su nombre y su valor:
 * cambiar la clasificación de un caso o la imagen de un bloque es una edición,
 * y del mismo tamaño que cambiar una palabra. Cada bloque suma además su tipo,
 * para que quitar un bloque entero se note aunque estuviera vacío.
 */
function palabrasDelCampo(campo: Campo, valor: unknown, salida: string[]) {
  switch (campo.tipo) {
    case 'texto':
    case 'area':
      salida.push(...palabrasDe(valor))
      return
    case 'rico':
      salida.push(...palabrasDe(textoPlano(valor)))
      return
    case 'numero':
      if (typeof valor === 'number' && Number.isFinite(valor)) salida.push(`${campo.nombre}=${valor}`)
      return
    case 'seleccion':
      if (typeof valor === 'string' && valor !== '') salida.push(`${campo.nombre}=${valor}`)
      return
    case 'casilla':
      if (valor === true) salida.push(`${campo.nombre}=sí`)
      return
    case 'relacion':
    case 'archivo': {
      const lista = Array.isArray(valor) ? valor : [valor]
      const ids = lista.map(idDe).filter((id): id is string => id !== null).sort()
      for (const id of ids) salida.push(`${campo.nombre}=#${id}`)
      return
    }
    case 'grupo': {
      const grupo = (valor ?? {}) as Record<string, unknown>
      for (const sub of campo.campos) palabrasDelCampo(sub, grupo[sub.nombre], salida)
      return
    }
    case 'lista': {
      if (!Array.isArray(valor)) return
      for (const fila of valor) {
        const registro = (fila ?? {}) as Record<string, unknown>
        for (const sub of campo.campos) palabrasDelCampo(sub, registro[sub.nombre], salida)
      }
      return
    }
    case 'bloques': {
      if (!Array.isArray(valor)) return
      for (const bruto of valor) {
        const bloque = (bruto ?? {}) as Record<string, unknown>
        const esquema = BLOQUES.find((b) => b.slug === bloque.blockType)
        if (!esquema) continue
        salida.push(`[${esquema.slug}]`)
        for (const sub of esquema.campos) palabrasDelCampo(sub, bloque[sub.nombre], salida)
      }
      return
    }
  }
}

/** Las palabras de una ficha, sección a sección, en el orden de las pestañas del editor. */
export function palabrasPorSeccion(
  esquema: EsquemaDeColeccion,
  documento: Record<string, unknown> | null | undefined,
): SeccionEnPalabras[] {
  const doc = documento ?? {}
  return esquema.secciones.map((seccion) => {
    const palabras: string[] = []
    for (const campo of seccion.campos) palabrasDelCampo(campo, doc[campo.nombre], palabras)
    return { seccion: seccion.titulo, palabras }
  })
}

// ------------------------------------------------------------------ diferencia

/**
 * Más allá de esta distancia la cuenta exacta sale cara y se aproxima.
 *
 * La distancia de edición es cuántas palabras hay que quitar y poner para ir
 * de un texto al otro. El algoritmo de Myers la calcula en un tiempo que crece
 * con ella: para una revisión normal —unas decenas de cambios en una sección de
 * mil palabras— son microsegundos; para una sección reescrita entera serían
 * decenas de millones de pasos en cada guardado. Pasado este tope ya no hace
 * falta la cifra exacta —la sección se reescribió casi entera—, y se cuenta
 * cuántas palabras comparten sin mirar el orden, que es una cota por arriba de
 * las comunes y por tanto se queda corta, nunca larga, en lo editado.
 */
const DISTANCIA_EXACTA_MAXIMA = 4000

/** Palabras en común sin mirar el orden: cuántas veces se puede emparejar cada una. */
function comunesSinOrden(a: readonly string[], b: readonly string[]): number {
  const cuenta = new Map<string, number>()
  for (const palabra of a) cuenta.set(palabra, (cuenta.get(palabra) ?? 0) + 1)
  let comunes = 0
  for (const palabra of b) {
    const quedan = cuenta.get(palabra) ?? 0
    if (quedan > 0) {
      comunes += 1
      cuenta.set(palabra, quedan - 1)
    }
  }
  return comunes
}

/**
 * Cuántas palabras de `a` siguen en `b`, en el mismo orden: la subsecuencia
 * común más larga.
 *
 * Primero se apartan el principio y el final comunes, que en una revisión son
 * casi todo el texto, y sobre lo que queda en medio corre Myers (1986): la
 * distancia de edición `D` sin sustituciones, y de ella las comunes,
 * `(n + m − D) / 2`.
 */
export function palabrasEnComun(a: readonly string[], b: readonly string[]): number {
  let inicio = 0
  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio += 1
  let finA = a.length
  let finB = b.length
  while (finA > inicio && finB > inicio && a[finA - 1] === b[finB - 1]) {
    finA -= 1
    finB -= 1
  }
  const fijas = inicio + (a.length - finA)
  const n = finA - inicio
  const m = finB - inicio
  if (n === 0 || m === 0) return fijas

  const tope = Math.min(n + m, DISTANCIA_EXACTA_MAXIMA)
  const desplazamiento = tope + 1
  const v = new Int32Array(2 * tope + 3)
  for (let d = 0; d <= tope; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[desplazamiento + k - 1] < v[desplazamiento + k + 1])
          ? v[desplazamiento + k + 1]
          : v[desplazamiento + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[inicio + x] === b[inicio + y]) {
        x += 1
        y += 1
      }
      v[desplazamiento + k] = x
      if (x >= n && y >= m) return fijas + (n + m - d) / 2
    }
  }
  return fijas + comunesSinOrden(a.slice(inicio, finA), b.slice(inicio, finB))
}

/**
 * Qué parte del texto cambió, de 0 a 100, con un decimal.
 *
 * Lo quitado o reemplazado y lo nuevo, el mayor de los dos, sobre el largo del
 * texto más largo de los dos. Se eligió así porque es lo que se entiende sin
 * leer esta nota: reescribir una de cada diez palabras es un 10 %; borrar un
 * párrafo que era la décima parte, otro 10 %; añadir un párrafo que acaba
 * siendo la décima parte del texto, otro 10 %. Una suma de las dos contaría dos
 * veces cada reemplazo.
 */
export function porcentajeEditado(
  original: number,
  actual: number,
  quitadas: number,
  nuevas: number,
): number {
  const base = Math.max(original, actual)
  if (base === 0) return 0
  return Math.round((Math.max(quitadas, nuevas) / base) * 1000) / 10
}

export interface EdicionDeSeccion {
  seccion: string
  original: number
  actual: number
  porcentaje: number
}

export interface MedidaDeEdicion {
  palabrasOriginales: number
  palabrasActuales: number
  /** Palabras del original que ya no están, o no donde estaban. */
  palabrasQuitadas: number
  /** Palabras que el original no tenía. */
  palabrasNuevas: number
  porcentaje: number
  porSeccion: EdicionDeSeccion[]
}

/**
 * Cuánto se editó una ficha respecto de como llegó, sección a sección y en
 * total.
 *
 * Las secciones se emparejan por título, que es lo que las dos versiones
 * comparten aunque el esquema del panel cambie entre medias: una sección que
 * ya no existe cuenta como quitada entera, y una nueva, como añadida.
 */
export function medirEdicion(
  original: readonly SeccionEnPalabras[],
  actual: readonly SeccionEnPalabras[],
): MedidaDeEdicion {
  const titulos = [...new Set([...actual.map((s) => s.seccion), ...original.map((s) => s.seccion)])]
  const porTitulo = (lista: readonly SeccionEnPalabras[], titulo: string) =>
    lista.find((s) => s.seccion === titulo)?.palabras ?? []

  let palabrasOriginales = 0
  let palabrasActuales = 0
  let palabrasQuitadas = 0
  let palabrasNuevas = 0
  const porSeccion: EdicionDeSeccion[] = []
  for (const titulo of titulos) {
    const a = porTitulo(original, titulo)
    const b = porTitulo(actual, titulo)
    const comunes = palabrasEnComun(a, b)
    const quitadas = a.length - comunes
    const nuevas = b.length - comunes
    palabrasOriginales += a.length
    palabrasActuales += b.length
    palabrasQuitadas += quitadas
    palabrasNuevas += nuevas
    porSeccion.push({
      seccion: titulo,
      original: a.length,
      actual: b.length,
      porcentaje: porcentajeEditado(a.length, b.length, quitadas, nuevas),
    })
  }
  return {
    palabrasOriginales,
    palabrasActuales,
    palabrasQuitadas,
    palabrasNuevas,
    porcentaje: porcentajeEditado(palabrasOriginales, palabrasActuales, palabrasQuitadas, palabrasNuevas),
    porSeccion,
  }
}

// ------------------------------------------------------------------ el tiempo

export interface TiempoDeRevision {
  segundosAbiertos: number
  segundosActivos: number
  /** Segundos activos con cada sección delante, por su título. */
  porSeccion: Record<string, number>
  ediciones: number
}

/** Suma lo medido en varias sesiones. */
export function sumarTiempos(sesiones: readonly Partial<TiempoDeRevision>[]): TiempoDeRevision {
  const total: TiempoDeRevision = { segundosAbiertos: 0, segundosActivos: 0, porSeccion: {}, ediciones: 0 }
  for (const sesion of sesiones) {
    total.segundosAbiertos += sesion.segundosAbiertos ?? 0
    total.segundosActivos += sesion.segundosActivos ?? 0
    total.ediciones += sesion.ediciones ?? 0
    for (const [seccion, segundos] of Object.entries(sesion.porSeccion ?? {})) {
      if (typeof segundos !== 'number' || !Number.isFinite(segundos)) continue
      total.porSeccion[seccion] = (total.porSeccion[seccion] ?? 0) + segundos
    }
  }
  return total
}

/** Las secciones que se tuvieron delante lo bastante como para darlas por vistas. */
export const seccionesVistas = (porSeccion: Readonly<Record<string, number>>): string[] =>
  Object.entries(porSeccion)
    .filter(([, segundos]) => segundos >= SEGUNDOS_PARA_DAR_POR_VISTA)
    .map(([seccion]) => seccion)

/** Palabras por minuto de revisión activa; `null` si no hubo ni un segundo. */
export function ritmoDeRevision(palabras: number, segundosActivos: number): number | null {
  if (!(segundosActivos > 0)) return null
  return Math.round((palabras / (segundosActivos / 60)) * 10) / 10
}

export interface JuicioDeLaValidacion {
  rapida: boolean
  ritmo: number | null
  motivos: string[]
  /** Secciones con contenido que no se llegaron a tener delante. */
  sinVer: string[]
}

/**
 * Si una validación parece hecha sin leer, y por qué, en palabras.
 *
 * Tres señales, cualquiera basta: menos de `SEGUNDOS_MINIMOS_DE_REVISION` de
 * revisión activa, un ritmo por encima de `RITMO_MAXIMO_DE_LECTURA`, o alguna
 * sección con contenido que no llegó a abrirse. No se juzga lo poco que se
 * editó: un texto que llega bien no tiene por qué cambiarse, y castigarlo
 * enseñaría a tocar por tocar. Ese dato va aparte, a la vista, para quien
 * quiera cruzarlo.
 */
export function evaluarValidacion(entrada: {
  palabras: number
  segundosActivos: number
  seccionesConContenido: readonly string[]
  vistas: readonly string[]
}): JuicioDeLaValidacion {
  const ritmo = ritmoDeRevision(entrada.palabras, entrada.segundosActivos)
  const motivos: string[] = []
  if (entrada.segundosActivos < SEGUNDOS_MINIMOS_DE_REVISION) {
    motivos.push(
      `solo ${duracionEnPalabras(entrada.segundosActivos)} de revisión activa (el mínimo es ${SEGUNDOS_MINIMOS_DE_REVISION} s)`,
    )
  }
  if (ritmo !== null && ritmo > RITMO_MAXIMO_DE_LECTURA && entrada.segundosActivos >= SEGUNDOS_MINIMOS_DE_REVISION) {
    motivos.push(
      `a ${Math.round(ritmo)} palabras por minuto, más deprisa de lo que se lee con atención (${RITMO_MAXIMO_DE_LECTURA})`,
    )
  }
  const vistas = new Set(entrada.vistas)
  const sinVer = entrada.seccionesConContenido.filter((seccion) => !vistas.has(seccion))
  if (sinVer.length > 0) {
    motivos.push(`sin abrir ${sinVer.length === 1 ? 'la sección' : 'las secciones'} ${sinVer.map((s) => `«${s}»`).join(', ')}`)
  }
  return { rapida: motivos.length > 0, ritmo, motivos, sinVer }
}

/** «45 s», «3 min», «1 h 20 min». */
export function duracionEnPalabras(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `${s} s`
  const minutos = Math.round(s / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}
