/**
 * La planilla de Excel del listado de estructuras anatómicas (D-179, P-003 E8.5):
 * armarla para descargar, entender la que se sube y, sobre todo, **decidir qué
 * cambiaría antes de escribir nada**.
 *
 * El dueño pidió que esta parte quede «bien hecha y revisada para no perder
 * información», y todo el diseño sale de ahí:
 *
 *  - **Subir no sobrescribe en silencio.** `planearPlanilla` no escribe: compara la
 *    planilla con lo que hay y devuelve, campo a campo, lo que se llenaría, lo que
 *    se reemplazaría y lo que quedaría igual. La pantalla lo enseña y solo escribe
 *    quien pulsa «Aplicar».
 *  - **Una celda vacía no borra.** Lo que no tiene texto en la planilla no se mira.
 *    Quien quiera borrar o corregir algo ya escrito lo hace en la ventana de la
 *    ficha, que lo deja en el historial.
 *  - **Lo ya escrito no se reemplaza** salvo que se marque, y entonces se ve
 *    antes/después de cada campo.
 *  - **El lado opuesto solo rellena huecos.** «Aplicar también al lado opuesto»
 *    copia lo de «Right X» a «Left X», pero nunca pisa un texto que la otra ficha ya
 *    tenga, ni lo que la propia planilla diga de esa pieza.
 *  - **Lo dudoso se salta y se cuenta.** Un id que no existe, un id repetido, una
 *    fila cuyo nombre original no es el del id (un id estropeado al copiar), un
 *    texto que pasa del tope: ninguno se aplica, y todos salen en el resumen con su
 *    fila.
 *
 * Es puro (no toca la base): el servidor le da el catálogo y las fichas, y recibe un
 * plan y una **huella**. Al aplicar se recalcula el plan con los datos de ese
 * momento y se compara la huella: si la planilla o las fichas cambiaron entre la
 * vista previa y el «Aplicar», no se escribe lo que la persona no llegó a ver.
 */
import { createHash } from 'node:crypto'
import {
  CAMPOS_DE_LA_FICHA,
  CAMPOS_QUE_CUENTAN,
  ETIQUETA_DEL_CAMPO,
  ETIQUETA_DEL_LADO,
  LARGO_MAXIMO_DEL_CAMPO,
  hayTexto,
  leerMarcaDeOculta,
  normalizarTexto,
  type CampoDeLaFicha,
  type FilaDeEstructura,
  type LadoDeLaPieza,
} from '@/lib/estructuras'
import type { HojaLeida } from '@/lib/leerPlanilla'
import { crearPlanilla, type ColumnaDePlanilla, type HojaDePlanilla } from '@/lib/planilla'

export const NOMBRE_DE_LA_HOJA = 'Estructuras'

// ------------------------------------------------------------------ columnas

/**
 * Las columnas de la hoja, en orden. Las primeras seis son de consulta (se ignoran al
 * subir); las demás son las que se llenan. Los títulos son los que se leen al subir.
 */
export const TITULO_DEL_ID = 'Id del atlas'
export const TITULO_DEL_NOMBRE_ORIGINAL = 'Nombre original'
export const TITULO_DE_OCULTA = 'No mostrar'

const COLUMNAS_DE_CONSULTA: ColumnaDePlanilla[] = [
  { titulo: TITULO_DEL_ID, tipo: 'texto', ancho: 11 },
  { titulo: 'Nombre', tipo: 'texto', ancho: 32 },
  { titulo: TITULO_DEL_NOMBRE_ORIGINAL, tipo: 'texto', ancho: 32 },
  { titulo: 'Lado', tipo: 'texto', ancho: 11 },
  { titulo: 'Sistema', tipo: 'texto', ancho: 20 },
  { titulo: 'Qué falta', tipo: 'texto', ancho: 30 },
]

const ANCHO_DEL_CAMPO: Record<CampoDeLaFicha, number> = {
  nombreLatino: 26,
  definicion: 60,
  origen: 42,
  insercion: 42,
  inervacion: 32,
  accion: 42,
  irrigacion: 42,
  notas: 32,
}

