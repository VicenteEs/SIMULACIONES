/**
 * El contrato del atlas anatómico.
 *
 * Estos tipos describen lo que produce `scripts/atlas/preparar.mjs` y lo que
 * consumen el cargador y el visor. Es el único sitio donde vive esa forma: si
 * cambia el guion de ingesta, cambia aquí y el compilador señala todo lo demás.
 *
 * El atlas es **material de solo lectura**. No hay ninguna acción de servidor
 * capaz de escribir en él, y esa es la razón estructural —no una promesa de la
 * interfaz— por la que trabajar sobre una copia no puede estropear el original.
 */

/** Sistema anatómico: esqueleto, músculos, arterias… */
export interface SistemaDelAtlas {
  id: string
  nombre: string
  /** Color base con el que se pinta el sistema entero. */
  color: string
  orden: number
}

/** Región anatómica: cabeza, tórax, miembro inferior derecho… */
export interface RegionDelAtlas {
  id: string
  nombre: string
  orden: number
}

/** Un paquete de geometría comprimido. */
export interface PaqueteDelAtlas {
  archivo: string
  bytes: number
  bytesComprimido: number
}

/**
 * Una pieza: la unidad mínima que se puede encender, apagar o seleccionar.
 *
 * `pos`, `nor` e `idx` son desplazamientos en bytes dentro del paquete, no
 * índices de elemento. El cargador construye las vistas tipadas sobre el búfer
 * con esos desplazamientos tal cual.
 */
export interface PiezaDelAtlas {
  id: string
  /**
   * Nombre anatómico original de BodyParts3D, en inglés, y así se queda en el
   * catálogo. Para enseñarlo se pasa por `nombreEnEspanol` (`src/atlas/nombres.ts`),
   * pero aquí no se reescribe: es la clave de la tabla de traducciones y de
   * `CORRECCIONES_DE_SISTEMA`, y es lo que se puede buscar en la bibliografía.
   * Un catálogo con el nombre ya traducido dejaría las dos tablas sin casar con
   * nada, sin un solo error.
   */
  nombre: string
  /** Identificador en la Foundational Model of Anatomy. */
  fma: string
  /**
   * En `catalogo.json` viene tal como lo clasificó el atlas de origen, que se
   * equivoca en algunas piezas (las de `correcciones-de-sistema.json`). Quien
   * lea el catálogo tiene que pasarlo por `corregirCatalogo`
   * (`src/atlas/clasificacion.ts`) antes de mirar este campo.
   */
  sistema: string
  region: string
  /**
   * De dónde salió la región: `anatomia` si lo dice un concepto FMA del propio
   * atlas, `caja` si se dedujo de la posición. Se distingue a propósito, para
   * no presentar una estimación como un dato.
   */
  origenRegion: 'anatomia' | 'caja'
  paquete: number
  pos: number
  nor: number
  idx: number
  vertices: number
  indices: number
  /** Caja envolvente: [[minX,minY,minZ],[maxX,maxY,maxZ]] en metros. */
  caja: [[number, number, number], [number, number, number]]
}

export interface CatalogoDelAtlas {
  /**
   * Identifica esta preparación concreta. Una instancia guardada anota cuál
   * usó: si algún día se regenera el atlas y cambian los identificadores, se
   * puede avisar en vez de mostrar piezas equivocadas en silencio.
   */
  version: string
  fuente: string
  licencia: string
  sujeto: string
  triangulos: number
  sistemas: SistemaDelAtlas[]
  regiones: RegionDelAtlas[]
  paquetes: PaqueteDelAtlas[]
  piezas: PiezaDelAtlas[]
}

// ---------------------------------------------------------------- instancias

/**
 * Una instancia: la «copia» sobre la que trabaja el traumatólogo.
 *
 * No duplica geometría. Guarda **qué piezas sobreviven**, que es lo que hace
 * que preparar una tibia pese cuatro identificadores y no dos mil doscientos
 * treinta, que borrar sea reversible —nunca se perdió nada— y que el atlas
 * original sea intocable por construcción.
 */
export interface PiezaDeInstancia {
  id: string
  /** Color propio, si se quiere destacar la pieza sobre el resto. */
  color?: string
  /**
   * Cuánto se ha sacado la pieza de su sitio anatómico, en metros (D-129). Es
   * lo que permite enseñar una luxación o un fragmento desplazado. Ausente si
   * no se movió: la inmensa mayoría de las piezas de cualquier preparación.
   */
  mover?: [number, number, number]
  /** Giro sobre su propio centro, como cuaternión unitario [x, y, z, w]. */
  girar?: [number, number, number, number]
}

/**
 * Lo más que se deja alejar una pieza de su sitio, por eje. El cuerpo mide
 * menos de dos metros: más que eso no es una luxación, es una pieza perdida
 * fuera de cámara que nadie va a volver a encontrar.
 */
export const MAXIMO_DE_TRASLADO = 2

/** Cámara guardada: dónde estaba el ojo y a dónde miraba. */
export interface VistaDeInstancia {
  camara: [number, number, number]
  objetivo: [number, number, number]
  /** Separación de las piezas, de 0 a 1. */
  separacion: number
}

export interface ContenidoDeInstancia {
  /** Versión del formato de este objeto, no del atlas. */
  version: 1
  /** Versión del catálogo con el que se creó. */
  atlas: string
  piezas: PiezaDeInstancia[]
  vista: VistaDeInstancia
}

/** Cámara por omisión: el cuerpo entero de frente. */
export const VISTA_INICIAL: VistaDeInstancia = {
  camara: [0.6, 1.1, 2.6],
  objetivo: [0, 0.9, 0],
  separacion: 0,
}

/** Techo de piezas por instancia. El atlas entero cabe; nada más. */
export const MAXIMO_PIEZAS = 2500
