import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { rolDeSistema } from '@/atlas/clasificacion'
import { nombreEnEspanol, sinTildes, tieneTraduccion } from '@/atlas/nombres'
import { nombreDeNodo, type ObjetoParaGlb } from '@/lib/glb'
import { propuestaDelNodo, type RolDePieza } from '@/lib/piezasDelCaso'

/**
 * De una preparación del atlas a un modelo que la consola pueda abrir.
 *
 * El atlas y el simulador son dos motores distintos. El atlas dibuja el cuerpo
 * fusionando todas las piezas de un sistema en una sola malla y decidiendo qué
 * se ve con una textura; la consola carga un archivo con objetos con nombre,
 * mueve uno de ellos y mide milímetros. Enseñarle el atlas a la consola sería
 * reescribir el simulador entero.
 *
 * Así que el puente va al revés: la preparación se **exporta** a un archivo del
 * mismo formato que sale de Blender, y la consola no se entera de que existe un
 * atlas. Para ella es un modelo más.
 *
 * Aquí vive la parte que se puede probar sin archivos ni base de datos: agrupar,
 * reindexar, recortar la piel, nombrar y centrar. Leer los paquetes y escribir
 * el documento es trabajo del servidor y vive en la acción, que entra por
 * `prepararExportacion` y por nada más.
 */

/** Cuántos bytes ocupa el modelo antes de que nadie lo quiera abrir. */
export const TECHO_BYTES = 5 * 1024 * 1024

/**
 * Una pieza ya leída del paquete, con su geometría suelta.
 *
 * Los índices llegan **locales a la pieza**, empezando en cero: así viajan en
 * el paquete del atlas, y así hay que reindexarlos al fusionar.
 */
export interface PiezaLeida {
  id: string
  /** El nombre original del atlas, en inglés. Se traduce al nombrar, no aquí. */
  nombre: string
  sistema: string
  /** Identificador en la Foundational Model of Anatomy, si se conoce. */
  fma?: string
  posiciones: Float32Array
  normales: Int16Array
  indices: Uint32Array
}

export interface OpcionesDeExportacion {
  /**
   * Piezas que salen como objeto propio en vez de fundirse con su sistema.
   *
   * Son las protagonistas del caso: la tibia que se va a romper, el fragmento
   * que hay que reducir. El resto se funde por sistema a propósito: exportar
   * ciento treinta y nueve objetos sueltos obligaría al médico a escribir
   * ciento treinta y nueve filas de piezas en el caso para poder ver la pierna,
   * porque la consola apaga todo lo que el caso no declara.
   */
  protagonistas?: string[]
  /** Color por sistema, del catálogo. */
  colores?: Record<string, string>
  /**
   * Nombre en español de cada sistema, del catálogo («Esqueleto», «Tejido
   * conectivo»). Sin él, el objeto fundido se queda con el identificador en
   * inglés, que es justo lo que ningún filtro de la consola entendía.
   */
  nombresDeSistema?: Record<string, string>
}

/**
 * Lo que la acción devuelve de cada objeto del archivo.
 *
 * El taller del atlas lo lee con esta forma exacta para enseñar qué va a
 * encontrar el médico en el caso; cambiarla rompe a ese lector sin que el
 * compilador lo vea, porque el campo le llega como opcional.
 */
export interface PiezaExportada {
  nodo: string
  etiqueta: string
  rol: RolDePieza
}

