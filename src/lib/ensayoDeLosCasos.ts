/**
 * El ensayo de los casos del simulador antes de desplegar (D-373, E3 de P-016).
 *
 * Cada caso guardado se abre como lo abre la consola, con el código que se va a
 * desplegar, y su resolución de referencia se vuelve a calificar. Lo que se
 * busca es lo que un despliegue puede romper sin que ninguna prueba lo vea,
 * porque las pruebas usan casos de mentira:
 *
 *  - que la consola ya no sepa leer un caso guardado (una conversión de formato
 *    que falta o que falla);
 *  - que la nota de un recorrido cambie sin que nadie haya tocado el caso (un
 *    cambio del motor que deja un paso imposible o que lo regala).
 *
 * Eso es **error** y para el despliegue. Lo demás es contenido —un caso sin
 * referencia, un modelo cuyo archivo falta, una pieza que el archivo no trae— y
 * no depende de lo que se despliega: se informa como **aviso** y no para nada,
 * porque un despliegue que se niega por algo que no cambia nunca pasa, y un
 * ensayo que siempre falla se acaba saltando (ver el `AGENTS.md`, «una puerta
 * que falla siempre»).
 *
 * Aquí solo hay funciones puras. Leer la base y los archivos es de
 * `scripts/ensayar-casos.ts`; copiar la base, de `scripts/ensayar-casos.sh`.
 */
import { casoParaLaConsola } from './casoQuirurgico'
import { CasoDeUnFormatoMasNuevo } from './formatoDelCaso'
import { notaDelRecorrido, recorridoValido, type NotaDelCaso } from './notaDelRecorrido'

// ------------------------------------------------------------ lo que se copia

/**
 * Las colecciones cuyos datos no viajan a la copia del ensayo (D-295, D-373).
 *
 * Son las de personas: cuentas, lo que hicieron, lo que escribieron y lo que
 * pidieron. El ensayo no las lee, y una copia de producción con ellas dentro es
 * justo lo que D-295 prohíbe aunque solo viva unos minutos. Ninguna tabla de
 * contenido apunta a ellas (se miró en el esquema: las claves ajenas hacia
 * `usuarios` salen todas de esta misma lista), así que la copia queda entera.
 *
 * `equipo` va aquí aunque sea público: son nombres y fotos de personas, y el
 * ensayo no los necesita.
 */
export const COLECCIONES_SIN_COPIAR: readonly string[] = [
  'usuarios',
  'actividad',
  'comentarios',
  'difusiones',
  // Quién cerró cada aviso de la plataforma (D-406).
  'lecturas-de-avisos',
  'registro-de-acciones',
  // Equipo, IP y país de cada entrada (D-388).
  'entradas',
  'requisitos',
  'revisiones',
  'sesiones-de-revision',
  'tiempo-activo',
  'cotizaciones',
  'equipo',
]

/**
 * Las que sí viajan. Lista explícita y no «todas las demás» para que una
 * colección nueva obligue a decidir: `ensayoDeLosCasos.test.ts` falla si alguna
 * no está en ninguna de las dos.
 */
export const COLECCIONES_QUE_SE_COPIAN: readonly string[] = [
  // El contenido propio de una institución apunta a su fila (D-396): sin ella,
  // la copia no restauraría la clave ajena. Lleva un solo dato de persona, el
  // correo de contacto de su administrador, que es de la institución y no de
  // un alumno.
  'instituciones',
  'segmentos',
  'tipos-de-ficha',
  'medios',
  'modelos-3d',
  'instancias-atlas',
  'estructuras-anatomicas',
  'huesos-ao',
  'clasificaciones-ao',
  'tecnicas-quirurgicas',
  'fases-quirurgicas',
  'instrumental',
  'patologias',
  'maniobras',
  'casos-ao',
  'cirugias',
  'resoluciones-de-referencia',
  'estudios-ia',
  'ajustes',
  'medios-pagina',
  'textos-pagina',
]

/**
 * Los patrones de tabla que `pg_dump --exclude-table-data` deja vacíos.
 *
 * Una colección son varias tablas (`usuarios`, `usuarios_sessions`,
 * `revisiones_historial`…), de ahí el `*`. Las preferencias y los documentos
 * bloqueados de Payload van también: cuelgan de las cuentas.
 */
export function tablasSinCopiar(): string[] {
  return [
    ...COLECCIONES_SIN_COPIAR.map((slug) => `${slug.replace(/-/g, '_')}*`),
    'payload_preferences*',
    'payload_locked_documents*',
  ]
}