const COLUMNAS_DE_LA_PLANILLA: ColumnaDePlanilla[] = [
  ...COLUMNAS_DE_CONSULTA,
  ...CAMPOS_DE_LA_FICHA.map((campo) => ({ titulo: ETIQUETA_DEL_CAMPO[campo], tipo: 'texto' as const, ancho: ANCHO_DEL_CAMPO[campo] })),
  { titulo: TITULO_DE_OCULTA, tipo: 'texto', ancho: 12 },
]

/** Sin tildes, en minúsculas y con los espacios colapsados: para reconocer un título aunque lo hayan retocado. */
const claveDeTitulo = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Los títulos que se reconocen para cada columna que se lee: el propio y los que escribiría una persona o una IA. */
const SINONIMOS_DE_CAMPO: Record<CampoDeLaFicha, string[]> = {
  nombreLatino: ['nombre latino', 'latin', 'nombre en latin', 'latino', 'terminologia anatomica'],
  definicion: ['definicion', 'descripcion'],
  origen: ['origen'],
  insercion: ['insercion'],
  inervacion: ['inervacion'],
  accion: ['accion', 'funcion'],
  irrigacion: ['irrigacion', 'vascularizacion'],
  notas: ['notas', 'nota', 'observaciones'],
}
const SINONIMOS_DEL_ID = ['id del atlas', 'id', 'atlasid', 'id atlas', 'identificador']
const SINONIMOS_DE_OCULTA = ['no mostrar', 'oculta', 'ocultar', 'oculto']
const SINONIMOS_DEL_NOMBRE_ORIGINAL = ['nombre original', 'original', 'nombre en ingles', 'name']

// ----------------------------------------------------------------- descargar

/** Lo que hace falta saber de cada pieza para escribirla en la planilla. */
export interface PiezaParaLaPlanilla {
  atlasId: string
  nombre: string
  original: string
  lado: LadoDeLaPieza | null
  sistema: string
  faltan: CampoDeLaFicha[]
  /** Lo escrito, solo si la planilla se pide «con lo ya escrito». */
  ficha?: Partial<Record<CampoDeLaFicha, string | null | undefined>>
  oculta?: boolean
}

/**
 * Las hojas de la planilla: la de las piezas y una de instrucciones, que va
 * **con el archivo** porque es lo que lee quien la llena —o la IA a la que se le
 * da—, y la pantalla ya no está delante.
 */
export function hojasDeLaPlanilla(
  piezas: readonly PiezaParaLaPlanilla[],
  nombreDelSistema: (id: string) => string,
): HojaDePlanilla[] {
  const filas = piezas.map((p) => [
    p.atlasId,
    p.nombre,
    p.original,
    p.lado ? ETIQUETA_DEL_LADO[p.lado] : null,
    nombreDelSistema(p.sistema),
    p.faltan.length > 0 ? p.faltan.map((c) => ETIQUETA_DEL_CAMPO[c]).join(', ') : null,
    ...CAMPOS_DE_LA_FICHA.map((campo) => (p.ficha ? normalizarTexto(p.ficha[campo]) || null : null)),
    p.oculta ? 'sí' : null,
  ])
  return [
    { nombre: NOMBRE_DE_LA_HOJA, columnas: COLUMNAS_DE_LA_PLANILLA, filas },
    {
      nombre: 'Cómo llenarla',
      columnas: [
        { titulo: 'Tema', tipo: 'texto', ancho: 28 },
        { titulo: 'Instrucción', tipo: 'texto', ancho: 120 },
      ],
      filas: INSTRUCCIONES,
    },
  ]
}

/** Los bytes del `.xlsx`. */
export function planillaDeEstructuras(
  piezas: readonly PiezaParaLaPlanilla[],
  nombreDelSistema: (id: string) => string,
  titulo: string,
): Uint8Array {
  return crearPlanilla(hojasDeLaPlanilla(piezas, nombreDelSistema), { titulo, autor: 'TraumaHub' })
}

const lista = (campos: readonly CampoDeLaFicha[]) => campos.map((c) => ETIQUETA_DEL_CAMPO[c]).join(', ')