/** «#aabbcc» a los cuatro decimales que quiere glTF. */
export function colorDeGltf(hex: string | undefined): [number, number, number, number] {
  const limpio = (hex ?? '').replace('#', '')
  if (limpio.length !== 6) return [0.8, 0.8, 0.8, 1]
  const n = Number.parseInt(limpio, 16)
  if (!Number.isFinite(n)) return [0.8, 0.8, 0.8, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

/**
 * Agrupa las piezas leídas en los objetos que tendrá el archivo.
 *
 * Cada protagonista es su propio objeto. Las demás se funden por sistema, con
 * los índices corridos para que sigan apuntando a su vértice: al pegar la
 * segunda pieza detrás de la primera, sus índices tienen que sumar cuantos
 * vértices llevaba la anterior. Equivocarse aquí no da error, da una malla con
 * triángulos cosidos al azar.
 *
 * Es el primer paso de `prepararExportacion`, no el archivo terminado. El
 * `nombre` que sale de aquí es el de ORIGEN —el original del atlas para una
 * protagonista, el identificador para un sistema— y la geometría sigue en las
 * coordenadas del cuerpo entero. Escribir un archivo directamente con esto
 * devolvería los nombres en inglés, la pierna a medio metro del centro y la
 * piel del cuerpo entero, que son los defectos que `prepararExportacion` existe
 * para quitar.
 *
 * Lo que sí sale ya de aquí son los `extras` de cada objeto, porque solo aquí se
 * sabe si un objeto es una protagonista o un sistema fundido:
 *
 *  - `rol`: el papel en la consola, de `rolDeSistema`. Vale igual para las
 *    protagonistas, que casi siempre son hueso porque casi siempre son del
 *    esqueleto; una protagonista muscular se queda en músculo, porque eso es.
 *  - `etiqueta`: el nombre en español CON tildes, el que se enseña.
 *  - `sistema`: el identificador del sistema, que es la clave de
 *    `ROL_DE_SISTEMA` y permite rehacer el rol si la tabla cambia.
 *  - `nombreOriginal` y `fma`, solo en las protagonistas: la licencia del atlas
 *    obliga a poder rastrear lo traducido, y un sistema fundido no tiene un
 *    único original que citar.
 */
export function agruparParaGlb(
  piezas: PiezaLeida[],
  opciones: OpcionesDeExportacion = {},
): ObjetoParaGlb[] {
  const protagonistas = new Set(opciones.protagonistas ?? [])
  const colores = opciones.colores ?? {}
  const nombresDeSistema = opciones.nombresDeSistema ?? {}

  const sueltas: PiezaLeida[] = []
  const porSistema = new Map<string, PiezaLeida[]>()

  for (const pieza of piezas) {
    if (protagonistas.has(pieza.id)) {
      sueltas.push(pieza)
      continue
    }
    const grupo = porSistema.get(pieza.sistema)
    if (grupo) grupo.push(pieza)
    else porSistema.set(pieza.sistema, [pieza])
  }

  const salida: ObjetoParaGlb[] = []

  // Las protagonistas primero: son las que el médico va a tocar en el caso, y
  // conviene que salgan arriba en la lista.
  for (const pieza of sueltas) {
    salida.push({
      nombre: pieza.nombre,
      posiciones: pieza.posiciones,
      normales: pieza.normales,
      indices: pieza.indices,
      color: colorDeGltf(colores[pieza.sistema]),
      extras: {
        rol: rolDeSistema(pieza.sistema),
        etiqueta: nombreEnEspanol(pieza.nombre),
        sistema: pieza.sistema,
        nombreOriginal: pieza.nombre,
        ...(pieza.fma ? { fma: pieza.fma } : {}),
      },
    })
  }

  for (const [sistema, grupo] of porSistema) {
    salida.push({
      nombre: sistema,
      ...fusionar(grupo),
      color: colorDeGltf(colores[sistema]),
      extras: {
        rol: rolDeSistema(sistema),
        etiqueta: nombresDeSistema[sistema] || sistema,
        sistema,
      },
    })
  }

  return salida
}

/** Pega varias piezas en una sola malla, corriendo los índices. */
function fusionar(grupo: PiezaLeida[]): {
  posiciones: Float32Array
  normales: Int16Array
  indices: Uint32Array
} {
  const vertices = grupo.reduce((t, p) => t + p.posiciones.length / 3, 0)
  const cuantos = grupo.reduce((t, p) => t + p.indices.length, 0)

  const posiciones = new Float32Array(vertices * 3)
  const normales = new Int16Array(vertices * 3)
  const indices = new Uint32Array(cuantos)

  let vBase = 0
  let iBase = 0
  for (const pieza of grupo) {
    posiciones.set(pieza.posiciones, vBase * 3)
    normales.set(pieza.normales, vBase * 3)
    for (let k = 0; k < pieza.indices.length; k += 1) indices[iBase + k] = pieza.indices[k] + vBase
    vBase += pieza.posiciones.length / 3
    iBase += pieza.indices.length
  }

  return { posiciones, normales, indices }
}

/**
 * El nombre de NODO de cada objeto: en español, sin tildes, saneado y único.
 *
 * Sale de la etiqueta y no del nombre original. Sin tildes porque el médico lo
 * compara a mano con lo que escribe en el caso, y «Peroné» tecleado puede llegar
 * con la tilde como carácter aparte y no casar con el del archivo aunque en
 * pantalla sean idénticos (ver `sinTildes`). Saneado con la regla de three, por
 * lo que explica `nombreDeNodo`.
 *
 * ## Por qué hace falta desambiguar
 *
 * Dos objetos pueden acabar con el mismo nombre, y no es un caso de laboratorio.
 * El propio atlas trae 231 nombres repetidos en piezas distintas —el nervio
 * óptico izquierdo son dos piezas, el esfínter anal externo tres—, así que dos
 * protagonistas pueden llamarse igual ya en el original. La piel del atlas es la
 * pieza «Skin», que se traduce «Piel», y el sistema tegumentario también se
 * llama «Piel». Y chocan dos originales distintos con la misma traducción, o dos
 * nombres que solo se distinguían por un punto o una barra que el saneado borra.
 *
 * Con dos nodos iguales, `getObjectByName` de three devuelve siempre el
 * primero: la segunda pieza no se puede encender, apagar ni marcar como
 * fragmento, y nada lo dice.
 *
 * ## Cómo, y por qué así
 *
 * El primero que llega se queda el nombre limpio y los siguientes llevan `_2`,
 * `_3`… El orden es el de los objetos —protagonistas primero, en el orden de la
 * preparación, y luego los sistemas—, así que exportar dos veces la misma
 * preparación con las mismas protagonistas da los mismos nombres: el caso que
 * ya se escribió contra el primer archivo sigue valiendo con el segundo.
 *
 * Se empieza en `_2` y no en `_1` a propósito: `_1` es el sufijo que el
 * cargador de three pone a los nombres de malla repetidos al abrir el archivo
 * (`createUniqueName`), y un nodo que se llamara ya así podría acabar renombrado
 * a `_1_1` según el orden de carga. El sufijo generado se vuelve a comprobar
 * contra todos los ya usados, por si el atlas trae de verdad una pieza cuyo
 * nombre termina en `_2`.
 */
export function nombrarNodos(objetos: ObjetoParaGlb[]): ObjetoParaGlb[] {
  const usados = new Set<string>()
  return objetos.map((objeto) => {
    const etiqueta = typeof objeto.extras?.etiqueta === 'string' ? objeto.extras.etiqueta : ''
    // Un nombre que el saneado deja vacío —solo signos— no puede ser un nodo:
    // three lo cargaría sin nombre y la consola no podría buscarlo.
    const base = nombreDeNodo(sinTildes(etiqueta || objeto.nombre)) || 'objeto'
    let nombre = base
    for (let n = 2; usados.has(nombre); n += 1) nombre = `${base}_${n}`
    usados.add(nombre)
    return { ...objeto, nombre }
  })
}

/** Una caja alineada con los ejes, en metros. */
interface Caja {
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * La caja de unos objetos, o `null` si entre todos no tienen un solo vértice:
 * sin vértices, el mínimo se queda en infinito y el centro sería NaN.
 */
function cajaDe(objetos: ObjetoParaGlb[]): Caja | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const { posiciones } of objetos) {
    for (let i = 0; i < posiciones.length; i += 3) {
      for (let eje = 0; eje < 3; eje += 1) {
        const v = posiciones[i + eje]
        if (v < min[eje]) min[eje] = v
        if (v > max[eje]) max[eje] = v
      }
    }
  }
  if (!Number.isFinite(min[0])) return null
  return { min, max }
}

/** El centro de la caja de unos objetos, o `null` si no tienen vértices. */
function centroDeLaCaja(objetos: ObjetoParaGlb[]): [number, number, number] | null {
  const caja = cajaDe(objetos)
  if (!caja) return null
  const { min, max } = caja
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/** Si un objeto es de la capa de piel, según el rol que le escribió `agruparParaGlb`. */
const esPiel = (objeto: ObjetoParaGlb) => objeto.extras?.rol === 'piel'

/**
 * Cuánto se amplía la caja de lo preparado para decidir qué piel se queda: 5 cm.
 *
 * El número sale de medir con el atlas instalado, no de un libro, porque la
 * caja no es la superficie del músculo: es un prisma alineado con los ejes, y
 * la piel de una pierna, que es un óvalo, sobresale de él por la pantorrilla
 * más de lo que mide el tejido subcutáneo (medio centímetro a dos en la pierna).
 *
 *  - Pierna derecha con sus músculos por debajo de la rodilla: la piel queda,
 *    como mucho, a 4,4 cm de esa caja. Con 5 cm sale entera, toda la franja de
 *    la tibia a la rodilla, y ni un vértice de la otra pierna.
 *  - Pierna solo con los huesos (tibia, peroné y rótula): la parte de atrás de
 *    la pantorrilla llega a 6 cm de la caja ósea. Con 5 cm sale el 94 % de la
 *    piel de esa franja; lo que falta es la cara posterior del gemelo, que no es
 *    por donde se aborda una tibia.
 *  - A 6 cm empiezan a colarse trozos de la cara interna de la OTRA pierna, y a
 *    8 cm son ya cuatrocientos vértices. Por eso no se sube más.
 *
 * Donde no alcanza ningún margen es en el muslo: los dos se tocan por dentro, y
 * un fémur o un miembro inferior entero se lleva una franja de la cara interna
 * del otro muslo y del periné. Una caja no distingue dos pieles que están a un
 * centímetro; hacerlo pediría mirar hacia dónde apunta cada triángulo, y eso ya
 * no es recortar sino segmentar.
 */
export const MARGEN_DE_LA_PIEL = 0.05

/**
 * Deja de una malla los triángulos cuyos TRES vértices caen dentro de la zona,
 * y compacta los vértices que quedan.
 *
 * Tres y no uno: con que bastara uno, cada triángulo del borde arrastraría dos
 * vértices de fuera, y el borde saldría dentado hasta un centímetro más allá de
 * la zona. Con tres, lo que sale está entero dentro, que es lo que el margen
 * promete y lo que `MARGEN_DE_LA_PIEL` midió.
 *
 * Compactar no es opcional. Quitar triángulos sin quitar sus vértices deja un
 * archivo con los veintitrés mil de la piel entera y la caja del accessor de
 * cuerpo entero, que es lo que se quería quitar. Y quitar vértices sin
 * reindexar es peor: los índices siguen apuntando a la posición de antes, que
 * ahora es otro vértice o ninguno, y el archivo abre igual, con triángulos
 * cosidos al azar. Es la misma cuenta que hace `fusionar`, al revés.
 *
 * Los vértices se renumeran en su orden original, no en el de aparición en los
 * triángulos: exportar dos veces la misma preparación da el mismo archivo.
 *
 * Un índice que apunta más allá de los vértices descarta su triángulo en vez
 * de leerse: `posiciones[i]` fuera de rango es `undefined`, y `undefined` no es
 * menor que el mínimo ni mayor que el máximo, así que sin esta guarda contaría
 * como DENTRO de la zona. Un NaN en una posición sale fuera por lo mismo al
 * revés: ninguna comparación con NaN es cierta.
 *
 * Si no se quita ningún triángulo, devuelve el MISMO objeto: sin copiar, el
 * archivo sale byte a byte como antes de que existiera el recorte.
 *
 * Lo que queda es una malla abierta: la piel de una pierna recortada no se
 * cierra por arriba ni por abajo, se ve el borde del corte y, al mirar dentro,
 * el músculo. Para preparar un segmento es lo esperable —así se ve una pieza de
 * disección— y no se intenta tapar.
 */
function recortarMalla(objeto: ObjetoParaGlb, zona: Caja): ObjetoParaGlb {
  const { posiciones, normales, indices } = objeto
  const vertices = Math.floor(posiciones.length / 3)

  const dentro = new Uint8Array(vertices)
  for (let v = 0; v < vertices; v += 1) {
    const x = posiciones[v * 3]
    const y = posiciones[v * 3 + 1]
    const z = posiciones[v * 3 + 2]
    dentro[v] =
      x >= zona.min[0] &&
      x <= zona.max[0] &&
      y >= zona.min[1] &&
      y <= zona.max[1] &&
      z >= zona.min[2] &&
      z <= zona.max[2]
        ? 1
        : 0
  }

  // Un resto de uno o dos índices al final no es un triángulo: se ignora igual
  // que lo ignora la tarjeta al dibujar.
  const completos = indices.length - (indices.length % 3)
  const seQueda = (t: number) => {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    return a < vertices && b < vertices && c < vertices && dentro[a] && dentro[b] && dentro[c]
  }

  const usado = new Uint8Array(vertices)
  let triangulos = 0
  for (let t = 0; t < completos; t += 3) {
    if (!seQueda(t)) continue
    usado[indices[t]] = 1
    usado[indices[t + 1]] = 1
    usado[indices[t + 2]] = 1
    triangulos += 1
  }
  if (triangulos * 3 === indices.length) return objeto

  const nuevo = new Uint32Array(vertices)
  let quedan = 0
  for (let v = 0; v < vertices; v += 1) {
    if (usado[v]) {
      nuevo[v] = quedan
      quedan += 1
    }
  }

  const pos = new Float32Array(quedan * 3)
  // Del mismo tipo que llegaron: las del atlas son enteros de 16 bits, y
  // `escribirGlb` los declara normalizados mirando justo el tipo.
  const nor = normales instanceof Int16Array ? new Int16Array(quedan * 3) : new Float32Array(quedan * 3)
  for (let v = 0; v < vertices; v += 1) {
    if (!usado[v]) continue
    const destino = nuevo[v] * 3
    for (let eje = 0; eje < 3; eje += 1) {
      pos[destino + eje] = posiciones[v * 3 + eje]
      nor[destino + eje] = normales[v * 3 + eje]
    }
  }

  const idx = new Uint32Array(triangulos * 3)
  let k = 0
  for (let t = 0; t < completos; t += 3) {
    if (!seQueda(t)) continue
    idx[k] = nuevo[indices[t]]
    idx[k + 1] = nuevo[indices[t + 1]]
    idx[k + 2] = nuevo[indices[t + 2]]
    k += 3
  }

  return { ...objeto, posiciones: pos, normales: nor, indices: idx }
}

/**
 * Recorta la piel a la zona de lo que se exporta.
 *
 * La piel del atlas es UNA pieza de cuerpo entero («Skin», de los pies a la
 * coronilla, veintitrés mil vértices), y el resto del sistema tegumentario
 * —cejas, pelo, labios, vello púbico— tampoco está en ninguna pierna. Antes se
 * exportaba entera: quien preparaba solo la pierna y dejaba la piel encendida
 * recibía en la consola una carcasa hueca con forma de persona alrededor de una
 * tibia, y la capa que el residente tiene que incidir no era la de la pierna.
 * Es lo que el traumatólogo tenía en la cabeza al decir «solo la pierna»: la
 * piel de la pierna, no la del cuerpo del que salió.
 *
 * La zona es la caja de los objetos que NO son piel —la misma que
 * `centrarEnSuCaja` usa para el centro, así que la piel que queda es la que
 * rodea a lo que se centró— ampliada `MARGEN_DE_LA_PIEL` por cada lado.
 *
 * Solo se recorta lo que tiene rol `piel`, leído del `extras` como en el
 * centro: lo que no cuenta para la caja es lo que se recorta a ella. Un objeto
 * sin extras, escrito a mano, no dice su rol y no se toca.
 *
 * Sin nada que no sea piel no hay zona y no se recorta nada: quien exporta solo
 * la piel quiere la piel, y recortarla a su propia caja no quitaría nada.
 *
 * Un objeto de piel que se queda sin un triángulo no se escribe: sería una capa
 * que el médico enciende y que no enseña nada, lo mismo que `agruparParaGlb`
 * evita con un sistema sin piezas. Pero no desaparece callado —exportar de
 * menos sin decirlo es el defecto de siempre—: su etiqueta sale en `fuera`, que
 * la acción escribe en las notas.
 *
 * Va antes de nombrar, no después: si un objeto se cae, el siguiente que se
 * llamaba igual se queda el nombre limpio en vez de un `_2` que apunta a un
 * hueco. Y antes de centrar porque la zona se mide en las coordenadas del
 * cuerpo, las mismas que `MARGEN_DE_LA_PIEL` midió; trasladar después no la
 * mueve respecto de nada.
 */
export function recortarLaPiel(objetos: ObjetoParaGlb[]): {
  objetos: ObjetoParaGlb[]
  recortada: boolean
  fuera: string[]
} {
  const zona = cajaDe(objetos.filter((o) => !esPiel(o)))
  if (!zona) return { objetos, recortada: false, fuera: [] }

  const ampliada: Caja = {
    min: [
      zona.min[0] - MARGEN_DE_LA_PIEL,
      zona.min[1] - MARGEN_DE_LA_PIEL,
      zona.min[2] - MARGEN_DE_LA_PIEL,
    ],
    max: [
      zona.max[0] + MARGEN_DE_LA_PIEL,
      zona.max[1] + MARGEN_DE_LA_PIEL,
      zona.max[2] + MARGEN_DE_LA_PIEL,
    ],
  }

  let recortada = false
  const fuera = new Set<string>()
  const salida: ObjetoParaGlb[] = []
  for (const objeto of objetos) {
    if (!esPiel(objeto)) {
      salida.push(objeto)
      continue
    }
    const recortado = recortarMalla(objeto, ampliada)
    if (recortado !== objeto) recortada = true
    if (recortado !== objeto && recortado.indices.length === 0) {
      const etiqueta = objeto.extras?.etiqueta
      fuera.add(typeof etiqueta === 'string' && etiqueta ? etiqueta : objeto.nombre)
      continue
    }
    salida.push(recortado)
  }

  // Sin recorte se devuelve la misma lista, no una copia igual: quien compare
  // sabe así que no pasó nada.
  return { objetos: recortada ? salida : objetos, recortada, fuera: [...fuera] }
}

/**
 * Traslada toda la geometría para que el centro de su caja quede en el origen.
 *
 * Las piezas del atlas vienen en las coordenadas del cuerpo entero, con el
 * origen entre los pies. Una pierna derecha exportada sola queda a un lado y a
 * medio metro de altura, y cualquier visor que gire sobre el origen —Blender,
 * el visor de las fichas, el de la biblioteca— la hace orbitar alrededor de un
 * punto vacío donde estaría el resto del cuerpo que ya no está. Es lo que el
 * traumatólogo describió como «no me toma el centro de la pierna».
 *
 * La caja es la de LO QUE SE EXPORTA, todos los objetos juntos, y no la de cada
 * uno: el mismo desplazamiento para todos los vértices, de modo que la tibia
 * sigue exactamente donde estaba respecto del peroné. Centrar cada objeto por
 * su lado dejaría los huesos apilados en el origen, uno dentro de otro.
 *
 * ## Por qué la piel no cuenta para la caja
 *
 * La piel del atlas es UNA pieza de cuerpo entero («Skin», de los pies a la
 * coronilla: 1,72 m de alto), y el resto del sistema tegumentario —cejas, pelo
 * de la cabeza, labios, vello púbico— tampoco está en la pierna. Con la caja de
 * todo, una pierna exportada CON su capa de piel, que es justo lo que un caso de
 * la consola necesita para poder incidir, volvía a quedar centrada en el
 * cuerpo: a 60 cm por encima de la tibia, el mismo defecto que esta función
 * existe para quitar.
 *
 * Hoy la piel llega aquí ya recortada por `recortarLaPiel` a la zona de lo
 * demás, pero sigue sin contar, y no por inercia: esa zona lleva
 * `MARGEN_DE_LA_PIEL` de más por cada lado, y contarla movería el centro hacia
 * donde el margen alcanzó más piel —la pantorrilla, el hueco poplíteo— en vez
 * de dejarlo en lo que se preparó. Y quien llame a esta función sin recortar
 * antes sigue obteniendo el centro bueno.
 *
 * Así que la caja se mide con los objetos cuyo rol no es `piel`, y se traslada
 * TODO con ese centro, piel incluida: la piel sigue exactamente en su sitio
 * respecto del hueso, solo que el origen cae en lo que se preparó y no en el
 * cuerpo del que salió. Si todo lo que se exporta es piel, no hay otra cosa que
 * medir y la caja es la de todo.
 *
 * El rol se lee del `extras` que escribe `agruparParaGlb`, y no del sistema:
 * es el mismo dato que la consola usará para apagar la capa, así que lo que no
 * cuenta para el centro es exactamente lo que la consola trata como piel. Un
 * objeto sin extras —uno escrito a mano— cuenta siempre.
 *
 * Lo que se pierde: una uña del pie marcada como protagonista es tegumentaria y
 * tampoco cuenta. Está pegada al hueso que sí cuenta, así que el centro apenas
 * se mueve; lo que no se puede permitir es que lo decida la piel entera.
 *
 * El mínimo y el máximo de cada accessor no se tocan aquí: `escribirGlb` los
 * calcula de las posiciones que recibe, que ya son las trasladadas.
 *
 * Devuelve el centro restado, en metros, para poder dejarlo anotado: es lo que
 * hay que sumar para devolver el modelo a su sitio en el cuerpo. Y `sinLaPiel`,
 * que dice si había piel con vértices y se dejó fuera de la caja. Ya no lleva
 * aviso propio en las notas —el que importa es el del recorte, que dice también
 * que el centro se tomó sin ella—, pero la acción lo sigue devolviendo tal cual.
 */
export function centrarEnSuCaja(objetos: ObjetoParaGlb[]): {
  objetos: ObjetoParaGlb[]
  centro: [number, number, number]
  sinLaPiel: boolean
} {
  const sinPiel = objetos.filter((o) => !esPiel(o))
  const pielConVertices = objetos.some((o) => esPiel(o) && o.posiciones.length > 0)
  // Se mide sin la piel solo si queda algo con vértices que medir; si no, con
  // todo, como antes.
  const deLoPreparado = sinPiel.length > 0 ? centroDeLaCaja(sinPiel) : null
  const centro = deLoPreparado ?? centroDeLaCaja(objetos)
  // Sin un solo vértice no hay caja: se devuelve todo igual en vez de llenar
  // el archivo de posiciones NaN que ningún lector abre.
  if (!centro) return { objetos, centro: [0, 0, 0], sinLaPiel: false }

  return {
    centro,
    sinLaPiel: deLoPreparado !== null && pielConVertices,
    // Copias y no escritura en el sitio: las posiciones de una protagonista son
    // las mismas que llegaron en `PiezaLeida`, y trasladarlas encima cambiaría
    // los datos de quien llamó sin que lo supiera.
    objetos: objetos.map((objeto) => {
      const origen = objeto.posiciones
      const posiciones = new Float32Array(origen.length)
      for (let i = 0; i < origen.length; i += 3) {
        posiciones[i] = origen[i] - centro[0]
        posiciones[i + 1] = origen[i + 1] - centro[1]
        posiciones[i + 2] = origen[i + 2] - centro[2]
      }
      return { ...objeto, posiciones }
    }),
  }
}

/**
 * Lo que la acción entrega de cada objeto, leído de los extras que acaban de
 * escribirse.
 *
 * Se lee con `propuestaDelNodo`, el mismo lector que usa el taller de piezas al
 * abrir el archivo, y no copiando los campos a mano. Así lo que el taller del
 * atlas anuncia y lo que el formulario del caso rellena salen por el mismo
 * camino: si algún día el escritor deja un extra que el lector no acepta, esta
 * lista sale vacía y la prueba lo ve, en vez de anunciar piezas que después no
 * se rellenan.
 */
export function piezasDelArchivo(objetos: ObjetoParaGlb[]): PiezaExportada[] {
  return objetos.flatMap((objeto) => {
    const propuesta = propuestaDelNodo(nombreDeNodo(objeto.nombre), objeto.extras)
    return propuesta ? [propuesta] : []
  })
}

/**
 * Los objetos del archivo que salen con su nombre original, en inglés.
 *
 * El traumatólogo pidió que todas las piezas hicieran match en español, y la
 * cadena de nombres lo hace... con lo que la tabla sabe. Mientras
 * `nombres-es.json` no tenga una estructura, `nombreEnEspanol` devuelve el
 * original a propósito —mejor «Right fibularis brevis» que una traducción
 * inventada—, y ese original acaba de nodo («Right_fibularis_brevis») y de
 * etiqueta. Nada fallaba ni avisaba: el médico se encontraba nodos en inglés en
 * el caso y no tenía cómo saber si era un error o lo esperado. Esta lista es lo
 * que la acción escribe en las notas y devuelve, para que se diga.
 *
 * Se lee de los `extras` ya escritos y no de las piezas de entrada, por la misma
 * razón que `piezasDelArchivo`: lo que se avisa es lo que salió, no lo que se
 * pretendía.
 *
 *  - Una protagonista lleva `nombreOriginal`; está sin traducir si la tabla no
 *    lo tiene (`tieneTraduccion`), y se nombra por ese original, que es lo que
 *    hay que añadir a la tabla.
 *  - Un sistema fundido está sin traducir si su etiqueta se quedó en el
 *    identificador del sistema, que es lo que `agruparParaGlb` pone cuando el
 *    catálogo no trae su nombre en español. Hoy los quince lo traen; un sistema
 *    nuevo en un atlas regenerado no avisaría de ningún otro modo.
 *
 * Sin repetidos: el atlas trae nombres repetidos en piezas distintas, y dos
 * nervios ópticos izquierdos protagonistas son una sola traducción que falta.
 */
export function nombresSinTraducir(objetos: ObjetoParaGlb[]): string[] {
  const faltan = new Set<string>()
  for (const { extras } of objetos) {
    if (!extras) continue
    if (typeof extras.nombreOriginal === 'string') {
      if (!tieneTraduccion(extras.nombreOriginal)) faltan.add(extras.nombreOriginal)
    } else if (typeof extras.sistema === 'string' && extras.etiqueta === extras.sistema) {
      faltan.add(extras.sistema)
    }
  }
  return [...faltan]
}

/**
 * El camino entero, de las piezas leídas al contenido del archivo.
 *
 * Es lo único que la acción llama, y el orden importa:
 *
 *  1. Agrupar, que es lo que escribe el rol de cada objeto.
 *  2. Recortar la piel, que necesita ese rol para saber qué es piel, y las
 *     coordenadas del cuerpo en las que se midió el margen.
 *  3. Nombrar, cuando ya se sabe qué objetos quedan y cuáles chocan: un objeto
 *     de piel que el recorte deja vacío no reserva un nombre.
 *  4. Centrar al final, porque trasladar no cambia ni nombres ni extras.
 *
 * Devuelve también lo que hay que avisar: `sinTraducir`, `pielRecortada` y
 * `pielFuera`. Salen de aquí y no se calculan en la acción porque la acción no
 * se puede probar sin servidor, y un aviso que nadie prueba es el primero que
 * deja de darse. `sinLaPiel` se sigue devolviendo con su significado de antes
 * (ver `centrarEnSuCaja`).
 */
export function prepararExportacion(
  piezas: PiezaLeida[],
  opciones: OpcionesDeExportacion = {},
): {
  objetos: ObjetoParaGlb[]
  piezas: PiezaExportada[]
  centro: [number, number, number]
  sinLaPiel: boolean
  pielRecortada: boolean
  pielFuera: string[]
  sinTraducir: string[]
} {
  const recorte = recortarLaPiel(agruparParaGlb(piezas, opciones))
  const { objetos, centro, sinLaPiel } = centrarEnSuCaja(nombrarNodos(recorte.objetos))
  return {
    objetos,
    piezas: piezasDelArchivo(objetos),
    centro,
    sinLaPiel,
    pielRecortada: recorte.recortada,
    pielFuera: recorte.fuera,
    sinTraducir: nombresSinTraducir(objetos),
  }
}

/**
 * Las frases de aviso que la acción añade a las notas del modelo.
 *
 * Aparte, y no escritas dentro de la acción, para que la prueba pueda leer el
 * texto exacto que le llega al médico. Vacía cuando no hay nada que decir: un
 * aviso que sale siempre deja de leerse.
 *
 * El de la piel dice tres cosas porque las tres se ven al abrir el archivo y
 * ninguna se adivina: que la piel no es la del cuerpo entero sino la de la
 * zona, que por eso está abierta por donde se cortó —en Blender parece un
 * defecto de la malla—, y que el centro se tomó sin ella. Antes decía que salía
 * entera; esa frase ya no es verdad y no se conserva.
 *
 * El margen se escribe desde `MARGEN_DE_LA_PIEL` y no a mano, para que la nota
 * no siga diciendo cinco centímetros el día que se cambie.
 */
export function avisosDeLaExportacion(aviso: {
  pielRecortada: boolean
  pielFuera: string[]
  sinTraducir: string[]
}): string[] {
  const avisos: string[] = []
  if (aviso.sinTraducir.length > 0) {
    avisos.push(
      `Sin traducción, se quedan con su nombre original: ${aviso.sinTraducir.join(', ')}.`,
    )
  }
  if (aviso.pielRecortada) {
    const centimetros = String(Math.round(MARGEN_DE_LA_PIEL * 1000) / 10).replace('.', ',')
    avisos.push(
      'La piel del atlas es de cuerpo entero: se recortó a la zona de lo que se exporta, ' +
        `con ${centimetros} cm de margen alrededor, y queda abierta por donde se cortó. ` +
        'El centro se tomó sin ella.',
    )
  }
  if (aviso.pielFuera.length > 0) {
    avisos.push(
      `No salen porque quedaban enteras fuera de esa zona: ${aviso.pielFuera.join(', ')}.`,
    )
  }
  return avisos
}

/**
 * Qué piezas del catálogo corresponden a una preparación, en su orden.
 *
 * Una preparación guarda identificadores, no geometría, y puede nombrar piezas
 * que ya no existan si el atlas se regeneró. Las que no se encuentran se
 * devuelven aparte en vez de desaparecer: exportar de menos sin decirlo es
 * entregar una pierna a la que le falta un hueso.
 */
export function piezasDeLaPreparacion(
  catalogo: CatalogoDelAtlas,
  ids: string[],
): { encontradas: PiezaDelAtlas[]; perdidas: string[] } {
  const porId = new Map(catalogo.piezas.map((p) => [p.id, p]))
  const encontradas: PiezaDelAtlas[] = []
  const perdidas: string[] = []
  for (const id of ids) {
    const pieza = porId.get(id)
    if (pieza) encontradas.push(pieza)
    else perdidas.push(id)
  }
  return { encontradas, perdidas }
}

/**
 * Los nombres de objeto que tendrá el archivo, para enseñárselos al médico.
 *
 * Son los de nodo —sin tildes y saneados—, no las etiquetas: es lo que la
 * consola verá y lo que va en la columna «Nombre del objeto» del caso. El taller
 * del atlas los pinta con esta forma, así que sigue devolviéndose aunque
 * `piezasDelArchivo` diga ya lo mismo y más.
 */
export function nombresDelArchivo(objetos: ObjetoParaGlb[]): string[] {
  return objetos.map((o) => nombreDeNodo(o.nombre))
}
