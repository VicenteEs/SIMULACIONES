/**
 * La preparación «pierna derecha» del atlas, con la tibia partida, dentro del
 * caso de prueba.
 *
 *   npx tsx scripts/pierna-derecha-en-el-caso.ts             # simula: dice qué cambiaría
 *   npx tsx scripts/pierna-derecha-en-el-caso.ts --aplicar   # lo escribe
 *
 * Otras opciones:
 *
 *   --preparacion "<nombre>"   otra preparación (por omisión, «pierna derecha»)
 *   --caso "<nombre>"          otro caso (por omisión, el de scripts/caso-de-prueba.ts)
 *
 * Lo pidió el traumatólogo con estas palabras: «actualmente tengo uno llamado
 * pierna derecha, quiero que ese esté en el caso de prueba». La preparación
 * existe solo en la base del servidor, así que esto no se puede hacer desde el
 * portátil de desarrollo: se ejecuta allí, en la carpeta del proyecto, y lee la
 * base de `DATABASE_URI` del `.env` de esa máquina.
 *
 * Qué hace, en orden, y en cada paso para sin tocar nada si algo no cuadra:
 *
 *  1. Busca la preparación por su nombre, sin distinguir mayúsculas ni tildes.
 *     Si no hay ninguna, o hay varias, lista las que hay.
 *  2. Comprueba que incluye la tibia derecha y la exporta con la misma función
 *     que el botón del taller (`exportarPreparacion`), partida con un corte
 *     sacado de la clasificación AO del caso (`corteParaLaFractura`).
 *  3. Pone ese modelo en el caso: rellena las piezas con la misma lógica que el
 *     botón «Rellenar desde el modelo», traduce lo que ve cada paso de los
 *     objetos viejos a los nuevos por su papel (`traducirMuestra`) y conserva el
 *     desplazamiento inicial y las tolerancias.
 *
 * **Por omisión simula.** Solo escribe con `--aplicar`. Y simular no es un `if`
 * delante de cada escritura, que se olvida en la siguiente que alguien añada: la
 * base que recibe todo el guion en simulación es una envoltura que no deja
 * escribir nada (`baseQueRegistra`).
 *
 * **Se puede ejecutar las veces que haga falta.** Cada pasada exporta primero en
 * memoria, y un modelo ya creado solo se reutiliza si su archivo es, byte a byte,
 * el que sale hoy (`modeloReutilizable`): así no se crea otro igual, y tampoco
 * se deja en el caso uno viejo cuando cambió lo que produce la exportación. Las
 * piezas se rellenan sin duplicar filas. Si el caso ya está como tiene que
 * estar, lo dice y no escribe.
 *
 * **No imprime secretos.** Todo lo que sale por pantalla pasa por
 * `sinSecretos`, errores de la base incluidos.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { Payload } from 'payload'
import { nombreEnEspanol, sinTildes } from '../src/atlas/nombres'
import {
  piezasHuerfanas,
  propuestasDelModelo,
  quitarPieza,
  rellenarDesdeElModelo,
  type PiezaEnEdicion,
  type PropuestaDelModelo,
} from '../src/lib/piezasDelCaso'
import { describirCorte, normalizarCorte, type CorteDeHueso } from '../src/lib/planoDeCorte'

// Solo importaciones sin efectos arriba: las que leen el entorno al cargarse
// —la configuración de Payload, las colecciones que arrastra
// `exportarPreparacion`— se importan dentro de las funciones, después de cargar
// el `.env`. Es lo que explica `scripts/caso-de-prueba.ts`: las importaciones
// estáticas se elevan por encima de cualquier línea del archivo, y Payload leería
// su configuración antes de que las variables existieran.

/** La preparación que nombró el traumatólogo. */
export const PREPARACION_POR_OMISION = 'pierna derecha'

/**
 * El nombre del caso que siembra `scripts/caso-de-prueba.ts`.
 *
 * Copiado, no importado: aquel guion se ejecuta al importarlo (termina con
 * `void principal()` y un `process.exit`), así que leerle la constante sería
 * sembrar el caso de nuevo. Si allí cambia el nombre, aquí no se encuentra el
 * caso y se listan los que hay, que es un fallo que se ve.
 */
export const CASO_DE_PRUEBA = 'Fractura de diáfisis tibial · clavo endomedular'

/**
 * Milímetros por unidad de un modelo exportado del atlas.
 *
 * El atlas viene en metros (`PiezaDelAtlas.caja`) y `exportarPreparacion` no
 * escala: cada unidad del archivo es un metro.
 */
export const MILIMETROS_POR_UNIDAD_DEL_ATLAS = 1000

/** El hueso que se parte, tal como lo nombra la traducción del atlas. */
const TIBIA_DERECHA = 'Tibia derecha'

/**
 * El código AO de la diáfisis tibial. El corte se pone a media diáfisis, y en
 * cualquier otro segmento ese sitio sería otra fractura que la que dice el caso.
 */
const DIAFISIS_TIBIAL = '42'

/** Lo que devuelve el `create` simulado como identificador del modelo nuevo. */
export const ID_SIMULADO = '(nuevo)'

/** Un error que el guion explica y que no es un fallo del programa. */
export class ParadaDelGuion extends Error {}

// ------------------------------------------------------------------ nombres

/**
 * Un nombre tal como se compara: sin tildes, sin mayúsculas y con los espacios
 * sueltos colapsados.
 *
 * «Pierna  Derecha» escrito en el taller y «pierna derecha» dicho en un correo
 * son la misma preparación; exigir la grafía exacta haría fallar el guion en el
 * servidor por una mayúscula que nadie ve.
 */