const INSTRUCCIONES: string[][] = [
  ['Qué es', 'Una fila por pieza del atlas anatómico, con los nombres del taller. Se llena y se sube de nuevo en TraumaHub, en Estructuras → Pendientes.'],
  ['Id del atlas', 'Identifica la pieza. No lo cambie ni lo reescriba: una fila cuyo id no existe, o cuyo «Nombre original» no es el de ese id, no se aplica.'],
  ['Columnas de consulta', 'Nombre, Nombre original, Lado, Sistema y Qué falta son para orientarse: se ignoran al subir.'],
  ['Qué se escribe', 'Solo en Nombre latino, Definición, Origen, Inserción, Inervación, Acción, Irrigación, Notas y No mostrar.'],
  ['Celdas vacías', 'Una celda vacía no borra nada: al subir solo se escribe lo que tiene texto. Para corregir o borrar algo ya escrito, use la ventana de edición de la pantalla, que lo deja en el historial.'],
  ['Lo que ya está escrito', 'Si una ficha ya tiene texto en un campo y la planilla trae otro distinto, TraumaHub lo muestra antes y después y no lo reemplaza salvo que se marque.'],
  ['Si no sabe un dato', 'Déjelo vacío. No lo invente ni lo adivine: un campo vacío se completa después; uno equivocado, no se nota.'],
  ['Texto', 'Frases cortas, en español, con terminología anatómica. Sin fórmulas, sin referencias a libros y sin mencionar el lado (derecho / izquierdo) si va a aplicar la planilla también al lado opuesto.'],
  ['Nombre latino', 'La terminología anatómica en latín (por ejemplo, «Tibia»). Es opcional.'],
  ['No mostrar', 'Escriba «sí» para que la pieza no abra ficha cuando alguien la pinche (por ejemplo, un órgano). Esas piezas salen del contador de pendientes.'],
  ['Qué se pide para dar una ficha por completa', ''],
  ['Músculo', lista(CAMPOS_QUE_CUENTAN.musculo)],
  ['Hueso', lista(CAMPOS_QUE_CUENTAN.hueso)],
  ['Arteria', `${lista(CAMPOS_QUE_CUENTAN.arteria)}. En Origen, de qué arteria sale; en Irrigación, qué irriga.`],
  ['Vena', `${lista(CAMPOS_QUE_CUENTAN.vena)}. En Irrigación, qué drena.`],
  ['Nervio', `${lista(CAMPOS_QUE_CUENTAN.nervio)}. En Origen, de dónde sale; en Inervación, qué inerva.`],
  ['Tejido conectivo y ligamentos', lista(CAMPOS_QUE_CUENTAN.conectivo)],
  ['Los demás sistemas', lista(CAMPOS_QUE_CUENTAN.otro)],
  ['Nombre latino y Notas', 'No cuentan para dar la ficha por completa: se agradecen, no se exigen.'],
]

// ------------------------------------------------------------------- subir

export interface ProblemaDeLaPlanilla {
  /** La fila de la hoja, empezando en 1 como la ve quien abre el Excel; `null` si es de la planilla entera. */
  fila: number | null
  mensaje: string
}

export interface FilaLeida {
  fila: number
  atlasId: string
  original: string | null
  campos: Partial<Record<CampoDeLaFicha, string>>
  /** `null`: la celda está vacía o dice algo que no se entiende, y no cambia nada. */
  oculta: boolean | null
}

export interface LecturaDeLaPlanilla {
  hoja: string
  filas: FilaLeida[]
  problemas: ProblemaDeLaPlanilla[]
  /** Los títulos que se reconocieron, para decírselo a quien sube. */
  reconocidas: string[]
  /** Los títulos que no se reconocieron: se ignoran, y se dice. */
  ignoradas: string[]
}

export class PlanillaSinFormato extends Error {}

const ES_ENCABEZADO = (fila: readonly string[]) => fila.some((celda) => SINONIMOS_DEL_ID.includes(claveDeTitulo(celda)))

/**
 * Entiende la hoja de estructuras de un libro: busca la hoja que tiene la columna
 * «Id del atlas», reconoce las columnas por su título —en cualquier orden y con
 * pequeñas variantes— y devuelve una fila por pieza. No decide nada sobre la base.
 */