// ------------------------------------------------------------ los modelos

/**
 * Los nombres con que la consola ve las mallas de un `.glb`, o `null` si el
 * archivo no es un `.glb` que se pueda leer.
 *
 * Aproximados a como los pone `GLTFLoader`: saneados con la misma regla que
 * `PropertyBinding.sanitizeNodeName` (espacios a `_`, fuera `[ ] . : /`) y, si
 * un nombre se repite, con los sufijos `_1`, `_2`… que el cargador añade. Es
 * una aproximación —el cargador numera en el orden en que carga— y por eso lo
 * que sale de aquí solo puede producir avisos.
 */
export function nodosDelGlb(bytes: Uint8Array): string[] | null {
  if (bytes.byteLength < 20) return null
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (vista.getUint32(0, true) !== 0x46546c67) return null
  const largo = vista.getUint32(12, true)
  if (vista.getUint32(16, true) !== 0x4e4f534a || 20 + largo > bytes.byteLength) return null
  let json: { nodes?: Array<{ name?: unknown }>; meshes?: Array<{ name?: unknown }> }
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + largo)))
  } catch {
    return null
  }
  const sanear = (nombre: string) => nombre.replace(/\s/g, '_').replace(/[[\].:/]/g, '')
  const vistos = new Map<string, number>()
  const nombres = new Set<string>()
  for (const cosa of [...(json.nodes ?? []), ...(json.meshes ?? [])]) {
    if (typeof cosa?.name !== 'string' || !cosa.name) continue
    const saneado = sanear(cosa.name)
    const veces = vistos.get(saneado) ?? 0
    nombres.add(veces === 0 ? saneado : `${saneado}_${veces}`)
    vistos.set(saneado, veces + 1)
  }
  return [...nombres]
}

/** Lo que el guion averiguó del modelo del caso antes de ensayarlo. */
export type ModeloEnsayado =
  | { estado: 'sin-modelo' }
  | { estado: 'sin-documento'; id: string }
  | { estado: 'sin-archivo'; archivo: string }
  | { estado: 'ilegible'; archivo: string }
  | { estado: 'leido'; archivo: string; nodos: string[] }

// ------------------------------------------------------------ un caso

export type Gravedad = 'error' | 'aviso'

export interface Hallazgo {
  gravedad: Gravedad
  mensaje: string
}

export interface CasoEnsayado {
  id: string
  nombre: string
  publicado: boolean
  /** La nota que sacó la referencia con este código, si había una que calificar. */
  nota: NotaDelCaso | null
  hallazgos: Hallazgo[]
}

const igual = (a: number, b: number) => Math.abs(a - b) < 1e-6
const nota = (n: NotaDelCaso) => `${n.puntaje}/${n.puntajeMaximo}`
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Ensaya un caso: lo abre como la consola, mira su modelo y vuelve a calificar
 * su referencia.
 *
 * `documento` es la fila de `cirugias` con profundidad 0, que es como la lee la
 * nota del servidor (`notaDelServidor`, D-310) y como la va a leer el ensayo de
 * la referencia; `referencia`, su fila de `resoluciones-de-referencia` o `null`.
 */