export function normalizarNombre(texto: unknown): string {
  return sinTildes(String(texto ?? ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

interface DocConNombre {
  id: string | number
  nombre?: unknown
}

/**
 * El único documento que se llama así, o por qué no hay uno.
 *
 * Con varios no se elige: coger el primero o el más reciente es decidir por el
 * traumatólogo cuál de sus dos «pierna derecha» va al caso, y la equivocada no
 * da ningún error, da un caso con otra pierna. Se listan todos para que decida.
 */
export function elegirPorNombre<T extends DocConNombre>(
  docs: T[],
  buscado: string,
  que: { singular: string; plural: string },
): T {
  const clave = normalizarNombre(buscado)
  const iguales = docs.filter((d) => normalizarNombre(d.nombre) === clave)
  if (iguales.length === 1) return iguales[0]

  const lista = (de: T[]) =>
    de.length === 0
      ? '  (ninguna)'
      : de.map((d) => `  #${d.id}  «${String(d.nombre ?? '')}»`).join('\n')
  if (iguales.length === 0) {
    throw new ParadaDelGuion(
      `No hay ${que.singular} que se llame «${buscado}» (sin distinguir mayúsculas ni tildes). ` +
        `No se ha tocado nada.\n${que.plural}:\n${lista(docs)}`,
    )
  }
  throw new ParadaDelGuion(
    `Hay ${iguales.length} ${que.plural.toLowerCase()} que se llaman «${buscado}», y no elijo por usted. ` +
      `Cambie el nombre de las que sobren y vuelva a ejecutarlo. No se ha tocado nada.\n${lista(iguales)}`,
  )
}

// -------------------------------------------------------------------- corte

export interface Fractura {
  hueso?: { codigo?: unknown; nombre?: unknown } | null
  clasificacion?: { codigo?: unknown; nombre?: unknown; tipo?: unknown } | null
}

/**
 * El corte que corresponde a la fractura del caso.
 *
 * ## Qué dice la clasificación
 *
 * En la diáfisis, AO distingue tres simples por la forma del trazo, y el caso de
 * prueba es la del medio (42-A2):
 *
 *  - **A3, transversa**: trazo a menos de 30° de la perpendicular al eje. Un
 *    corte transversal, 0°.
 *  - **A2, oblicua**: a 30° o más. Un corte de 45°: lejos del borde de los 30°,
 *    donde una oblicua y una transversa ya se discuten, y lejos del tope de 60°
 *    de los mandos, que es donde el corte deja de ser una oblicua y pasa a ser
 *    una lámina.
 *  - **A1, espiroidea**: no es un plano y un corte plano no la hace. Se aproxima
 *    con la misma oblicua de 45° y se avisa: el trazo que ve el residente es
 *    recto, y eso no es lo que describe el caso.
 *
 * Las de tipo B y C —en cuña, complejas— dejan tres fragmentos o más. Un corte
 * solo da dos, y el caso solo sabe mover uno; partir la tibia en dos y llamarlo
 * cuña sería enseñar otra fractura. Se para.
 *
 * El patrón se lee del nombre de la clasificación, que es lo que el traumatólogo
 * escribió en el catálogo, y si el nombre no dice ninguno, del número del código,
 * que en la diáfisis AO fija igual.
 *
 * ## Dónde, hacia qué cara y qué se mueve
 *
 * - A media diáfisis (50 %): el caso es de diáfisis (42) y no dice más. A esa
 *   altura, una oblicua de 45° sobre una tibia de adulto sube y baja poco más de
 *   un centímetro, y no roza ninguna metáfisis.
 * - Más proximal por la cara **lateral** (90°): la consola abre el caso mirando la
 *   pierna de frente, y así el trazo se ve oblicuo desde el primer momento. Por la
 *   cara anterior (0°) se vería transversal de frente y oblicuo solo al girar la
 *   cámara, y un residente que no gira no ve la fractura que se le describe.
 * - Se mueve el fragmento **distal**, que es el que se reduce en quirófano y el
 *   que el caso ya movía (`tibia_distal`).
 */
export function corteParaLaFractura(
  fractura: Fractura,
  pieza: string,
): { corte: CorteDeHueso; porque: string; avisos: string[] } {
  const clasificacion = fractura.clasificacion
  if (!clasificacion) {
    throw new ParadaDelGuion(
      'El caso no tiene clasificación AO, y de ella sale cómo partir la tibia. No se ha tocado nada.',
    )
  }
  const codigo = String(clasificacion.codigo ?? '').trim().toUpperCase()
  const nombre = String(clasificacion.nombre ?? '').trim()
  const tipo = String(clasificacion.tipo ?? codigo.charAt(0)).trim().toUpperCase()
  const dicha = `${codigo}${nombre ? ` · ${nombre}` : ''}`

  const hueso = String(fractura.hueso?.codigo ?? '').trim()
  if (hueso !== DIAFISIS_TIBIAL) {
    throw new ParadaDelGuion(
      `El caso es del hueso AO «${hueso || 'sin código'}», y este guion parte la diáfisis tibial (${DIAFISIS_TIBIAL}). ` +
        'No se ha tocado nada.',
    )
  }
  if (tipo !== 'A') {
    throw new ParadaDelGuion(
      `La fractura del caso es ${dicha}, de tipo ${tipo || 'desconocido'}: deja más de dos fragmentos, ` +
        'y un corte solo da dos. No se ha tocado nada.',
    )
  }

  const patron = normalizarNombre(nombre)
  const numero = codigo.slice(1)
  const avisos: string[] = []
  let inclinacion: number
  let forma: string
  if (patron.includes('transvers') || (!/oblicu|espiroid/.test(patron) && numero === '3')) {
    inclinacion = 0
    forma = 'transversa: corte transversal'
  } else if (patron.includes('oblicu') || (!patron.includes('espiroid') && numero === '2')) {
    inclinacion = 45
    forma = 'oblicua: corte oblicuo de 45°, a 30° o más como pide AO y lejos de ese borde'
  } else if (patron.includes('espiroid') || numero === '1') {
    inclinacion = 45
    forma = 'espiroidea: se aproxima con un corte oblicuo de 45°'
    avisos.push(
      'Una fractura espiroidea no es un plano: el trazo del modelo es una oblicua recta, ' +
        'y el caso describe una espiral.',
    )
  } else {
    throw new ParadaDelGuion(
      `No sé qué trazo tiene la fractura ${dicha}: ni su nombre ni su código dicen si es ` +
        'transversa, oblicua o espiroidea. No se ha tocado nada.',
    )
  }

  const corte = normalizarCorte({
    pieza,
    posicion: 50,
    inclinacion,
    giro: 90,
    fragmento: 'distal',
  })!
  return {
    corte,
    porque: `la fractura es ${dicha}, simple y ${forma}, a media diáfisis; se reduce el distal`,
    avisos,
  }
}

// ------------------------------------------------------------ el caso nuevo

/**
 * Lo que ve un paso, pasado de los objetos del modelo viejo a los del nuevo.
 *
 * Por su **papel**, no por su nombre: el modelo viejo tenía `piel`, `musculo`,
 * `tibia_proximal` y `tibia_distal`, y el exportado del atlas tiene `Piel`,
 * `Musculos`, `Tejido_conectivo`, `Arterias`… y los dos trozos de la tibia. No
 * hay nombre que case, y tampoco hace falta: el paso que enseñaba la piel tiene
 * que seguir enseñando la piel, el que enseñaba el hueso fijo, todo lo que en el
 * modelo nuevo es hueso fijo —el trozo proximal y el resto del esqueleto—, y el
 * que enseñaba el fragmento, el fragmento.
 *
 * Tres reglas:
 *
 *  - Un nodo que **ya existe en el modelo nuevo** se queda tal cual. Es lo que
 *    hace que ejecutar el guion dos veces no cambie nada la segunda, y lo que
 *    respeta un paso que el traumatólogo ya afinó a mano contra el modelo nuevo:
 *    si dejó solo el trozo proximal, no se le vuelve a añadir el esqueleto.
 *  - Un nodo viejo se sustituye por todos los del modelo nuevo con su mismo
 *    papel, en el orden de las piezas, sin repetir.
 *  - Un nodo viejo cuyo papel no se conoce, o cuyo papel ya no tiene nadie en el
 *    modelo nuevo, se pierde y se devuelve en `perdidos` para decirlo. No se
 *    calla: un paso que se queda sin lo que enseñaba hereda lo del anterior
 *    (`declaracionDelPaso`), y enseña otra cosa sin ningún error.
 *
 * `rolesViejos` son los papeles de las piezas del caso ANTES de rellenarlas: es
 * lo único que dice qué era `tibia_proximal`, porque en las piezas nuevas ya no
 * está.
 */
export function traducirMuestra(
  muestra: string[],
  rolesViejos: ReadonlyMap<string, string>,
  piezasNuevas: PiezaEnEdicion[],
  nodosDelModelo: readonly string[],
): { muestra: string[]; perdidos: string[] } {
  const enElModelo = new Set(nodosDelModelo)
  const salida: string[] = []
  const perdidos: string[] = []
  const poner = (nodo: string) => {
    if (!salida.includes(nodo)) salida.push(nodo)
  }

  for (const nodo of muestra) {
    if (enElModelo.has(nodo)) {
      poner(nodo)
      continue
    }
    const rol = rolesViejos.get(nodo)
    const conEseRol = rol
      ? piezasNuevas
          .filter((p) => p.rol === rol && typeof p.nodo === 'string' && enElModelo.has(p.nodo))
          .map((p) => p.nodo as string)
      : []
    if (conEseRol.length === 0) {
      perdidos.push(rol ? `${nodo} (${rol})` : nodo)
      continue
    }
    conEseRol.forEach(poner)
  }
  return { muestra: salida, perdidos }
}

/** Un paso tal como sale de la base con `depth: 0`. */
export interface PasoLeido {
  id?: string
  titulo?: unknown
  objetivo?: unknown
  muestra?: { id?: string; nodo?: unknown }[] | null
  [campo: string]: unknown
}

/** Lo que el guion lee de un caso. */
export interface CasoLeido {
  id: string | number
  nombre?: unknown
  _status?: unknown
  modelo?: unknown
  milimetrosPorUnidad?: unknown
  ejeLargo?: unknown
  piezas?: PiezaEnEdicion[] | null
  pasos?: PasoLeido[] | null
  desplazamientoInicial?: Record<string, unknown> | null
  hueso?: unknown
  clasificacion?: unknown
}

/** El modelo que va al caso y lo que se leyó de su archivo. */
export interface ModeloParaElCaso {
  id: string | number
  /** Los objetos con malla y nombre, como `nodosDelModelo` del lienzo. */
  nodos: string[]
  /** Lo que cada objeto dice de sí mismo, como lo lee el taller de piezas. */
  propuestas: PropuestaDelModelo[]
}

export interface PlanDelCaso {
  /** Lo que se escribiría en el caso: solo los campos que el guion toca. */
  datos: {
    modelo: string | number
    milimetrosPorUnidad: number
    ejeLargo: string
    piezas: PiezaEnEdicion[]
    pasos: PasoLeido[]
  }
  hayCambios: boolean
  /** Líneas legibles de lo que cambia y de lo que se conserva. */
  lineas: string[]
  avisos: string[]
}

const idDe = (valor: unknown): string =>
  valor && typeof valor === 'object' && 'id' in valor
    ? String((valor as { id: unknown }).id)
    : String(valor ?? '')

const nodosDeLaMuestra = (paso: PasoLeido): string[] =>
  (paso.muestra ?? []).map((m) => (typeof m?.nodo === 'string' ? m.nodo : '')).filter(Boolean)

const firmaDePiezas = (piezas: PiezaEnEdicion[]) =>
  JSON.stringify(piezas.map((p) => [p.nodo ?? '', p.rol ?? '', p.etiqueta ?? '']))

/** Un número como se escribe en español: coma decimal. */
const cifra = (valor: unknown): string =>
  typeof valor === 'number' && Number.isFinite(valor) ? String(valor).replace('.', ',') : '—'

/**
 * Lo que hay que escribir en el caso para que use el modelo nuevo, sin escribirlo.
 *
 * Es puro a propósito: toda la decisión está aquí y se prueba sin base, y lo
 * único que queda fuera es leer y escribir.
 *
 * ## Las piezas
 *
 * Primero se quitan las filas que nombran objetos que el modelo nuevo no trae
 * (`piezasHuerfanas`), y después se rellena con `rellenarDesdeElModelo`, que es
 * lo que hace el botón. El orden importa: con `tibia_distal` todavía en la lista
 * como fragmento, el botón haría entrar el trozo distal nuevo como hueso fijo
 * —su regla de un solo fragmento— y el caso movería un objeto que ya no existe.
 *
 * Al terminar tiene que haber exactamente un fragmento y ser el que el archivo
 * marca como tal. Si no, se para: un caso que mueve otro trozo no da error, da
 * una reducción de otra fractura.
 *
 * ## Las medidas
 *
 * El desplazamiento inicial y las tolerancias del paso de reducción **no se
 * tocan**, y no es olvido. El caso los guarda en milímetros y grados, y la
 * consola los pasa a unidades del archivo con `milimetrosPorUnidad` al abrirlo
 * (`ConsolaQuirurgica`, `mm / escalaMm`). Lo que depende de la escala del modelo
 * es ese número, no los milímetros: 12,5 mm son 12,5 mm en un modelo en metros y
 * en uno en milímetros. Convertirlos a la vez que la escala los contaría dos
 * veces. El modelo de prueba y el atlas están en metros, así que hoy la escala
 * se queda en 1000; si el caso trajera otra, se pone la del atlas y los
 * milímetros siguen siendo los mismos.
 *
 * El eje largo se deja en `y`: el atlas está en posición anatómica, de pie, y la
 * tibia corre por la vertical.
 */
export function planDelCaso(caso: CasoLeido, modelo: ModeloParaElCaso): PlanDelCaso {
  const lineas: string[] = []
  const avisos: string[] = []
  const piezasViejas = Array.isArray(caso.piezas) ? caso.piezas : []

  // Las piezas: sin las que ya no existen, y rellenadas como el botón.
  let conservadas = piezasViejas
  for (const nodo of piezasHuerfanas(piezasViejas, modelo.nodos)) {
    conservadas = quitarPieza(conservadas, nodo)
  }
  const { piezas } = rellenarDesdeElModelo(conservadas, modelo.propuestas)

  const fragmentos = piezas.filter((p) => p.rol === 'fragmento').map((p) => String(p.nodo))
  const delArchivo = modelo.propuestas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)
  if (fragmentos.length !== 1 || delArchivo.length !== 1 || fragmentos[0] !== delArchivo[0]) {
    throw new ParadaDelGuion(
      `Las piezas del caso quedarían con el fragmento en «${fragmentos.join(', ') || 'ninguno'}» ` +
        `y el archivo marca como fragmento «${delArchivo.join(', ') || 'ninguno'}». ` +
        'Revise en el panel qué pieza es el fragmento móvil y vuelva a ejecutarlo. No se ha tocado nada.',
    )
  }

  // Lo que ve cada paso, por papel.
  const rolesViejos = new Map(
    piezasViejas
      .filter((p) => typeof p.nodo === 'string' && typeof p.rol === 'string')
      .map((p) => [p.nodo as string, p.rol as string]),
  )
  const pasosViejos = Array.isArray(caso.pasos) ? caso.pasos : []
  let cambianLosPasos = false
  const lineasDePasos: string[] = []
  const pasos = pasosViejos.map((paso, i) => {
    const antes = nodosDeLaMuestra(paso)
    const titulo = String(paso.titulo ?? `Paso ${i + 1}`)
    if (antes.length === 0) return paso
    const { muestra, perdidos } = traducirMuestra(antes, rolesViejos, piezas, modelo.nodos)
    for (const perdido of perdidos) {
      avisos.push(`El paso «${titulo}» enseñaba «${perdido}», y en el modelo nuevo no hay nada con ese papel.`)
    }
    if (muestra.length === 0) {
      avisos.push(
        `El paso «${titulo}» se queda sin nada que enseñar, así que heredará lo del paso anterior.`,
      )
    }
    if (JSON.stringify(muestra) === JSON.stringify(antes)) return paso
    cambianLosPasos = true
    lineasDePasos.push(`    ${i + 1}. ${titulo}`)
    lineasDePasos.push(`       antes:   ${antes.join(', ')}`)
    lineasDePasos.push(`       después: ${muestra.join(', ') || '(vacía)'}`)
    // Se conservan los identificadores de fila de los nodos que siguen: la fila
    // es la misma, y renumerarla sería un cambio que no ha pedido nadie.
    const filas = paso.muestra ?? []
    return {
      ...paso,
      muestra: muestra.map((nodo) => {
        const fila = filas.find((f) => f?.nodo === nodo)
        return fila?.id ? { id: fila.id, nodo } : { nodo }
      }),
    }
  })

  const escalaVieja = caso.milimetrosPorUnidad
  const ejeViejo = caso.ejeLargo
  const datos = {
    modelo: modelo.id,
    milimetrosPorUnidad: MILIMETROS_POR_UNIDAD_DEL_ATLAS,
    ejeLargo: 'y',
    piezas,
    pasos,
  }

  const cambiaElModelo = idDe(caso.modelo) !== String(modelo.id)
  const cambiaLaEscala = escalaVieja !== MILIMETROS_POR_UNIDAD_DEL_ATLAS
  const cambiaElEje = ejeViejo !== 'y'
  const cambianLasPiezas = firmaDePiezas(piezasViejas) !== firmaDePiezas(piezas)

  const marca = (cambia: boolean) => (cambia ? '~' : '=')
  lineas.push(
    `  ${marca(cambiaElModelo)} modelo: #${idDe(caso.modelo) || '(ninguno)'} → #${modelo.id}`,
  )
  lineas.push(
    `  ${marca(cambiaLaEscala)} milímetros por unidad: ${cifra(escalaVieja)} → ${MILIMETROS_POR_UNIDAD_DEL_ATLAS}` +
      ' (el atlas está en metros)',
  )
  if (cambiaElEje) lineas.push(`  ~ eje largo: ${String(ejeViejo ?? '—')} → y`)

  if (cambianLasPiezas) {
    lineas.push('  ~ piezas:')
    const nuevos = new Set(piezas.map((p) => String(p.nodo)))
    const viejos = new Set(piezasViejas.map((p) => String(p.nodo)))
    for (const p of piezasViejas) {
      if (!nuevos.has(String(p.nodo))) {
        lineas.push(`      - ${String(p.nodo)} (${String(p.rol)}): el modelo nuevo no lo trae`)
      }
    }
    for (const p of piezas) {
      const signo = viejos.has(String(p.nodo)) ? '=' : '+'
      lineas.push(`      ${signo} ${String(p.nodo)} · ${String(p.etiqueta ?? '')} · ${String(p.rol)}`)
    }
  } else {
    lineas.push(`  = piezas: ${piezas.length}, sin cambios`)
  }

  if (cambianLosPasos) {
    lineas.push('  ~ lo que ve cada paso:')
    lineas.push(...lineasDePasos)
  } else {
    lineas.push('  = lo que ve cada paso: sin cambios')
  }

  const d = caso.desplazamientoInicial ?? {}
  lineas.push(
    `  = desplazamiento inicial: ${cifra(d.x)} / ${cifra(d.y)} / ${cifra(d.z)} mm, ` +
      `${cifra(d.giroX)} / ${cifra(d.giroY)} / ${cifra(d.giroZ)}°` +
      ' (en milímetros: no depende de la escala del archivo)',
  )
  for (const paso of pasosViejos.filter((p) => p.objetivo === 'reduccion')) {
    lineas.push(
      `  = tolerancias de «${String(paso.titulo ?? '')}»: desplazamiento ${cifra(paso.toleranciaDesplazamiento)} mm, ` +
        `diástasis ${cifra(paso.toleranciaDiastasis)} mm, angulación ${cifra(paso.toleranciaAngulacion)}°`,
    )
  }

  return {
    datos,
    hayCambios: cambiaElModelo || cambiaLaEscala || cambiaElEje || cambianLasPiezas || cambianLosPasos,
    lineas,
    avisos,
  }
}

// ---------------------------------------------------------------- la base

/**
 * Lo que el guion usa de Payload. Tipado a mano y suelto, a propósito: los tipos
 * generados obligarían a una conversión por colección, y el guion no gana nada
 * con ellos.
 */
export interface BaseDelGuion {
  find: (argumentos: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
  findByID: (argumentos: Record<string, unknown>) => Promise<Record<string, unknown>>
  create: (argumentos: Record<string, unknown>) => Promise<Record<string, unknown>>
  update: (argumentos: Record<string, unknown>) => Promise<Record<string, unknown>>
  collections?: Record<string, { config?: { upload?: { staticDir?: string } | boolean } }>
}

/** Las operaciones de la API local de Payload que escriben, además de `create`. */
const OTRAS_ESCRITURAS = new Set([
  'update',
  'delete',
  'duplicate',
  'updateGlobal',
  'restoreVersion',
  'restoreGlobalVersion',
  'db',
])

/**
 * La base con las escrituras registradas y, al simular, bloqueadas.
 *
 * Es lo que hace que `--simular` no pueda escribir, en vez de confiar en que cada
 * escritura del guion vaya detrás de un `if`. Se usa la MISMA función de
 * exportar que con `--aplicar`, pasándole esta envoltura: así lo que se imprime
 * al simular es lo que saldría de verdad —nombres de nodo, papeles, peso—, y no
 * una estimación hecha por otro camino.
 *
 * - `create`, al simular, no llega a la base: devuelve un documento con
 *   `ID_SIMULADO`. Con `--aplicar` pasa. En los dos casos guarda lo que se iba a
 *   crear —datos y archivo—, que es de donde el guion lee los nodos del modelo
 *   nuevo y lo que compara con los modelos que ya hay.
 * - Cualquier otra escritura, al simular, es un error. Hoy el guion no llama a
 *   ninguna sin comprobar antes el modo; si mañana alguien añade una y se olvida,
 *   la simulación falla en vez de escribir.
 * - Las lecturas pasan tal cual, y enlazadas a la instancia real: Payload se
 *   llama a sí mismo por dentro, y esas llamadas no deben ver la envoltura.
 */
export function baseQueRegistra<T extends object>(
  base: T,
  aplicar: boolean,
): {
  base: T
  escrituras: string[]
  archivo: () => Buffer | null
  creacion: () => Record<string, unknown> | null
} {
  const escrituras: string[] = []
  let archivo: Buffer | null = null
  let creacion: Record<string, unknown> | null = null
  const envoltura = new Proxy(base, {
    get(objetivo, clave) {
      if (clave === 'create') {
        return async (argumentos: Record<string, unknown>) => {
          escrituras.push(`create ${String(argumentos.collection)}`)
          creacion = argumentos
          const subido = (argumentos.file as { data?: Uint8Array } | undefined)?.data
          if (subido) archivo = Buffer.from(subido)
          if (aplicar) {
            return (objetivo as unknown as BaseDelGuion).create(argumentos)
          }
          return { ...((argumentos.data as object) ?? {}), id: ID_SIMULADO }
        }
      }
      if (typeof clave === 'string' && OTRAS_ESCRITURAS.has(clave)) {
        if (!aplicar) {
          throw new Error(`Se intentó «${clave}» durante la simulación, y al simular no se escribe nada.`)
        }
        escrituras.push(clave)
      }
      const valor = Reflect.get(objetivo, clave, objetivo)
      return typeof valor === 'function' ? valor.bind(objetivo) : valor
    },
  })
  return { base: envoltura, escrituras, archivo: () => archivo, creacion: () => creacion }
}

/**
 * Quita de un texto todo lo que pueda ser un secreto antes de imprimirlo.
 *
 * Un error de conexión de PostgreSQL puede traer la cadena de conexión entera,
 * contraseña incluida, y este guion se ejecuta en el servidor con la salida a la
 * vista de quien esté mirando la pantalla o de un registro. Se tapan dos cosas:
 * los valores de las variables del entorno con pinta de secreto, y cualquier
 * credencial escrita dentro de una URL (`usuario:clave@`), venga de donde venga.
 */
export function sinSecretos(
  texto: string,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): string {
  let limpio = texto
  for (const [nombre, valor] of Object.entries(entorno)) {
    if (!valor || valor.length < 6) continue
    if (!/URI|URL|SECRET|PASSWORD|CLAVE|TOKEN|KEY/i.test(nombre)) continue
    limpio = limpio.split(valor).join('***')
  }
  return limpio.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
}

// --------------------------------------------------------------- el modelo

/** Los nodos de un archivo `.glb`, leídos como los lee el taller de piezas al abrirlo. */
async function leerElArchivo(bytes: Buffer): Promise<{ nodos: string[]; propuestas: PropuestaDelModelo[] }> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  // `datosDeLosNodos` es la función del lienzo que usa el botón: recorrer la
  // escena por otro camino podría leer un nodo que el botón no ve, o al revés.
  const { datosDeLosNodos } = await import('../src/components/simulador/LienzoQuirurgico')
  const bufer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const gltf = await new GLTFLoader().parseAsync(bufer, '')
  const datos = datosDeLosNodos(gltf.scene)
  return { nodos: datos.map((d) => d.nodo), propuestas: propuestasDelModelo(datos) }
}

/**
 * Dónde guarda Payload el archivo de un modelo.
 *
 * `staticDir` relativo se resuelve contra la carpeta desde la que corre el
 * proceso, que es lo que hace Payload al guardar (`generateFileData` lo usa tal
 * cual), así que este guion tiene que lanzarse desde la carpeta del proyecto,
 * igual que el servidor.
 */
function rutaDelArchivo(base: BaseDelGuion, filename: unknown): string | null {
  const upload = base.collections?.['modelos-3d']?.config?.upload
  const directorio = typeof upload === 'object' ? upload.staticDir : undefined
  if (!directorio || typeof filename !== 'string' || !filename) return null
  return isAbsolute(directorio) ? join(directorio, filename) : resolve(process.cwd(), directorio, filename)
}

/**
 * Un modelo ya exportado por este guion que sirve tal cual, si lo hay.
 *
 * Es la mitad de la idempotencia: sin esto, cada ejecución crearía otro modelo
 * igual. Un modelo sirve si es de esta preparación, de esta versión del atlas y
 * con este mismo corte —las tres cosas las escribe `exportarPreparacion` en las
 * notas— y, sobre todo, si **su archivo en el disco es byte a byte `bytes`**, lo
 * que acaba de salir de exportar en memoria.
 *
 * ## Por qué se compara el archivo y no basta con las notas
 *
 * Antes se decidía por las notas y por una fecha: el modelo tenía que haberse
 * creado después del último guardado de la preparación. Ninguna de las dos mira
 * lo que hay dentro. La exportación cambia sin que cambien ni la versión del
 * atlas ni la preparación cuando se añade una corrección de sistema
 * (`src/atlas/correcciones-de-sistema.json`: el tibial anterior y el posterior
 * salían fundidos con el esqueleto) o cuando se arregla el exportador, y en esos
 * dos casos el guion reutilizaba el modelo viejo y decía «El caso ya está así».
 * La única salida era volver a guardar la preparación a mano para mover la
 * fecha, un truco que nadie iba a recordar en el servidor. La exportación es
 * determinista —mismas piezas, mismo atlas, mismo corte, mismos bytes—, así que
 * comparar el archivo responde exactamente a la pregunta que importa: ¿es este
 * el modelo que saldría hoy?
 *
 * La fecha se quitó en vez de sumarse: con el archivo comparado ya no aporta
 * nada, y solo servía para crear un modelo igual cada vez que el traumatólogo
 * guardaba la preparación sin cambiar sus piezas —mover la cámara del taller
 * basta—, con lo que el caso pasaba a otro documento y perdía el encuadre que
 * él hubiera capturado en el anterior. Por lo mismo no se exige que las notas
 * sean idénticas: si él las completó a mano, el modelo sigue siendo el suyo.
 *
 * Un archivo distinto no se reutiliza aunque sea el mismo documento: si alguien
 * lo volvió a subir desde Blender, el guion crea el exportado y lo dice al
 * simular, que es cuando se decide.
 *
 * Se prefiere el que el caso ya usa; si no, el más reciente. Si una ejecución
 * anterior creó el modelo y se cortó antes de guardar el caso, la siguiente lo
 * encuentra aquí y no crea otro.
 */
export async function modeloReutilizable(
  base: BaseDelGuion,
  preparacion: { nombre?: unknown },
  versionDelAtlas: string,
  corte: CorteDeHueso,
  idDelModeloDelCaso: string,
  bytes: Buffer,
): Promise<{ doc: Record<string, unknown>; bytes: Buffer } | { doc: null; motivo: string }> {
  const nombre = `${String(preparacion.nombre ?? 'Preparación')} · del atlas`
  const { docs } = await base.find({
    collection: 'modelos-3d',
    where: { nombre: { equals: nombre } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const deLaPreparacion = `Exportado de la preparación «${String(preparacion.nombre ?? '')}» del atlas anatómico (${versionDelAtlas})`
  const delCorte = `sale partida en dos (${describirCorte(corte)})`
  const candidatos = docs
    .filter((d) => {
      const notas = String(d.notas ?? '')
      return notas.includes(deLaPreparacion) && notas.includes(delCorte)
    })
    .sort((a, b) => {
      if (String(a.id) === idDelModeloDelCaso) return -1
      if (String(b.id) === idDelModeloDelCaso) return 1
      return Date.parse(String(b.createdAt ?? '')) - Date.parse(String(a.createdAt ?? ''))
    })

  if (candidatos.length === 0) {
    return {
      doc: null,
      motivo:
        docs.length === 0
          ? 'no hay ningún modelo exportado de esta preparación'
          : `hay ${docs.length} modelo(s) «${nombre}», pero ninguno con este corte y esta versión del atlas`,
    }
  }
  let sinArchivo = 0
  for (const doc of candidatos) {
    const ruta = rutaDelArchivo(base, doc.filename)
    let enDisco: Buffer
    try {
      if (!ruta) throw new Error('sin ruta')
      enDisco = await readFile(ruta)
    } catch {
      // Un documento sin su archivo en el disco no se reutiliza: el caso
      // apuntaría a un modelo que no se descarga. Se prueba el siguiente.
      sinArchivo += 1
      continue
    }
    if (enDisco.equals(bytes)) return { doc, bytes: enDisco }
  }
  const ids = candidatos.map((d) => `#${String(d.id)}`).join(', ')
  return {
    doc: null,
    motivo:
      sinArchivo === candidatos.length
        ? `${candidatos.length === 1 ? 'el modelo' : 'los modelos'} ${ids} no ${candidatos.length === 1 ? 'tiene' : 'tienen'} su archivo en el disco`
        : `el archivo ${candidatos.length === 1 ? 'del modelo' : 'de los modelos'} ${ids} no es el que sale hoy de ` +
          'la exportación (cambió el atlas instalado, sus correcciones o el exportador, o se volvió a subir a mano)',
  }
}

// ------------------------------------------------------------------ guion

export interface OpcionesDelGuion {
  aplicar: boolean
  preparacion: string
  caso: string
  directorioDelAtlas?: string
  /** A dónde va cada línea. Por omisión, la consola, sin secretos. */
  escribir?: (linea: string) => void
}

export interface ResultadoDelGuion {
  escrito: boolean
  modeloCreado: boolean
  plan: PlanDelCaso
  escrituras: string[]
}

/**
 * El guion entero, contra una base ya abierta.
 *
 * Aparte de `principal` para poder probarlo con una base de mentira: lo único que
 * `principal` añade es cargar el `.env`, abrir Payload y salir del proceso.
 */
export async function ejecutar(
  baseReal: BaseDelGuion,
  opciones: OpcionesDelGuion,
): Promise<ResultadoDelGuion> {
  const escribir = opciones.escribir ?? ((linea: string) => console.log(sinSecretos(linea)))
  const { base, escrituras } = baseQueRegistra(baseReal, opciones.aplicar)
  const { exportarPreparacion, leerCatalogo } = await import('../src/lib/exportarPreparacion')

  escribir(
    opciones.aplicar
      ? 'Modo: APLICAR. Se escribe en la base.'
      : 'Modo: SIMULAR. No se escribe nada; para escribir, vuelva a ejecutarlo con --aplicar.',
  )
  escribir('')

  // 1. La preparación.
  const { docs: preparaciones } = await base.find({
    collection: 'instancias-atlas',
    pagination: false,
    depth: 0,
    sort: 'nombre',
    overrideAccess: true,
  })
  const elegida = elegirPorNombre(preparaciones as unknown as DocConNombre[], opciones.preparacion, {
    singular: 'ninguna preparación del atlas',
    plural: 'Preparaciones que hay',
  })
  const preparacion = await base.findByID({
    collection: 'instancias-atlas',
    id: elegida.id,
    depth: 0,
    overrideAccess: true,
  })
  const contenido = (preparacion.contenido ?? {}) as { piezas?: { id?: unknown }[] }
  const ids = new Set((contenido.piezas ?? []).map((p) => String(p?.id ?? '')).filter(Boolean))

  const catalogo = await leerCatalogo(opciones.directorioDelAtlas)
  const tibias = catalogo.piezas.filter(
    (p) => ids.has(p.id) && normalizarNombre(nombreEnEspanol(p.nombre)) === normalizarNombre(TIBIA_DERECHA),
  )
  if (tibias.length === 0) {
    throw new ParadaDelGuion(
      `La preparación «${String(preparacion.nombre)}» (#${String(preparacion.id)}, ${ids.size} piezas) ` +
        'no incluye la tibia derecha, y es la que se parte. Enciéndala en el taller del atlas, guarde la ' +
        'preparación y vuelva a ejecutarlo. No se ha tocado nada.',
    )
  }
  if (tibias.length > 1) {
    throw new ParadaDelGuion(
      `La preparación incluye ${tibias.length} piezas que se llaman «${TIBIA_DERECHA}» ` +
        `(${tibias.map((t) => t.id).join(', ')}), y no sé cuál partir. No se ha tocado nada.`,
    )
  }
  const tibia = tibias[0]
  escribir(
    `Preparación: «${String(preparacion.nombre)}» #${String(preparacion.id)}, ${ids.size} piezas, ` +
      `con la tibia derecha (${tibia.id}).`,
  )

  // 2. El caso y su fractura.
  const { docs: casos } = await base.find({
    collection: 'cirugias',
    pagination: false,
    depth: 0,
    draft: true,
    sort: 'nombre',
    overrideAccess: true,
  })
  const caso = elegirPorNombre(casos as unknown as (DocConNombre & CasoLeido)[], opciones.caso, {
    singular: 'ningún caso quirúrgico',
    plural: 'Casos que hay',
  })
  if (caso._status !== 'published') {
    // Guardar el caso con `draft: false` publicaría también lo que el
    // traumatólogo tenga a medio escribir, y eso no lo decide un guion.
    throw new ParadaDelGuion(
      `El caso «${String(caso.nombre)}» tiene cambios en borrador sin publicar. Publíquelos o descártelos ` +
        'en el panel y vuelva a ejecutarlo. No se ha tocado nada.',
    )
  }
  const leer = async (coleccion: string, valor: unknown) => {
    const id = idDe(valor)
    if (!id) return null
    return base.findByID({ collection: coleccion, id, depth: 0, overrideAccess: true })
  }
  const fractura: Fractura = {
    hueso: await leer('huesos-ao', caso.hueso),
    clasificacion: await leer('clasificaciones-ao', caso.clasificacion),
  }
  escribir(
    `Caso: «${String(caso.nombre)}» #${String(caso.id)}, ` +
      `${String(fractura.hueso?.codigo ?? '?')}-${String(fractura.clasificacion?.codigo ?? '?')} ` +
      `${String(fractura.clasificacion?.nombre ?? '')}.`,
  )

  const { corte, porque, avisos: avisosDelCorte } = corteParaLaFractura(fractura, tibia.id)
  escribir(`Corte: ${describirCorte(corte)}.`)
  escribir(`  Porque ${porque}.`)
  escribir('')

  // 3. El modelo: el que ya se exportó, o uno nuevo.
  //
  // Se exporta SIEMPRE, y primero en memoria: con una envoltura que simula
  // aunque el guion aplique, así que `exportarPreparacion` hace todo su trabajo
  // —leer, partir, escribir el GLB, armar las notas— y su `create` no llega a la
  // base. De ahí salen los bytes con los que `modeloReutilizable` compara los
  // modelos que ya hay. Sin esta pasada no hay con qué comparar, y el guion
  // tendría que fiarse de las notas, que no cambian cuando cambia lo de dentro.
  escribir('Modelo')
  const enMemoria = baseQueRegistra(baseReal, false)
  const exportado = await exportarPreparacion(enMemoria.base as unknown as Payload, preparacion.id, {
    protagonistas: [tibia.id],
    corte,
    directorioDelAtlas: opciones.directorioDelAtlas,
  })
  const creacion = enMemoria.creacion()
  const bytes = enMemoria.archivo()
  if (!creacion || !bytes) throw new Error('La exportación no entregó ningún archivo.')

  const reutilizable = await modeloReutilizable(
    base,
    preparacion,
    catalogo.version,
    corte,
    idDe(caso.modelo),
    bytes,
  )
  let modelo: ModeloParaElCaso
  let modeloCreado = false
  const avisosDelModelo: string[] = []
  if (reutilizable.doc) {
    const leido = await leerElArchivo(reutilizable.bytes)
    modelo = { id: reutilizable.doc.id as string | number, ...leido }
    escribir(
      `  = se reutiliza «${String(reutilizable.doc.nombre)}» #${String(reutilizable.doc.id)}: ` +
        'su archivo es idéntico al que sale hoy de la exportación. No se crea otro.',
    )
  } else {
    escribir(`  No hay uno que valga: ${reutilizable.motivo}.`)
    // Se crea con los mismos argumentos que armó `exportarPreparacion`, en vez
    // de exportar otra vez: lo que se escribe es exactamente lo que se acaba de
    // comparar, y la geometría no se lee ni se parte dos veces. No es una copia
    // de su lógica, es su propia llamada guardada. Si mañana la función hiciera
    // otra escritura además del `create`, la pasada en memoria fallaría —la
    // envoltura que simula no deja escribir nada más— en vez de perderla aquí.
    // En simulación, `base` es a su vez la envoltura que no escribe.
    const creado = await base.create(creacion)
    // El identificador es el del documento tal cual, y no `exportado.id`, que
    // llega convertido a texto. Con PostgreSQL es un número, y Payload rechaza
    // la relación del caso escrita como «"2"»: «El siguiente campo es inválido:
    // Modelo 3D del caso», con el modelo ya creado y el caso sin guardar. Pasó
    // en la primera prueba contra una base de verdad.
    const id = creado.id as string | number
    const leido = await leerElArchivo(bytes)
    modelo = { id, ...leido }
    modeloCreado = opciones.aplicar
    const mb = (exportado.bytes / 1024 / 1024).toFixed(2).replace('.', ',')
    const numero = opciones.aplicar ? ` #${String(id)}` : ''
    escribir(
      `  + ${opciones.aplicar ? 'creado' : 'se crearía'} «${exportado.nombre}»${numero} ` +
        `(${mb} MB, ${exportado.nodos.length} objetos).`,
    )
  }
  // Valen igual para el modelo reutilizado: su archivo es idéntico al exportado.
  if (exportado.corte) {
    escribir(`    fragmento que se mueve: ${exportado.corte.fragmento}; hueso fijo: ${exportado.corte.proximal}`)
    const [px, py, pz] = exportado.corte.pivote.map((v) => cifra(Math.round(v * 10000) / 10))
    escribir(`    gira sobre el foco del corte: ${px}, ${py}, ${pz} mm del centro del modelo`)
    avisosDelModelo.push(...exportado.corte.avisos)
  }
  if (exportado.perdidas.length > 0) {
    avisosDelModelo.push(
      `La preparación nombra piezas que el atlas instalado ya no tiene: ${exportado.perdidas.join(', ')}.`,
    )
  }
  if (exportado.sinTraducir.length > 0) {
    avisosDelModelo.push(`Sin traducción, salen en inglés: ${exportado.sinTraducir.join(', ')}.`)
  }
  escribir('')

  // 4. El caso.
  const plan = planDelCaso(caso, modelo)
  escribir(`Caso «${String(caso.nombre)}»`)
  for (const linea of plan.lineas) escribir(linea)

  const avisos = [...avisosDelCorte, ...avisosDelModelo, ...plan.avisos]
  if (avisos.length > 0) {
    escribir('')
    escribir('Avisos')
    for (const aviso of avisos) escribir(`  ! ${aviso}`)
  }
  escribir('')

  let escrito = false
  if (!plan.hayCambios) {
    escribir(
      modeloCreado
        ? 'El caso ya estaba así; solo se ha creado el modelo.'
        : 'El caso ya está así. No hay nada que cambiar.',
    )
  } else if (!opciones.aplicar) {
    escribir('Nada escrito. Para aplicar estos cambios: --aplicar')
  } else {
    await base.update({
      collection: 'cirugias',
      id: caso.id,
      data: plan.datos,
      draft: false,
      overrideAccess: true,
    })
    escrito = true
    escribir('Caso guardado y publicado. Ábralo en /simulador.')
  }

  return { escrito, modeloCreado, plan, escrituras }
}

// ------------------------------------------------------------- argumentos

/** Las opciones de la línea de órdenes. */
export function leerArgumentos(argumentos: string[]): Omit<OpcionesDelGuion, 'escribir'> & { ayuda: boolean } {
  let aplicar: boolean | null = null
  let preparacion = PREPARACION_POR_OMISION
  let caso = CASO_DE_PRUEBA
  let ayuda = false

  for (let i = 0; i < argumentos.length; i += 1) {
    const [clave, enLinea] = argumentos[i].split(/=(.*)/s, 2)
    const valor = () => {
      const v = enLinea ?? argumentos[++i]
      if (v === undefined || v.startsWith('--')) throw new ParadaDelGuion(`Falta el valor de ${clave}.`)
      return v
    }
    switch (clave) {
      case '--simular':
      case '--aplicar': {
        const pedido = clave === '--aplicar'
        if (aplicar !== null && aplicar !== pedido) {
          throw new ParadaDelGuion('--simular y --aplicar no pueden ir juntos.')
        }
        aplicar = pedido
        break
      }
      case '--preparacion':
        preparacion = valor()
        break
      case '--caso':
        caso = valor()
        break
      case '--ayuda':
      case '-h':
      case '--help':
        ayuda = true
        break
      default:
        throw new ParadaDelGuion(
          `No conozco la opción «${argumentos[i]}». Las que hay: --simular, --aplicar, --preparacion, --caso.`,
        )
    }
  }
  return { aplicar: aplicar ?? false, preparacion, caso, ayuda }
}

const AYUDA = `Pone la preparación «${PREPARACION_POR_OMISION}» del atlas, con la tibia partida, en el caso de prueba.

  npx tsx scripts/pierna-derecha-en-el-caso.ts             simula (por omisión): dice qué cambiaría
  npx tsx scripts/pierna-derecha-en-el-caso.ts --aplicar   lo escribe

  --preparacion "<nombre>"   otra preparación
  --caso "<nombre>"          otro caso (por omisión, «${CASO_DE_PRUEBA}»)`

async function principal() {
  const archivoEnv = resolve(process.cwd(), '.env')
  if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

  try {
    const opciones = leerArgumentos(process.argv.slice(2))
    if (opciones.ayuda) {
      console.log(AYUDA)
      process.exit(0)
    }
    const { getPayload } = await import('payload')
    const config = (await import('../src/payload.config')).default
    const payload = await getPayload({ config })
    await ejecutar(payload as unknown as BaseDelGuion, opciones)
    process.exit(0)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error('')
    console.error(sinSecretos(error instanceof ParadaDelGuion ? mensaje : `Falló: ${mensaje}`))
    process.exit(1)
  }
}

// Solo al lanzarlo con tsx, no al importarlo desde la prueba: importar un guion
// que abre la base y termina el proceso tumbaría a Vitest entero.
const lanzado = process.argv[1] ?? ''
if (/pierna-derecha-en-el-caso\.ts$/.test(lanzado.replace(/\\/g, '/'))) void principal()