export function leerFilasDeLaPlanilla(hojas: readonly HojaLeida[]): LecturaDeLaPlanilla {
  let hoja: HojaLeida | undefined
  let encabezado = -1
  for (const candidata of hojas) {
    const cual = candidata.filas.slice(0, 10).findIndex(ES_ENCABEZADO)
    if (cual >= 0) {
      hoja = candidata
      encabezado = cual
      break
    }
  }
  if (!hoja) {
    throw new PlanillaSinFormato(
      `No encuentro la columna «${TITULO_DEL_ID}» en ninguna hoja. Use la planilla que se descarga de esta pantalla y no cambie la primera fila.`,
    )
  }

  const titulos = hoja.filas[encabezado]
  let columnaDelId = -1
  let columnaDeOculta = -1
  let columnaDelOriginal = -1
  const columnaDeCampo = new Map<CampoDeLaFicha, number>()
  const reconocidas: string[] = []
  const ignoradas: string[] = []
  titulos.forEach((titulo, indice) => {
    const clave = claveDeTitulo(titulo)
    if (clave === '') return
    if (columnaDelId < 0 && SINONIMOS_DEL_ID.includes(clave)) columnaDelId = indice
    else if (columnaDeOculta < 0 && SINONIMOS_DE_OCULTA.includes(clave)) columnaDeOculta = indice
    else if (columnaDelOriginal < 0 && SINONIMOS_DEL_NOMBRE_ORIGINAL.includes(clave)) columnaDelOriginal = indice
    else {
      const campo = CAMPOS_DE_LA_FICHA.find((c) => SINONIMOS_DE_CAMPO[c].includes(clave) && !columnaDeCampo.has(c))
      if (campo) columnaDeCampo.set(campo, indice)
      else {
        ignoradas.push(titulo.trim())
        return
      }
    }
    reconocidas.push(titulo.trim())
  })

  const problemas: ProblemaDeLaPlanilla[] = []
  if (columnaDeCampo.size === 0 && columnaDeOculta < 0) {
    throw new PlanillaSinFormato(
      'La planilla no tiene ninguna columna que llenar (Definición, Origen, Inserción…). Use la que se descarga de esta pantalla.',
    )
  }

  const filas: FilaLeida[] = []
  for (let i = encabezado + 1; i < hoja.filas.length; i += 1) {
    const celdas = hoja.filas[i]
    const numero = i + 1
    const id = normalizarTexto(celdas[columnaDelId]).toUpperCase().replace(/\s+/g, '')
    const campos: Partial<Record<CampoDeLaFicha, string>> = {}
    for (const [campo, columna] of columnaDeCampo) {
      const texto = normalizarTexto(celdas[columna])
      if (texto === '') continue
      if (texto.length > LARGO_MAXIMO_DEL_CAMPO[campo]) {
        problemas.push({
          fila: numero,
          mensaje: `«${ETIQUETA_DEL_CAMPO[campo]}» pasa de ${LARGO_MAXIMO_DEL_CAMPO[campo]} caracteres (tiene ${texto.length}): ese campo no se aplicó, el resto de la fila sí.`,
        })
        continue
      }
      campos[campo] = texto
    }
    const oculta = columnaDeOculta >= 0 ? leerMarcaDeOculta(celdas[columnaDeOculta]) : null
    const original = columnaDelOriginal >= 0 ? normalizarTexto(celdas[columnaDelOriginal]) || null : null
    if (id === '') {
      // Una fila de consulta sin id y sin nada que llenar es relleno de la hoja; con algo escrito, es un dato que se perdería.
      if (Object.keys(campos).length > 0 || oculta !== null) {
        problemas.push({ fila: numero, mensaje: 'Tiene texto pero no tiene «Id del atlas»: no se aplicó.' })
      }
      continue
    }
    filas.push({ fila: numero, atlasId: id, original, campos, oculta })
  }
  return { hoja: hoja.nombre, filas, problemas, reconocidas, ignoradas }
}

// --------------------------------------------------------------------- plan

export interface PiezaDelPlan {
  id: string
  /** Español. */
  nombre: string
  original: string
  sistema: string
  region: string
  lado: LadoDeLaPieza | null
}