export function ensayarUnCaso(
  documento: Record<string, unknown>,
  referencia: Record<string, unknown> | null,
  modelo: ModeloEnsayado,
): CasoEnsayado {
  const id = String(documento.id ?? '')
  const nombre = typeof documento.nombre === 'string' && documento.nombre.trim() ? documento.nombre : `caso ${id}`
  const publicado = documento._status === 'published'
  const hallazgos: Hallazgo[] = []
  const error = (mensaje: string) => hallazgos.push({ gravedad: 'error', mensaje })
  const aviso = (mensaje: string) => hallazgos.push({ gravedad: 'aviso', mensaje })
  const resultado = (calificada: NotaDelCaso | null = null): CasoEnsayado => ({
    id,
    nombre,
    publicado,
    nota: calificada,
    hallazgos,
  })

  // 1. Que la consola lo lea. Si no, no hay nada más que mirar: es lo que verían el residente, el editor y la nota.
  let caso: ReturnType<typeof casoParaLaConsola>
  try {
    caso = casoParaLaConsola(documento)
  } catch (fallo) {
    error(
      fallo instanceof CasoDeUnFormatoMasNuevo
        ? fallo.message
        : `La consola no lo puede abrir: ${fallo instanceof Error ? fallo.message : String(fallo)}`,
    )
    return resultado()
  }

  // 2. El contenido. Avisos: no dependen de lo que se despliega.
  if (publicado && caso.pasos.length === 0) aviso('Está publicado y no tiene pasos.')
  if (modelo.estado === 'sin-modelo') {
    if (publicado) aviso('Está publicado y no tiene modelo 3D.')
  } else if (modelo.estado === 'sin-documento') {
    aviso(`Su modelo 3D (${modelo.id}) ya no existe.`)
  } else if (modelo.estado === 'sin-archivo') {
    aviso(`El archivo de su modelo 3D no está en el disco: ${modelo.archivo}.`)
  } else if (modelo.estado === 'ilegible') {
    aviso(`El archivo de su modelo 3D no se puede leer como .glb: ${modelo.archivo}.`)
  } else {
    const enElArchivo = new Set(modelo.nodos)
    const faltan = caso.piezas.map((p) => p.nodo).filter((n) => n && !enElArchivo.has(n))
    if (faltan.length > 0) {
      aviso(`El archivo de su modelo no trae ${faltan.length === 1 ? 'la pieza' : 'las piezas'} ${faltan.join(', ')}.`)
    }
  }

  // 3. La referencia, calificada con este código.
  if (!referencia) {
    if (publicado) aviso('No tiene resolución de referencia: su nota no se puede comprobar.')
    return resultado()
  }
  let calificada: NotaDelCaso
  try {
    calificada = notaDelRecorrido(caso.pasos, recorridoValido(referencia.recorrido))
  } catch (fallo) {
    // El recorrido lo validó este mismo código al grabarlo: si ahora no pasa, es el código el que cambió.
    error(`Su resolución de referencia ya no se acepta: ${fallo instanceof Error ? fallo.message : String(fallo)}`)
    return resultado()
  }
  const grabada = { puntaje: numero(referencia.puntaje) ?? Number.NaN, puntajeMaximo: numero(referencia.puntajeMaximo) ?? Number.NaN }
  if (igual(calificada.puntaje, grabada.puntaje) && igual(calificada.puntajeMaximo, grabada.puntajeMaximo)) {
    return resultado(calificada)
  }
  // ¿Lo cambió el código o el editor? Si el caso se guardó después de grabar la referencia, puede ser lo segundo.
  const editadoDespues =
    typeof referencia.casoGuardadoEn !== 'string' ||
    typeof documento.updatedAt !== 'string' ||
    Date.parse(documento.updatedAt) !== Date.parse(referencia.casoGuardadoEn)
  if (editadoDespues) {
    aviso(
      `Su resolución de referencia daba ${nota(grabada)} y ahora da ${nota(calificada)}, pero el caso se editó después de grabarla: si el cambio es del editor, hay que volver a grabarla.`,
    )
  } else {
    error(`Su resolución de referencia daba ${nota(grabada)} y con este código da ${nota(calificada)}, sin que el caso haya cambiado.`)
  }
  return resultado(calificada)
}

// ------------------------------------------------------------ el informe

export interface InformeDelEnsayo {
  texto: string
  errores: number
  avisos: number
}

/** El informe que el guion escribe, y cuántos errores hay: con uno solo, el despliegue se para. */
export function informeDelEnsayo(casos: readonly CasoEnsayado[], sobrantes = 0): InformeDelEnsayo {
  const lineas: string[] = []
  let errores = 0
  let avisos = 0
  const conReferencia = casos.filter((c) => c.nota).length
  for (const caso of casos) {
    if (caso.hallazgos.length === 0) continue
    lineas.push(`  ${caso.nombre} (${caso.id}${caso.publicado ? ', publicado' : ', sin publicar'})`)
    for (const h of caso.hallazgos) {
      if (h.gravedad === 'error') errores++
      else avisos++
      lineas.push(`    ${h.gravedad === 'error' ? 'ERROR' : 'aviso'}: ${h.mensaje}`)
    }
  }
  if (sobrantes > 0) {
    avisos++
    lineas.push(`  ${sobrantes} resolución(es) de referencia sin caso: se pueden borrar.`)
  }
  const cabecera = `${casos.length} caso(s) ensayado(s), ${conReferencia} con su referencia calificada: ${errores} error(es), ${avisos} aviso(s).`
  return { texto: [cabecera, ...lineas].join('\n'), errores, avisos }
}