export interface ContextoDelPlan {
  /** Las piezas del atlas instalado, por id. */
  piezas: ReadonlyMap<string, PiezaDelPlan>
  /** Las fichas que ya hay, por id del atlas. */
  fichas: ReadonlyMap<string, FilaDeEstructura>
  /** La pareja del otro lado de cada pieza que la tiene (`parejasContralaterales`). */
  parejas: ReadonlyMap<string, string>
}

export interface OpcionesDelPlan {
  /** Reemplazar también lo que ya está escrito. Apagado por omisión. */
  reemplazar: boolean
  /** Aplicar lo de cada pieza también a su pareja del otro lado. */
  alLadoOpuesto: boolean
}

export interface CambioDeCampo {
  campo: CampoDeLaFicha
  antes: string
  despues: string
  /** `nuevo`: estaba vacío. `reemplaza`: tenía otro texto. */
  tipo: 'nuevo' | 'reemplaza'
  /** Si con estas opciones se escribe. Un `reemplaza` sin la casilla puesta no se escribe. */
  aplicado: boolean
}

export type ClaseDeEntrada = 'llena' | 'completa' | 'cambia' | 'igual'

export interface EntradaDelPlan {
  atlasId: string
  nombre: string
  region: string
  /** De dónde sale lo que se aplica: la fila de la planilla o la pareja del otro lado. */
  via: 'planilla' | 'lado-opuesto'
  /** La fila de la hoja de la que sale (en el lado opuesto, la de la pieza de la que se copia). */
  fila: number
  /**
   * `llena`: la ficha no tenía nada escrito. `completa`: tenía algo y se le añaden campos. `cambia`: algún campo ya
   * escrito sería reemplazado. `igual`: la planilla no cambia nada.
   */
  clase: ClaseDeEntrada
  cambios: CambioDeCampo[]
  oculta?: { antes: boolean; despues: boolean; aplicado: boolean }
  /** Campos con texto distinto que **no** se tocan (sin la casilla de reemplazar, o en el lado opuesto, que nunca pisa). */
  noTocados: CampoDeLaFicha[]
}

/** Lo que se escribe, ya decidido. */
export interface EscrituraDelPlan {
  atlasId: string
  campos: Partial<Record<CampoDeLaFicha, string>>
  oculta?: boolean
}

export interface ConteoDelPlan {
  /** Filas de la hoja con un id. */
  filasLeidas: number
  /** Fichas que no tenían nada escrito y se llenan. */
  llenas: number
  /** Fichas con algo escrito a las que se les añaden campos. */
  completan: number
  /** Fichas con algún campo ya escrito que la planilla reemplazaría. */
  cambian: number
  /** Filas que no cambian nada. */
  iguales: number
  /** De las llenas y completas, las que vienen del lado opuesto. */
  delLadoOpuesto: number
  /** Fichas que se escriben con las opciones elegidas. */
  fichasAEscribir: number
  /** Campos (y casillas «No mostrar») que se escriben. */
  camposAEscribir: number
}

export interface PlanDeLaPlanilla {
  entradas: EntradaDelPlan[]
  escrituras: EscrituraDelPlan[]
  conteo: ConteoDelPlan
  problemas: ProblemaDeLaPlanilla[]
  /** Filas cuyo id no existe en el atlas. */
  noEncontradas: { fila: number; id: string }[]
  /** Piezas con lado a las que no se les encontró pareja del otro lado. */
  sinPareja: { atlasId: string; nombre: string }[]
  /** Pares de piezas en los que la planilla trae las dos filas: manda lo que diga cada una, sin copiar. */
  conFilaPropia: number
  /** Cuántas piezas de cada región trae la hoja. */
  porRegion: Map<string, number>
  /** Identifica este plan: si cambia, lo que se vio ya no es lo que se escribiría. */
  huella: string
}

const sinEspacios = (texto: string): string => claveDeTitulo(texto).replace(/ /g, '')

function armarEntrada(
  pieza: PiezaDelPlan,
  ficha: FilaDeEstructura | undefined,
  campos: Partial<Record<CampoDeLaFicha, string>>,
  oculta: boolean | null,
  via: EntradaDelPlan['via'],
  fila: number,
  opciones: OpcionesDelPlan,
): EntradaDelPlan {
  const cambios: CambioDeCampo[] = []
  const noTocados: CampoDeLaFicha[] = []
  for (const campo of CAMPOS_DE_LA_FICHA) {
    const despues = campos[campo]
    if (despues === undefined) continue
    const antes = normalizarTexto(ficha?.[campo])
    if (antes === despues) continue
    if (antes === '') {
      cambios.push({ campo, antes, despues, tipo: 'nuevo', aplicado: true })
    } else if (via === 'lado-opuesto') {
      // El lado opuesto solo rellena huecos: lo que la otra ficha ya tiene es suyo.
      noTocados.push(campo)
    } else {
      cambios.push({ campo, antes, despues, tipo: 'reemplaza', aplicado: opciones.reemplazar })
      if (!opciones.reemplazar) noTocados.push(campo)
    }
  }

  let marca: EntradaDelPlan['oculta']
  if (oculta !== null) {
    const antes = ficha?.oculta === true
    // En el lado opuesto solo se esconde, nunca se devuelve a visible: lo que la otra pieza decidió se respeta.
    if (oculta !== antes && (via === 'planilla' || oculta === true)) marca = { antes, despues: oculta, aplicado: true }
  }

  const hayReemplazo = cambios.some((c) => c.tipo === 'reemplaza')
  const hayNuevo = cambios.some((c) => c.tipo === 'nuevo') || marca !== undefined
  const sinNadaAntes = !CAMPOS_DE_LA_FICHA.some((c) => hayTexto(ficha?.[c]))
  const clase: ClaseDeEntrada = hayReemplazo ? 'cambia' : hayNuevo ? (sinNadaAntes ? 'llena' : 'completa') : 'igual'

  return {
    atlasId: pieza.id,
    nombre: pieza.nombre,
    region: pieza.region,
    via,
    fila,
    clase,
    cambios,
    ...(marca ? { oculta: marca } : {}),
    noTocados,
  }
}

/**
 * Qué escribiría esta planilla sobre las fichas de hoy, con estas opciones. No
 * escribe nada: es lo que enseña la vista previa y lo que luego se aplica.
 */
export function planearPlanilla(
  lectura: LecturaDeLaPlanilla,
  contexto: ContextoDelPlan,
  opciones: OpcionesDelPlan,
): PlanDeLaPlanilla {
  const problemas = [...lectura.problemas]
  const noEncontradas: PlanDeLaPlanilla['noEncontradas'] = []
  const entradas: EntradaDelPlan[] = []
  const filasBuenas = new Map<string, FilaLeida>()
  const porRegion = new Map<string, number>()
  let iguales = 0

  for (const fila of lectura.filas) {
    const pieza = contexto.piezas.get(fila.atlasId)
    if (!pieza) {
      noEncontradas.push({ fila: fila.fila, id: fila.atlasId })
      continue
    }
    // Un id estropeado al copiar apunta a otra pieza, y escribirle la ficha de la de al lado es el error que no se nota.
    if (fila.original !== null && sinEspacios(fila.original) !== sinEspacios(pieza.original)) {
      problemas.push({
        fila: fila.fila,
        mensaje: `El id ${fila.atlasId} es «${pieza.original}» y la fila dice «${fila.original}»: no se aplicó. ¿Se cambió el id?`,
      })
      continue
    }
    const anterior = filasBuenas.get(fila.atlasId)
    if (anterior) {
      problemas.push({
        fila: fila.fila,
        mensaje: `Repite el id ${fila.atlasId} de la fila ${anterior.fila}: se usó la primera y esta no se aplicó.`,
      })
      continue
    }
    filasBuenas.set(fila.atlasId, fila)
    porRegion.set(pieza.region, (porRegion.get(pieza.region) ?? 0) + 1)
  }

  const sinPareja: PlanDeLaPlanilla['sinPareja'] = []
  let conFilaPropia = 0
  for (const fila of filasBuenas.values()) {
    const pieza = contexto.piezas.get(fila.atlasId) as PiezaDelPlan
    const entrada = armarEntrada(pieza, contexto.fichas.get(pieza.id), fila.campos, fila.oculta, 'planilla', fila.fila, opciones)
    if (entrada.clase === 'igual') iguales += 1
    if (entrada.clase !== 'igual' || entrada.noTocados.length > 0) entradas.push(entrada)

    if (!opciones.alLadoOpuesto || pieza.lado === null) continue
    const idDeLaPareja = contexto.parejas.get(pieza.id)
    const pareja = idDeLaPareja ? contexto.piezas.get(idDeLaPareja) : undefined
    if (!pareja) {
      sinPareja.push({ atlasId: pieza.id, nombre: pieza.nombre })
      continue
    }
    // Si la planilla trae una fila para la pareja, manda esa: es lo que quien llenó quiso para ese lado.
    if (filasBuenas.has(pareja.id)) {
      // Cada par se cuenta una vez, no una por cada lado.
      if (pieza.id < pareja.id) conFilaPropia += 1
      continue
    }
    const espejo = armarEntrada(pareja, contexto.fichas.get(pareja.id), fila.campos, fila.oculta, 'lado-opuesto', fila.fila, opciones)
    if (espejo.clase !== 'igual' || espejo.noTocados.length > 0) entradas.push(espejo)
  }

  const escrituras: EscrituraDelPlan[] = []
  let camposAEscribir = 0
  for (const entrada of entradas) {
    const campos: Partial<Record<CampoDeLaFicha, string>> = {}
    for (const cambio of entrada.cambios) if (cambio.aplicado) campos[cambio.campo] = cambio.despues
    const marca = entrada.oculta?.aplicado ? entrada.oculta.despues : undefined
    const n = Object.keys(campos).length + (marca !== undefined ? 1 : 0)
    if (n === 0) continue
    camposAEscribir += n
    escrituras.push({ atlasId: entrada.atlasId, campos, ...(marca !== undefined ? { oculta: marca } : {}) })
  }
  escrituras.sort((a, b) => a.atlasId.localeCompare(b.atlasId))

  const deLaPlanilla = entradas.filter((e) => e.via === 'planilla')
  const delEspejo = entradas.filter((e) => e.via === 'lado-opuesto')
  const cuenta = (lista: EntradaDelPlan[], clase: ClaseDeEntrada) => lista.filter((e) => e.clase === clase).length
  const conteo: ConteoDelPlan = {
    filasLeidas: filasBuenas.size + noEncontradas.length,
    llenas: cuenta(entradas, 'llena'),
    completan: cuenta(entradas, 'completa'),
    cambian: cuenta(deLaPlanilla, 'cambia'),
    iguales,
    delLadoOpuesto: delEspejo.filter((e) => e.clase === 'llena' || e.clase === 'completa').length,
    fichasAEscribir: escrituras.length,
    camposAEscribir,
  }

  return {
    entradas,
    escrituras,
    conteo,
    problemas,
    noEncontradas,
    sinPareja,
    conFilaPropia,
    porRegion,
    huella: huellaDelPlan(entradas, opciones),
  }
}

/**
 * La huella de un plan: un resumen de **todo lo que se vio** en la vista previa —qué
 * campo de qué pieza, con qué texto de antes y cuál de después, y con qué opciones—.
 * Si entre la vista previa y el «Aplicar» alguien escribe una ficha, o la planilla no
 * es la misma, la huella cambia y no se escribe lo que nadie llegó a ver.
 */
function huellaDelPlan(entradas: readonly EntradaDelPlan[], opciones: OpcionesDelPlan): string {
  const resumen = [...entradas]
    .sort((a, b) => a.atlasId.localeCompare(b.atlasId) || a.via.localeCompare(b.via))
    .map((e) => [
      e.atlasId,
      e.via,
      e.clase,
      e.cambios.map((c) => [c.campo, c.tipo, c.aplicado, c.antes, c.despues]),
      e.oculta ? [e.oculta.antes, e.oculta.despues, e.oculta.aplicado] : null,
      e.noTocados,
    ])
  return createHash('sha256')
    .update(JSON.stringify({ opciones: [opciones.reemplazar, opciones.alLadoOpuesto], resumen }))
    .digest('hex')
}

// -------------------------------------------------------------- para la vista

/** Lo que la pantalla necesita ver, acotado: un plan de mil piezas no tiene que viajar entero al navegador. */
export interface VistaDelPlan {
  conteo: ConteoDelPlan
  huella: string
  hoja: string
  reconocidas: string[]
  ignoradas: string[]
  /** Las fichas que reemplazarían algo, con antes y después de cada campo. */
  cambian: {
    atlasId: string
    nombre: string
    fila: number
    cambios: { campo: string; antes: string; despues: string; tipo: 'nuevo' | 'reemplaza'; aplicado: boolean }[]
  }[]
  /** Las fichas que se llenan o se completan. */
  llenan: { atlasId: string; nombre: string; campos: string[]; delLadoOpuesto: boolean }[]
  /** Lo que no se toca por tener ya otro texto (con la casilla apagada, o en el lado opuesto). */
  noTocados: number
  problemas: ProblemaDeLaPlanilla[]
  noEncontradas: { fila: number; id: string }[]
  sinPareja: string[]
  conFilaPropia: number
  regiones: { region: string; piezas: number }[]
  /** Cuántos elementos de cada lista se recortaron para no mandar miles al navegador. */
  recortado: { cambian: number; llenan: number; problemas: number; noEncontradas: number; sinPareja: number }
}

const TOPES_DE_LA_VISTA = { cambian: 200, llenan: 300, problemas: 100, noEncontradas: 50, sinPareja: 100 }

export function vistaDelPlan(plan: PlanDeLaPlanilla, lectura: LecturaDeLaPlanilla): VistaDelPlan {
  const cambian = plan.entradas.filter((e) => e.clase === 'cambia')
  const llenan = plan.entradas.filter((e) => e.clase === 'llena' || e.clase === 'completa')
  const recorta = <T>(lista: T[], tope: number) => lista.slice(0, tope)
  return {
    conteo: plan.conteo,
    huella: plan.huella,
    hoja: lectura.hoja,
    reconocidas: lectura.reconocidas,
    ignoradas: lectura.ignoradas,
    cambian: recorta(cambian, TOPES_DE_LA_VISTA.cambian).map((e) => ({
      atlasId: e.atlasId,
      nombre: e.nombre,
      fila: e.fila,
      cambios: e.cambios.map((c) => ({
        campo: ETIQUETA_DEL_CAMPO[c.campo],
        antes: c.antes,
        despues: c.despues,
        tipo: c.tipo,
        aplicado: c.aplicado,
      })),
    })),
    llenan: recorta(llenan, TOPES_DE_LA_VISTA.llenan).map((e) => ({
      atlasId: e.atlasId,
      nombre: e.nombre,
      campos: [
        ...e.cambios.filter((c) => c.aplicado).map((c) => ETIQUETA_DEL_CAMPO[c.campo]),
        ...(e.oculta?.aplicado ? [TITULO_DE_OCULTA] : []),
      ],
      delLadoOpuesto: e.via === 'lado-opuesto',
    })),
    noTocados: plan.entradas.reduce((n, e) => n + e.noTocados.length, 0),
    problemas: recorta(plan.problemas, TOPES_DE_LA_VISTA.problemas),
    noEncontradas: recorta(plan.noEncontradas, TOPES_DE_LA_VISTA.noEncontradas),
    sinPareja: recorta(plan.sinPareja, TOPES_DE_LA_VISTA.sinPareja).map((p) => p.nombre),
    conFilaPropia: plan.conFilaPropia,
    regiones: [...plan.porRegion].map(([region, piezas]) => ({ region, piezas })),
    recortado: {
      cambian: Math.max(0, cambian.length - TOPES_DE_LA_VISTA.cambian),
      llenan: Math.max(0, llenan.length - TOPES_DE_LA_VISTA.llenan),
      problemas: Math.max(0, plan.problemas.length - TOPES_DE_LA_VISTA.problemas),
      noEncontradas: Math.max(0, plan.noEncontradas.length - TOPES_DE_LA_VISTA.noEncontradas),
      sinPareja: Math.max(0, plan.sinPareja.length - TOPES_DE_LA_VISTA.sinPareja),
    },
  }
}

