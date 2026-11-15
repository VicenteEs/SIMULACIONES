/**
 * El campo quirúrgico (P-014): el colchón, la sábana y el paño que tapa al paciente, en números.
 *
 * El paciente del simulador es solo lo que el médico recortó en el taller: una rodilla, una mano. Para que se
 * lea como un paciente y no como una pieza suelta en el aire, se le acuesta sobre el colchón de una camilla y
 * se le tapa con un paño que conserva el bulto del cuerpo entero y deja a la vista una ventana. El colchón, la
 * sábana y el paño salen de Blender (`scripts/pabellon/`), simulados sobre la piel del atlas, y vienen en las
 * **coordenadas del cuerpo**: metros, Y hacia la cabeza, +Z hacia delante. Todo este archivo trabaja ahí.
 *
 * Aquí está lo que se puede probar sin pantalla: dónde cae el modelo en ese cuerpo, qué zona queda descubierta,
 * cómo se corta la ventana en la tela, qué tapa el paño y cómo se mueve el colchón cuando al paciente se le da
 * la vuelta. Lo que dibuja está en `components/simulador/campoEnLaEscena.ts`.
 *
 * Es puro y sin three, como `posicionDelPaciente.ts`: lo lee el lienzo y se prueba con números.
 */

import type { PosicionDelPaciente, Vec3 } from './posicionDelPaciente'

// ------------------------------------------------------------------------------------------------ el caso

export type Decubito = 'supino' | 'prono'

/**
 * Cómo está acostado el paciente en cada posición. «De pie» no lo levanta: el dueño lo decidió así (P-014), y
 * es lo que pasa en un pabellón, donde nadie opera a un paciente de pie. Sigue boca arriba y lo que cambia es
 * desde dónde se le mira.
 */
export function decubitoDeLaPosicion(posicion: PosicionDelPaciente): Decubito {
  return posicion === 'prono' ? 'prono' : 'supino'
}

export type ColorDelPano = 'azul' | 'celeste' | 'verde'

/** Los tres colores de paño que se usan en pabellón. El primero es el de un caso que no dice nada. */
export const COLORES_DEL_PANO: readonly { valor: ColorDelPano; etiqueta: string; tela: string }[] = [
  { valor: 'azul', etiqueta: 'Azul', tela: '#1e519c' },
  { valor: 'celeste', etiqueta: 'Celeste', tela: '#6fb0d5' },
  { valor: 'verde', etiqueta: 'Verde', tela: '#2e7d6b' },
]

export function colorDelPano(valor: unknown): ColorDelPano {
  return COLORES_DEL_PANO.some((c) => c.valor === valor) ? (valor as ColorDelPano) : 'azul'
}

/** La zona descubierta: un rectángulo sobre el plano (x, y) del cuerpo, en metros. */
export interface ZonaDelPano {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Lo que el caso guarda del paño. `zona` nula es «la automática»: la caja de lo recortado. */
export interface PanoDelCaso {
  apagado: boolean
  color: ColorDelPano
  zona: ZonaDelPano | null
}

export const PANO_POR_OMISION: PanoDelCaso = { apagado: false, color: 'azul', zona: null }

/** Lo que el caso dice de su campo: dónde está lo recortado en el cuerpo del atlas y cómo va su paño. */
export interface CampoDelCaso {
  /**
   * El centro de lo recortado, leído de la nota del modelo. Es para los archivos de antes de P-014: los de ahora
   * lo llevan dentro, con todos sus decimales, y el lienzo se fía de ellos primero.
   */
  centroEnElCuerpo: Vec3 | null
  pano: PanoDelCaso
}

/** El lado más corto que puede tener la ventana. Más pequeña no cabe ni el bisturí, y sus asas se pisarían. */
export const LADO_MINIMO_DE_LA_ZONA = 0.03

/** Lo redondeada que va cada esquina de la ventana, como la de un paño fenestrado. */
export const RADIO_DE_LA_VENTANA = 0.018

/**
 * Lee el paño de lo que trae el caso. En la base la zona va en milímetros enteros —nadie ajusta un paño por
 * décimas, y un entero no acumula el error de ir y volver por el formulario—; aquí pasa a metros.
 *
 * Una zona a medias (tres números y un vacío) es una zona que no se terminó de guardar: vale como automática,
 * que es mejor que una ventana con un borde en el infinito.
 */
export function panoDelCaso(crudo: unknown): PanoDelCaso {
  const dato = (crudo ?? {}) as Record<string, unknown>
  const zona = (dato.zona ?? {}) as Record<string, unknown>
  const lados = [zona.xMin, zona.xMax, zona.yMin, zona.yMax].map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
  const completa = lados.every((v) => v !== null)
  return {
    apagado: dato.apagado === true,
    color: colorDelPano(dato.color),
    zona: completa
      ? ordenarLaZona({ xMin: lados[0]! / 1000, xMax: lados[1]! / 1000, yMin: lados[2]! / 1000, yMax: lados[3]! / 1000 })
      : null,
  }
}

/** La zona como la guarda el caso: en milímetros enteros. */
export function zonaParaElCaso(zona: ZonaDelPano | null): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
  if (!zona) return null
  const z = ordenarLaZona(zona)
  return { xMin: Math.round(z.xMin * 1000), xMax: Math.round(z.xMax * 1000), yMin: Math.round(z.yMin * 1000), yMax: Math.round(z.yMax * 1000) }
}

/** Deja la zona con el mínimo antes que el máximo y con su lado mínimo, creciendo desde el centro. */
export function ordenarLaZona(zona: ZonaDelPano): ZonaDelPano {
  const eje = (a: number, b: number): [number, number] => {
    const [menor, mayor] = a <= b ? [a, b] : [b, a]
    if (mayor - menor >= LADO_MINIMO_DE_LA_ZONA) return [menor, mayor]
    const centro = (menor + mayor) / 2
    return [centro - LADO_MINIMO_DE_LA_ZONA / 2, centro + LADO_MINIMO_DE_LA_ZONA / 2]
  }
  const [xMin, xMax] = eje(zona.xMin, zona.xMax)
  const [yMin, yMax] = eje(zona.yMin, zona.yMax)
  return { xMin, xMax, yMin, yMax }
}

// ---------------------------------------------------------------------------------- el sitio en el cuerpo

/**
 * La frase con que el exportador del taller deja dicho, en las notas del modelo, lo que le restó para centrarlo.
 * En milímetros y con signo: es lo que hay que SUMAR para devolver el modelo a su sitio en el cuerpo.
 *
 * Vive aquí, junto a `centroDesdeLasNotas`, porque esa frase dejó de ser solo un apunte para quien junta dos
 * exportaciones en Blender: el simulador la lee para acostar al modelo en su sitio bajo el paño. Con quien la
 * escribe y quien la lee en el mismo archivo, cambiar una sin la otra no pasa de la prueba.
 */
export function fraseDelCentro(centro: Vec3): string {
  const milimetros = centro.map((v) => Math.round(v * 1000)).join(', ')
  return ` Centrado en su propia caja: para devolverlo a su sitio en el cuerpo, sumar ${milimetros} mm (x, y, z).`
}

/**
 * Dónde cae el modelo en el cuerpo: lo que el exportador del taller restó para centrarlo, en metros.
 *
 * Los modelos exportados desde P-014 lo traen escrito en el propio `.glb`. Los de antes solo lo tienen en la
 * frase de sus notas —«para devolverlo a su sitio en el cuerpo, sumar −98, 487, 12 mm (x, y, z)»—, que es de
 * donde lo saca esta función. Redondeada al milímetro, que para colocar un paño sobra.
 *
 * Devuelve `null` si la frase no está: un modelo que no salió del taller no tiene sitio en el cuerpo, y lo
 * honesto es no ponerle un bulto que no es el suyo.
 */
export function centroDesdeLasNotas(notas: unknown): Vec3 | null {
  if (typeof notas !== 'string') return null
  // El signo puede venir con el guion de siempre o con el menos tipográfico, según quién haya tocado la nota.
  const hallado = /sumar\s+([-−]?\d+)\s*,\s*([-−]?\d+)\s*,\s*([-−]?\d+)\s*mm\s*\(x,\s*y,\s*z\)/i.exec(notas)
  if (!hallado) return null
  const numero = (texto: string) => Number(texto.replace('−', '-')) / 1000
  const centro: Vec3 = [numero(hallado[1]), numero(hallado[2]), numero(hallado[3])]
  return centro.every(Number.isFinite) ? centro : null
}

/** Lo mismo, de lo que el exportador deja en el `.glb`. Acepta solo tres números finitos. */
export function centroDesdeElArchivo(extras: unknown): Vec3 | null {
  const centro = (extras as { centroEnElCuerpo?: unknown } | null | undefined)?.centroEnElCuerpo
  if (!Array.isArray(centro) || centro.length !== 3) return null
  return centro.every((v) => typeof v === 'number' && Number.isFinite(v)) ? (centro as Vec3) : null
}

/**
 * Los límites del cuerpo del atlas, con holgura. Un «centro» fuera de ellos no es un sitio en este cuerpo
 * —una nota escrita a mano, un modelo en milímetros— y el paño no se pone.
 */
export function cabeEnElCuerpo(centro: Vec3): boolean {
  return Math.abs(centro[0]) < 0.5 && centro[1] > -0.2 && centro[1] < 1.95 && Math.abs(centro[2]) < 0.35
}

// ------------------------------------------------------------------------------------------- el manifiesto

export interface MarcoDelColchon {
  /** El centro de la cara de arriba del colchón, que es el plano en que se apoya el paciente. */
  origen: Vec3
  ancho: Vec3
  /** Hacia la cabeza del paciente. */
  largo: Vec3
  /** Hacia el paciente: lo que en el pabellón es «arriba». */
  normal: Vec3
}

export interface FormaDelRelieve {
  x0: number
  y0: number
  paso: number
  nx: number
  ny: number
  /** Cuántos metros vale una unidad del entero. */
  unidad: number
  sinDato: number
}

/** Las medidas del colchón, en metros. `hundimiento` es lo que su cara de arriba queda bajo el plano de apoyo. */
export interface MedidasDelColchon {
  ancho: number
  largo: number
  grosor: number
  hundimiento: number
}

export interface ManifiestoDelCampo {
  colchon: MedidasDelColchon & { modelo: string; repeticionesDeLaTira: number; altoDeLaTira: number }
  decubitos: Record<Decubito, MarcoDelColchon & { modelo: string; relieve: string; signo: 1 | -1 }>
  relieve: FormaDelRelieve
  textura: { lado: number; repeticionesDelRelieve: number; repeticionesDelGrano: number }
}

const esVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/**
 * Comprueba el manifiesto antes de fiarse de él. Lo escribe un guion de Blender y lo lee un navegador: si un
 * día el guion cambia un nombre, aquí sale `null` y el simulador sigue sin campo, en vez de colocar el colchón
 * en `NaN` y dejar el lienzo en negro.
 */
export function leerElManifiesto(crudo: unknown): ManifiestoDelCampo | null {
  const m = crudo as Partial<ManifiestoDelCampo> | null | undefined
  if (!m || typeof m !== 'object') return null
  const c = m.colchon
  if (!c || typeof c.modelo !== 'string' || ![c.ancho, c.largo, c.grosor, c.repeticionesDeLaTira, c.altoDeLaTira].every((n) => typeof n === 'number' && n > 0)) return null
  if (typeof c.hundimiento !== 'number' || !(c.hundimiento >= 0) || c.hundimiento >= c.grosor) return null
  const r = m.relieve
  if (!r || ![r.x0, r.y0, r.paso, r.unidad, r.sinDato].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (!Number.isInteger(r.nx) || !Number.isInteger(r.ny) || r.nx < 2 || r.ny < 2 || r.paso <= 0 || r.unidad <= 0) return null
  const t = m.textura
  if (!t || ![t.lado, t.repeticionesDelRelieve, t.repeticionesDelGrano].every((n) => typeof n === 'number' && n > 0)) return null
  for (const decubito of ['supino', 'prono'] as const) {
    const d = m.decubitos?.[decubito]
    if (!d || !esVec3(d.origen) || !esVec3(d.ancho) || !esVec3(d.largo) || !esVec3(d.normal)) return null
    if (typeof d.modelo !== 'string' || typeof d.relieve !== 'string' || (d.signo !== 1 && d.signo !== -1)) return null
  }
  return m as ManifiestoDelCampo
}

// ---------------------------------------------------------------------------------------------- el relieve

/**
 * Las alturas de un decúbito, por celda: lo más alto del cuerpo y el lecho, que es la superficie en que se
 * apoya el borde del paño —la piel donde hay cuerpo y la sábana donde no, sin los valles en que una tela no
 * entra—.
 *
 * «Altura» es `signo · z`: boca arriba lo alto es +Z y boca abajo −Z, y con el signo delante una sola cuenta
 * vale para los dos.
 */
export interface Relieve extends FormaDelRelieve {
  signo: 1 | -1
  cuerpo: Int16Array
  lecho: Int16Array
}

/** Abre el binario del relieve. `null` si no mide lo que el manifiesto dice: un archivo cortado no se interpreta. */
export function leerElRelieve(bytes: ArrayBuffer, forma: FormaDelRelieve, signo: 1 | -1): Relieve | null {
  const celdas = forma.nx * forma.ny
  if (bytes.byteLength !== celdas * 2 * 2) return null
  return { ...forma, signo, cuerpo: new Int16Array(bytes, 0, celdas), lecho: new Int16Array(bytes, celdas * 2, celdas) }
}

/**
 * La altura de una rejilla en un punto, interpolada entre los centros de sus cuatro celdas. Donde alguna no
 * tiene dato se reparte entre las que sí; donde no lo tiene ninguna, `NaN`.
 *
 * `scripts/pabellon/generar.py` hace esta misma cuenta al escribir el lecho, y sube las celdas que haga falta
 * hasta que, interpolado así, no quede por debajo de ningún punto de la piel. Si se cambia aquí la forma de
 * interpolar, esa garantía deja de valer.
 */
export function alturaEn(relieve: FormaDelRelieve, rejilla: Int16Array, x: number, y: number): number {
  const fx = (x - relieve.x0) / relieve.paso - 0.5
  const fy = (y - relieve.y0) / relieve.paso - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const u = fx - i
  const w = fy - j
  let suma = 0
  let peso = 0
  for (let dj = 0; dj < 2; dj++) {
    const jj = j + dj
    if (jj < 0 || jj >= relieve.ny) continue
    for (let di = 0; di < 2; di++) {
      const ii = i + di
      if (ii < 0 || ii >= relieve.nx) continue
      const valor = rejilla[jj * relieve.nx + ii]
      if (valor === relieve.sinDato) continue
      const p = (di ? u : 1 - u) * (dj ? w : 1 - w)
      suma += valor * p
      peso += p
    }
  }
  return peso > 1e-6 ? (suma / peso) * relieve.unidad : Number.NaN
}

/**
 * Lo más que cae el lecho relleno al alejarse de lo que tiene al lado, en metros por metro. Es empinado adrede,
 * porque el lecho de verdad lo es: junto a un tobillo apoyado en el colchón baja diez centímetros en una celda.
 * Con tres, la falda de un pie que cuelga llegaba hasta el borde de la ventana y lo levantaba justo donde acaba
 * el colchón, quince centímetros por encima del que venía por la sábana.
 */
const CAIDA_DE_LO_RELLENO = 8

/** El valor del medio de una lista, sin ordenar la de quien llama. */
const mediana = (valores: number[]): number => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)]

/**
 * El relieve con los huecos del lecho rellenos: donde no hay dato sigue la sábana, a la altura de su canto.
 * Devuelve el mismo si no tenía huecos.
 *
 * El lecho solo existe donde hay cuerpo o sábana. Pasado el final del colchón no hay ninguno de los dos —boca
 * abajo los pies cuelgan fuera, y el paño con ellos—, y ahí `cenirAlBorde` no tenía a qué ceñir: dejaba la tela
 * donde cayó, a la altura del talón, pegada a la de al lado ya bajada hasta la sábana. El borde de la ventana
 * salía en jirones, con un escalón de quince centímetros entre un vértice y el siguiente.
 *
 * Con esto la sábana «sigue» más allá del colchón. No hay nada ahí, pero es donde quedaría el borde de una tela
 * tensada entre el colchón y la mano de quien la recorta, y la que ya colgaba por debajo no se sube
 * (`cenirAlBorde` solo baja).
 *
 * Son tres pasos, y cada uno está por algo que se vio:
 *
 *  1. Las celdas pegadas a un dato toman lo más alto de los datos que tocan. `alturaEn` reparte entre las
 *     celdas con dato, y `generar.py` garantiza que, repartido así, el lecho no queda por debajo de la piel;
 *     una celda rellena más baja que sus vecinas tiraría de esa cuenta hacia abajo justo en el contorno del
 *     cuerpo, y la piel del pie asomaría por encima de la tela. Con lo más alto, la cuenta solo puede subir.
 *  2. Todo lo demás vale lo mismo: la mediana del canto de la sábana, que queda unos centímetros por debajo de
 *     la cara del colchón —la sábana baja por sus costados—. Antes se rellenaba por anillos desde el dato más
 *     cercano, y salía mal dos veces: sembrando desde la piel, el hueco de al lado de un pie tomaba la altura
 *     del pie; sembrando solo desde la sábana, el canto —que en una columna acaba a diez centímetros y en la de
 *     al lado a catorce— dejaba el relleno a rayas. Un solo número no tiene vecinos con los que discrepar.
 *  3. A lo relleno se le quitan las caídas a plomo: junto a un pie que cuelga bajaría del talón a la sábana en
 *     una celda. Se le deja caer como mucho `CAIDA_DE_LO_RELLENO`.
 *
 * Lo que traía el archivo no se toca.
 */
export function rellenarElLecho(relieve: Relieve): Relieve {
  const { nx, ny, sinDato } = relieve
  const original = relieve.lecho
  if (!original.includes(sinDato)) return relieve
  const lecho = original.slice()

  // 1. El anillo pegado a los datos. De paso se apunta el canto: los datos que tocan un hueco, y cuáles de
  //    ellos son sábana.
  const canto: number[] = []
  const cantoDeLaSabana: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const esHueco = original[k] === sinDato
      let masAlto = sinDato
      let tocaUnHueco = false
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj
        if (jj < 0 || jj >= ny) continue
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          if ((di === 0 && dj === 0) || ii < 0 || ii >= nx) continue
          const vecina = original[jj * nx + ii]
          if (vecina === sinDato) tocaUnHueco = true
          else if (vecina > masAlto) masAlto = vecina
        }
      }
      if (esHueco) lecho[k] = masAlto
      else if (tocaUnHueco) (relieve.cuerpo[k] === sinDato ? cantoDeLaSabana : canto).push(original[k])
    }
  }
  // Sin sábana —un relieve que no la trae— manda el canto del cuerpo; sin un solo dato no hay con qué rellenar.
  const delNivel = cantoDeLaSabana.length > 0 ? cantoDeLaSabana : canto
  if (delNivel.length === 0) return relieve

  // 2. Lo que no toca ningún dato.
  const nivel = mediana(delNivel)
  for (let k = 0; k < lecho.length; k++) if (lecho[k] === sinDato) lecho[k] = nivel

  // 3. Un barrido hacia delante y otro hacia atrás, que es la cuenta de una transformada de distancia con la
  //    altura en lugar de la distancia. Sobre una rejilla despejada bastan los dos; aquí los datos del archivo
  //    no se mueven y hacen de obstáculo, así que se repite mientras algo cambie. Son dos vueltas, rara vez tres.
  const recto = Math.round((relieve.paso * CAIDA_DE_LO_RELLENO) / relieve.unidad)
  const sesgado = Math.round(recto * Math.SQRT2)
  let cambio = true
  const subir = (k: number, i: number, j: number, di: number, dj: number, caida: number) => {
    const ii = i + di
    const jj = j + dj
    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return
    const desde = lecho[jj * nx + ii] - caida
    if (desde > lecho[k]) {
      lecho[k] = desde
      cambio = true
    }
  }
  for (let vuelta = 0; cambio && vuelta < 8; vuelta++) {
    cambio = false
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (original[k] !== sinDato) continue
        subir(k, i, j, -1, 0, recto)
        subir(k, i, j, -1, -1, sesgado)
        subir(k, i, j, 0, -1, recto)
        subir(k, i, j, 1, -1, sesgado)
      }
    }
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i
        if (original[k] !== sinDato) continue
        subir(k, i, j, 1, 0, recto)
        subir(k, i, j, 1, 1, sesgado)
        subir(k, i, j, 0, 1, recto)
        subir(k, i, j, -1, 1, sesgado)
      }
    }
  }
  return { ...relieve, lecho }
}

/** ¿Hay cuerpo en este punto, visto desde arriba? */
export function hayCuerpoEn(relieve: Relieve, x: number, y: number): boolean {
  const i = Math.floor((x - relieve.x0) / relieve.paso)
  const j = Math.floor((y - relieve.y0) / relieve.paso)
  if (i < 0 || j < 0 || i >= relieve.nx || j >= relieve.ny) return false
  return relieve.cuerpo[j * relieve.nx + i] !== relieve.sinDato
}

// ------------------------------------------------------------------------------------------------- la zona

/** Cuánto se abre la ventana más allá de lo recortado donde el cuerpo se acaba: la punta de los dedos. */
export const HOLGURA_DONDE_ACABA_EL_CUERPO = 0.025
/**
 * A menos de esto del contorno, el borde de la caja se corre hasta pasarlo. Es lo que la piel puede sobresalir de
 * lo que lleva dentro: el almohadillado de la planta del pie son dos centímetros y medio.
 */
const ALCANCE_DEL_CONTORNO = 0.045
/** Lo que el borde se aparta, por lo menos, del contorno que acaba de pasar. */
const CLARO_DEL_CONTORNO = 0.01
/** Hasta dónde se busca, pasado el contorno, la otra orilla de un hueco: la otra pierna, el tronco junto al brazo. */
const ALCANCE_DE_LA_BUSQUEDA = 0.12
/** En cuántos puntos se mira cada lado de la caja. */
const MUESTRAS_POR_LADO = 9

/**
 * Lo que hay pasado un borde de la caja, mirado desde un punto de él hacia fuera: a qué distancia se acaba el
 * cuerpo y a cuál vuelve a haberlo (`Infinity` si no vuelve). `null` si el cuerpo sigue: el borde corta el
 * miembro a través, o le pasa por encima lejos del contorno.
 */
function huecoTrasElBorde(relieve: Relieve, x: number, y: number, dx: number, dy: number): { desde: number; hasta: number } | null {
  const paso = relieve.paso / 2
  let desde = -1
  for (let d = 0; d <= ALCANCE_DEL_CONTORNO + 1e-9; d += paso) {
    if (!hayCuerpoEn(relieve, x + dx * d, y + dy * d)) {
      desde = d
      break
    }
  }
  if (desde < 0) return null
  for (let d = desde + paso; d <= ALCANCE_DE_LA_BUSQUEDA + 1e-9; d += paso) {
    if (hayCuerpoEn(relieve, x + dx * d, y + dy * d)) return { desde, hasta: d }
  }
  return { desde, hasta: Number.POSITIVE_INFINITY }
}

/** Cuánto se corre hacia fuera un lado de la caja: nada si el cuerpo sigue, y si no, hasta la sábana. */
function holguraDelLado(relieve: Relieve, puntos: [number, number][], dx: number, dy: number): number {
  let conHueco = 0
  let querida = HOLGURA_DONDE_ACABA_EL_CUERPO
  let tope = Number.POSITIVE_INFINITY
  for (const [x, y] of puntos) {
    const hueco = huecoTrasElBorde(relieve, x, y, dx, dy)
    if (!hueco) continue
    conHueco++
    // Hasta pasar el contorno más saliente de todo el lado…
    querida = Math.max(querida, hueco.desde + CLARO_DEL_CONTORNO)
    // …sin pasar de la mitad del hueco más estrecho.
    tope = Math.min(tope, (hueco.desde + hueco.hasta) / 2)
  }
  // Manda la mayoría: en el corte de una rodilla, los dos puntos de las esquinas caen fuera del muslo y los
  // otros siete encima.
  return conHueco * 2 > puntos.length ? Math.min(querida, tope) : 0
}

/**
 * La zona automática: la caja de lo recortado, vista desde arriba.
 *
 * `caja` es la de las piezas que no son piel, ya en las coordenadas del cuerpo —la misma con que el exportador
 * centra—. La piel sale del taller con cinco centímetros de margen alrededor de esa caja, así que con la
 * ventana en la caja los extremos cortados del miembro quedan cinco centímetros bajo el paño, que es donde
 * tienen que estar: nadie quiere ver el borde dentado de una piel recortada.
 *
 * Donde el cuerpo se acaba poco después del borde, la ventana se abre hasta pasar el contorno, y son dos casos
 * con el mismo arreglo:
 *
 * - **La punta de un pie, de una mano, la coronilla, la planta.** No hay extremo cortado que esconder y la caja
 *   de los huesos se queda corta: la piel sobresale unos milímetros de la última falange y más de dos
 *   centímetros del calcáneo, y el paño le mordería la punta de los dedos o le taparía la planta.
 * - **El costado de un miembro.** La caja de los músculos acaba a medio centímetro del contorno de la piel,
 *   justo en la ladera, y un paño cortado ahí se apoya en una pared casi vertical: en la primera prueba en el
 *   navegador ese borde salió dentado, con la piel asomando a trozos por entre la tela. Corrido hasta la
 *   sábana, el borde queda plano junto a la pierna.
 *
 * Con el contorno lejos —la caja de tres vértebras en mitad de una espalda— el borde se queda donde está: el
 * paño pisa la piel, que ahí es casi llana, como el de una laparotomía.
 *
 * Y si pasado el contorno vuelve a haber cuerpo —la otra pierna a tres centímetros, el tronco junto al
 * brazo—, el borde se queda **a medio hueco**, no más allá: abrir los dos centímetros y medio enteros
 * destaparía un trozo de la pierna de al lado, que no está en el modelo salvo la tira de piel que el taller
 * recorta con el margen.
 */
export function zonaAutomatica(caja: { min: Vec3; max: Vec3 }, relieve?: Relieve | null): ZonaDelPano {
  const zona = ordenarLaZona({ xMin: caja.min[0], xMax: caja.max[0], yMin: caja.min[1], yMax: caja.max[1] })
  if (!relieve) return zona
  const repartidos = (a: number, b: number) => Array.from({ length: MUESTRAS_POR_LADO }, (_, k) => a + ((b - a) * (k + 0.5)) / MUESTRAS_POR_LADO)
  const xs = repartidos(zona.xMin, zona.xMax)
  const ys = repartidos(zona.yMin, zona.yMax)
  return {
    xMin: zona.xMin - holguraDelLado(relieve, ys.map((y) => [zona.xMin, y]), -1, 0),
    xMax: zona.xMax + holguraDelLado(relieve, ys.map((y) => [zona.xMax, y]), 1, 0),
    yMin: zona.yMin - holguraDelLado(relieve, xs.map((x) => [x, zona.yMin]), 0, -1),
    yMax: zona.yMax + holguraDelLado(relieve, xs.map((x) => [x, zona.yMax]), 0, 1),
  }
}

/** La zona, metida en lo que cubre el relieve: fuera de él no hay paño que abrir. */
export function acotarLaZona(zona: ZonaDelPano, forma: FormaDelRelieve): ZonaDelPano {
  const xFin = forma.x0 + forma.nx * forma.paso
  const yFin = forma.y0 + forma.ny * forma.paso
  const dentro = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
  return ordenarLaZona({
    xMin: dentro(zona.xMin, forma.x0, xFin - LADO_MINIMO_DE_LA_ZONA),
    xMax: dentro(zona.xMax, forma.x0 + LADO_MINIMO_DE_LA_ZONA, xFin),
    yMin: dentro(zona.yMin, forma.y0, yFin - LADO_MINIMO_DE_LA_ZONA),
    yMax: dentro(zona.yMax, forma.y0 + LADO_MINIMO_DE_LA_ZONA, yFin),
  })
}

/** Cuánto antes del canto del colchón empieza la tela a doblarse para caer. */
export const MARGEN_DEL_CANTO = 0.03
/** Más allá de donde llega ningún paño. */
const FUERA_DEL_PANO = 10

/**
 * La ventana, abierta del todo por el lado en que se sale del colchón.
 *
 * Boca abajo los pies cuelgan del extremo de la camilla, y una ventana que llegue hasta ellos pasa del canto:
 * ahí el paño ya no está tendido, cae. Una ventana cerrada lo cortaría en plena caída, y lo que deja es una
 * tira colgando entre dos jirones —se vio en la primera prueba en el navegador—. En pabellón eso no se hace
 * con un paño fenestrado sino con uno en U, abierto hasta el borde, del que el miembro sale por el extremo:
 * aquí igual. El lado que pasa del canto se lleva hasta más allá de donde acaba la tela, y la ventana queda en U.
 *
 * El colchón se mira en planta. Está inclinado grado y medio y de lado no se nota.
 */
export function abrirPorDondeCuelga(zona: ZonaDelPano, marco: MarcoDelColchon, medidas: Pick<MedidasDelColchon, 'ancho' | 'largo'>): ZonaDelPano {
  const medioAncho = (medidas.ancho / 2) * Math.abs(marco.ancho[0]) - MARGEN_DEL_CANTO
  const medioLargo = (medidas.largo / 2) * Math.abs(marco.largo[1]) - MARGEN_DEL_CANTO
  return {
    xMin: zona.xMin < marco.origen[0] - medioAncho ? -FUERA_DEL_PANO : zona.xMin,
    xMax: zona.xMax > marco.origen[0] + medioAncho ? FUERA_DEL_PANO : zona.xMax,
    yMin: zona.yMin < marco.origen[1] - medioLargo ? -FUERA_DEL_PANO : zona.yMin,
    yMax: zona.yMax > marco.origen[1] + medioLargo ? FUERA_DEL_PANO : zona.yMax,
  }
}

/** El radio de las esquinas, que no puede pasar de la mitad del lado más corto. */
export function radioDeLaVentana(zona: ZonaDelPano, radio = RADIO_DE_LA_VENTANA): number {
  return Math.max(0, Math.min(radio, (zona.xMax - zona.xMin) / 2, (zona.yMax - zona.yMin) / 2))
}

/**
 * La distancia de un punto al borde de la ventana, con signo: negativa dentro, positiva fuera. Es la de un
 * rectángulo de esquinas redondas, y de ella sale todo lo que depende de «cuán cerca del borde»: por dónde se
 * corta la tela, cuánto se ciñe y por dónde va la tira de refuerzo.
 */
export function distanciaALaVentana(zona: ZonaDelPano, x: number, y: number, radio = radioDeLaVentana(zona)): number {
  const qx = Math.abs(x - (zona.xMin + zona.xMax) / 2) - ((zona.xMax - zona.xMin) / 2 - radio)
  const qy = Math.abs(y - (zona.yMin + zona.yMax) / 2) - ((zona.yMax - zona.yMin) / 2 - radio)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio
}

/**
 * El borde de la ventana como línea cerrada de puntos, en sentido antihorario visto desde +Z y con no más de
 * `paso` entre uno y el siguiente. Es lo que dibuja el marco en el editor: con los puntos tan juntos, la línea
 * puede seguir el relieve de la piel.
 */
export function contornoDeLaVentana(zona: ZonaDelPano, paso = 0.008, radio = radioDeLaVentana(zona)): [number, number][] {
  const puntos: [number, number][] = []
  const tramo = (x1: number, y1: number, x2: number, y2: number) => {
    const partes = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / paso))
    for (let k = 0; k < partes; k++) puntos.push([x1 + ((x2 - x1) * k) / partes, y1 + ((y2 - y1) * k) / partes])
  }
  const arco = (cx: number, cy: number, desde: number) => {
    if (radio <= 1e-6) return
    const partes = Math.max(2, Math.ceil(((Math.PI / 2) * radio) / paso))
    for (let k = 0; k < partes; k++) {
      const a = desde + ((Math.PI / 2) * k) / partes
      puntos.push([cx + radio * Math.cos(a), cy + radio * Math.sin(a)])
    }
  }
  const { xMin, xMax, yMin, yMax } = zona
  tramo(xMin + radio, yMin, xMax - radio, yMin)
  arco(xMax - radio, yMin + radio, -Math.PI / 2)
  tramo(xMax, yMin + radio, xMax, yMax - radio)
  arco(xMax - radio, yMax - radio, 0)
  tramo(xMax - radio, yMax, xMin + radio, yMax)
  arco(xMin + radio, yMax - radio, Math.PI / 2)
  tramo(xMin, yMax - radio, xMin, yMin + radio)
  arco(xMin + radio, yMin + radio, Math.PI)
  return puntos
}

// ------------------------------------------------------------------------------- el marco del editor

/** Un borde de la ventana, por el nombre del número que mueve. */
export type LadoDelMarco = 'xMin' | 'xMax' | 'yMin' | 'yMax'
/** De dónde se coge el marco: de uno de sus cuatro bordes, o del centro para llevárselo entero. */
export type AsaDelMarco = LadoDelMarco | 'centro'

export const ASAS_DEL_MARCO: readonly AsaDelMarco[] = ['xMin', 'xMax', 'yMin', 'yMax', 'centro']

/**
 * Cómo se llama cada asa para quien no la ve. En el cuerpo y no en la pantalla —«hacia los pies» y no «abajo»—:
 * la pantalla cambia con cada giro de la cámara y boca abajo izquierda y derecha se cruzan; el cuerpo no.
 */
export const NOMBRE_DEL_ASA: Record<AsaDelMarco, string> = {
  // La derecha del paciente es la X negativa del atlas.
  xMin: 'Borde hacia la derecha del paciente',
  xMax: 'Borde hacia la izquierda del paciente',
  yMin: 'Borde hacia los pies',
  yMax: 'Borde hacia la cabeza',
  centro: 'Mover la ventana entera',
}

/** Dónde va cada asa en el plano del cuerpo: a media altura de su borde, y la quinta en el centro. */
export function asasDelMarco(zona: ZonaDelPano): Record<AsaDelMarco, [number, number]> {
  const cx = (zona.xMin + zona.xMax) / 2
  const cy = (zona.yMin + zona.yMax) / 2
  return { xMin: [zona.xMin, cy], xMax: [zona.xMax, cy], yMin: [cx, zona.yMin], yMax: [cx, zona.yMax], centro: [cx, cy] }
}

const alMilimetro = (v: number) => Math.round(v * 1000) / 1000

/**
 * La zona después de llevar un asa a un punto del cuerpo.
 *
 * Un borde se mueve solo: el de enfrente se queda donde estaba y hace de tope, a `LADO_MINIMO_DE_LA_ZONA`. No
 * se deja cruzarlo —que la ventana «se dé la vuelta» y el asa que se llevaba pase a ser la otra— porque el que
 * arrastra pierde lo que tenía cogido sin haber soltado. El centro se lleva la ventana entera con su tamaño, y
 * contra el final del paño se para en vez de encogerse.
 *
 * Sale redondeada al milímetro, que es como se guarda: lo que se ve mientras se arrastra es lo que queda.
 */
export function moverElMarco(zona: ZonaDelPano, asa: AsaDelMarco, hasta: [number, number], forma: FormaDelRelieve): ZonaDelPano {
  const xFin = forma.x0 + forma.nx * forma.paso
  const yFin = forma.y0 + forma.ny * forma.paso
  const entre = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
  const z = { ...zona }
  if (asa === 'xMin') z.xMin = entre(hasta[0], forma.x0, z.xMax - LADO_MINIMO_DE_LA_ZONA)
  else if (asa === 'xMax') z.xMax = entre(hasta[0], z.xMin + LADO_MINIMO_DE_LA_ZONA, xFin)
  else if (asa === 'yMin') z.yMin = entre(hasta[1], forma.y0, z.yMax - LADO_MINIMO_DE_LA_ZONA)
  else if (asa === 'yMax') z.yMax = entre(hasta[1], z.yMin + LADO_MINIMO_DE_LA_ZONA, yFin)
  else {
    const ancho = z.xMax - z.xMin
    const alto = z.yMax - z.yMin
    z.xMin = entre(hasta[0] - ancho / 2, forma.x0, Math.max(forma.x0, xFin - ancho))
    z.yMin = entre(hasta[1] - alto / 2, forma.y0, Math.max(forma.y0, yFin - alto))
    z.xMax = z.xMin + ancho
    z.yMax = z.yMin + alto
  }
  return { xMin: alMilimetro(z.xMin), xMax: alMilimetro(z.xMax), yMin: alMilimetro(z.yMin), yMax: alMilimetro(z.yMax) }
}

/** Con el rayo más tumbado que esto sobre el plano, un píxel de ratón son decímetros de cuerpo: no se sigue. */
const SENO_MINIMO_SOBRE_EL_PLANO = 0.12

/**
 * Dónde cruza un rayo el plano horizontal del cuerpo que está a la altura `z`: el punto (x, y) que el médico
 * tiene bajo el puntero cuando arrastra un asa. `null` si el rayo va casi a ras del plano o se aleja de él —la
 * cámara mira al paciente de canto—: ahí el cruce existe, pero cae a metros y el borde saltaría hasta el final.
 */
export function cruceConElPlano(origen: Vec3, direccion: Vec3, z: number): [number, number] | null {
  const largo = Math.hypot(direccion[0], direccion[1], direccion[2])
  if (largo < 1e-9 || Math.abs(direccion[2]) / largo < SENO_MINIMO_SOBRE_EL_PLANO) return null
  const t = (z - origen[2]) / direccion[2]
  if (!(t > 0)) return null
  return [origen[0] + direccion[0] * t, origen[1] + direccion[1] * t]
}

/** El tamaño de la ventana como se le dice a una persona: «16 × 55 cm», ancho por largo. */
export function medidaDeLaZona(zona: ZonaDelPano): string {
  const cm = (m: number) => String(Math.round(m * 100))
  return `${cm(zona.xMax - zona.xMin)} × ${cm(zona.yMax - zona.yMin)} cm`
}

/** ¿Son la misma ventana, al milímetro? Dos zonas que solo difieren en decimales de coma flotante lo son. */
export function mismaZona(a: ZonaDelPano | null, b: ZonaDelPano | null): boolean {
  if (!a || !b) return a === b
  return (['xMin', 'xMax', 'yMin', 'yMax'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.0005)
}

// ------------------------------------------------------------------------------------- cortar la ventana

/** Una tela: posiciones y UV por vértice, y triángulos. En las coordenadas del cuerpo. */
export interface Tela {
  posiciones: Float32Array
  uv: Float32Array
  indices: Uint32Array
}

/**
 * Corta la ventana en la tela: quita lo que cae dentro del borde y recorta los triángulos que lo cruzan.
 *
 * Se corta la geometría, y no se descarta en el sombreador, por lo que hay alrededor: las sombras, la oclusión
 * ambiental y la radiografía dibujan la escena con sus propios materiales, y para ellos un `discard` del
 * material de la tela no existe. Saldría la sombra de un paño entero sobre una pierna descubierta.
 *
 * Cada vértice de la tela está dentro o fuera de la ventana, y el corte pasa por las aristas que unen uno de
 * dentro con uno de fuera, en el punto exacto en que la arista cruza el borde. Un triángulo con un vértice
 * dentro pierde esa esquina; con dos, se queda en la punta del tercero.
 *
 * Todos los puntos nuevos caen sobre aristas que la tela ya tenía, y el de cada arista se calcula una vez y lo
 * comparten sus dos triángulos. Por eso la tela sale cosida a lo largo del corte, sin una sola junta en T. La
 * primera versión cortaba cada triángulo con las rectas de los lados de la ventana, una tras otra: el corte
 * era exacto, pero las rectas seguían más allá de la ventana, partían triángulos que no la tocaban y dejaban
 * vértices a media arista del vecino, que es por donde a una tela se le ve la luz.
 *
 * Lo que se pierde es lo que sea más fino que un triángulo: una ventana cuya esquina cae entera dentro de uno
 * sale con esa esquina achaflanada. Con la tela a ocho milímetros y las esquinas redondeadas a dieciocho, no
 * hay nada que perder.
 */
export function abrirLaVentana(tela: Tela, zona: ZonaDelPano, radio = radioDeLaVentana(zona)): Tela {
  const { posiciones, uv, indices } = tela
  const cuenta = posiciones.length / 3
  const distancia = new Float32Array(cuenta)
  let algunoDentro = false
  for (let i = 0; i < cuenta; i++) {
    distancia[i] = distanciaALaVentana(zona, posiciones[i * 3], posiciones[i * 3 + 1], radio)
    if (distancia[i] < 0) algunoDentro = true
  }
  if (!algunoDentro) return tela

  const nuevasPosiciones: number[] = []
  const nuevasUv: number[] = []
  const salida: number[] = []
  const cortes = new Map<number, number>()

  /** El vértice del corte en la arista que va de `dentro` a `fuera`. */
  const corte = (dentro: number, fuera: number): number => {
    const clave = dentro < fuera ? dentro * cuenta + fuera : fuera * cuenta + dentro
    const ya = cortes.get(clave)
    if (ya !== undefined) return ya
    const x1 = posiciones[dentro * 3]
    const y1 = posiciones[dentro * 3 + 1]
    const x2 = posiciones[fuera * 3]
    const y2 = posiciones[fuera * 3 + 1]
    // A lo largo de la arista la distancia a la ventana es convexa, negativa en un extremo y positiva en el
    // otro: cruza el cero una sola vez, y partiendo en dos se llega a él sin sorpresas.
    let a = 0
    let b = 1
    for (let k = 0; k < 22; k++) {
      const medio = (a + b) / 2
      if (distanciaALaVentana(zona, x1 + (x2 - x1) * medio, y1 + (y2 - y1) * medio, radio) < 0) a = medio
      else b = medio
    }
    const t = b
    let indice: number
    if (t >= 1 - 1e-6) {
      // El borde pasa por el propio vértice de fuera: no hace falta otro encima.
      indice = fuera
    } else {
      const z1 = posiciones[dentro * 3 + 2]
      nuevasPosiciones.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (posiciones[fuera * 3 + 2] - z1) * t)
      const u1 = uv[dentro * 2]
      const v1 = uv[dentro * 2 + 1]
      nuevasUv.push(u1 + (uv[fuera * 2] - u1) * t, v1 + (uv[fuera * 2 + 1] - v1) * t)
      indice = cuenta + nuevasPosiciones.length / 3 - 1
    }
    cortes.set(clave, indice)
    return indice
  }
  const emitir = (a: number, b: number, c: number) => {
    if (a !== b && b !== c && a !== c) salida.push(a, b, c)
  }

  for (let t = 0; t < indices.length; t += 3) {
    let a = indices[t]
    let b = indices[t + 1]
    let c = indices[t + 2]
    const dentro = (distancia[a] < 0 ? 1 : 0) + (distancia[b] < 0 ? 1 : 0) + (distancia[c] < 0 ? 1 : 0)
    if (dentro === 0) {
      salida.push(a, b, c)
      continue
    }
    if (dentro === 3) continue
    if (dentro === 1) {
      // Se gira el triángulo hasta que el de dentro sea `a`; el sentido no cambia.
      while (!(distancia[a] < 0)) [a, b, c] = [b, c, a]
      const ab = corte(a, b)
      const ca = corte(a, c)
      // Queda un cuadrilátero, que se parte por la diagonal más corta para no sacar triángulos afilados.
      const largo = (m: number, n: number) => {
        const p = (k: number, eje: number) => (k < cuenta ? posiciones[k * 3 + eje] : nuevasPosiciones[(k - cuenta) * 3 + eje])
        return Math.hypot(p(m, 0) - p(n, 0), p(m, 1) - p(n, 1), p(m, 2) - p(n, 2))
      }
      if (largo(ab, c) <= largo(b, ca)) {
        emitir(ab, b, c)
        emitir(ab, c, ca)
      } else {
        emitir(ab, b, ca)
        emitir(b, c, ca)
      }
    } else {
      // Dos dentro: se gira hasta que el de fuera sea `c`.
      while (distancia[c] < 0) [a, b, c] = [b, c, a]
      emitir(corte(b, c), c, corte(a, c))
    }
  }

  const posicionesFinales = new Float32Array(posiciones.length + nuevasPosiciones.length)
  posicionesFinales.set(posiciones)
  posicionesFinales.set(nuevasPosiciones, posiciones.length)
  const uvFinales = new Float32Array(uv.length + nuevasUv.length)
  uvFinales.set(uv)
  uvFinales.set(nuevasUv, uv.length)
  return { posiciones: posicionesFinales, uv: uvFinales, indices: Uint32Array.from(salida) }
}

// ------------------------------------------------------------------------------------- ceñir el borde

/** El ancho de la franja en que el paño baja a pegarse a lo que tapa, alrededor de la ventana. */
export const ANCHO_DEL_CENIDO = 0.055
/** Lo que queda entre el paño ceñido y el lecho. */
export const CLARO_DEL_CENIDO = 0.0028

const escalon = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * Cuánto se ciñe el paño a una distancia del borde de la ventana: todo en el borde, nada pasada la franja.
 * Los primeros milímetros van ceñidos del todo, como la tira adhesiva de un paño fenestrado.
 */
export function pesoDelCenido(distancia: number): number {
  if (distancia <= 0) return 1
  return 1 - escalon(0.006, ANCHO_DEL_CENIDO, distancia)
}

/** La altura a la que queda un punto de la tela una vez ceñido, sabiendo la que tenía, su lecho y cuánto se ciñe. */
const alturaCenida = (altura: number, lecho: number, peso: number): number => {
  if (peso <= 0 || Number.isNaN(lecho)) return altura
  const sobra = altura - (lecho + CLARO_DEL_CENIDO)
  return sobra > 0 ? altura - peso * sobra : altura
}

/** La arista más larga que se deja en la mitad de la franja pegada a la ventana, donde la tela va sobre la piel. */
export const ARISTA_JUNTO_A_LA_VENTANA = 0.007
/** Por debajo de esto una arista ya no se parte: la rejilla del relieve va a seis milímetros y no hay más que seguir. */
const ARISTA_MINIMA = 0.0025
/** Cuánto por encima del lecho tiene que pasar la cuerda de una arista para darla por buena. */
const HOLGURA_DE_LA_CUERDA = 0.0006
/**
 * El tope de pasadas. Casi todo se parte en las tres primeras; lo que sigue son las aristas que nacen en cada
 * pasada justo donde la franja deja de ir ceñida —la diagonal de un triángulo recién partido, con un extremo a
 * cada lado de esa raya—, que son un puñado y cada vez más cortas. Con cuatro quedaba alguna de nueve milímetros
 * bien dentro de la mitad ceñida; con seis, la tela de pabellón ya no cambia.
 */
const PASADAS_AL_AFINAR = 6

/**
 * Parte en trozos más pequeños los triángulos de la franja que se va a ceñir, donde hace falta. Devuelve otra
 * tela, o la misma si no hubo nada que partir.
 *
 * `cenirAlBorde` baja cada vértice hasta su lecho, y con eso los vértices quedan bien; lo que queda mal es lo
 * que hay entre ellos. La tela llega con aristas de nueve a catorce milímetros, y en la cara de una pantorrilla
 * la piel sube un centímetro en seis milímetros: un triángulo con un vértice arriba del miembro y otro ya en la
 * sábana tiende entre los dos una cuerda recta que pasa por dentro de la pierna, y por encima de la tela asoma
 * una tira de piel. Se vio al mover la ventana a mano hasta dejar su borde junto a la pantorrilla, y midiéndolo
 * resultó estar también en la automática: unos setenta triángulos de seis mil, con la cuerda hasta tres
 * centímetros por debajo del lecho.
 *
 * Dos reglas, las dos por arista, que es lo que deja la tela cosida —la arista que se parte, se parte para los
 * dos triángulos que la comparten y por el mismo punto—:
 *
 *  - en la mitad de la franja pegada a la ventana, ninguna arista de más de siete milímetros;
 *  - en el resto, se parte la arista cuya cuerda, una vez ceñidos sus extremos, se mete bajo el lecho.
 *
 * Y se repite, porque media arista puede seguir cruzando la pared. El vuelo que cuelga junto al colchón no se
 * toca: ya estaba por debajo del lecho antes de ceñir nada.
 *
 * La otra salida era ceñir contra un lecho «engordado» —lo más alto en un centímetro y medio a la redonda—, que
 * son diez líneas y da la garantía entera. Se descartó por lo que hace al borde: junto a un miembro lo deja
 * flotando a la altura de su hombro, a varios centímetros de la sábana, y por debajo se ve el hueco.
 */
export function afinarElBorde(tela: Tela, zona: ZonaDelPano, relieve: Relieve, radio = radioDeLaVentana(zona)): Tela {
  const signo = relieve.signo
  const alEmpezar = tela.posiciones.length / 3
  // Los vértices nuevos van aparte y se juntan al final: copiar la tela entera para añadirle unos miles de
  // puntos era lo más caro de todo, y esto corre en cada cuadro mientras se arrastra un asa del marco.
  const nuevasPosiciones: number[] = []
  const nuevasUv: number[] = []
  const coordenada = (i: number, k: number) => (i < alEmpezar ? tela.posiciones[i * 3 + k] : nuevasPosiciones[(i - alEmpezar) * 3 + k])
  const deLaUv = (i: number, k: number) => (i < alEmpezar ? tela.uv[i * 2 + k] : nuevasUv[(i - alEmpezar) * 2 + k])

  // Por vértice: cuánto se ciñe, su altura sin ceñir y la que tendrá ceñido. Crecen con los vértices nuevos.
  const peso: number[] = new Array(alEmpezar)
  const altura: number[] = new Array(alEmpezar)
  const cenida: number[] = new Array(alEmpezar)
  const medir = (desde: number, hasta: number) => {
    for (let i = desde; i < hasta; i++) {
      const x = coordenada(i, 0)
      const y = coordenada(i, 1)
      peso[i] = pesoDelCenido(distanciaALaVentana(zona, x, y, radio))
      altura[i] = signo * coordenada(i, 2)
      cenida[i] = peso[i] > 0 ? alturaCenida(altura[i], alturaEn(relieve, relieve.lecho, x, y), peso[i]) : altura[i]
    }
  }
  medir(0, alEmpezar)

  // Lo que queda lejos de la ventana no se va a ceñir ni a partir: se aparta una vez y no se vuelve a mirar.
  const lejos: number[] = []
  let franja: number[] = []
  for (let t = 0; t < tela.indices.length; t += 3) {
    const a = tela.indices[t]
    const b = tela.indices[t + 1]
    const c = tela.indices[t + 2]
    ;(peso[a] <= 0 && peso[b] <= 0 && peso[c] <= 0 ? lejos : franja).push(a, b, c)
  }

  const hayQuePartir = (a: number, b: number): boolean => {
    const masCenido = Math.max(peso[a], peso[b])
    if (masCenido <= 0) return false
    const x = coordenada(a, 0)
    const y = coordenada(a, 1)
    const dx = coordenada(b, 0) - x
    const dy = coordenada(b, 1) - y
    const largo = Math.hypot(dx, dy)
    if (largo < ARISTA_MINIMA) return false
    if (masCenido > 0.5 && largo > ARISTA_JUNTO_A_LA_VENTANA) return true
    for (const t of [0.25, 0.5, 0.75]) {
      const lecho = alturaEn(relieve, relieve.lecho, x + dx * t, y + dy * t)
      if (Number.isNaN(lecho)) continue
      // Lo que ya iba por debajo del lecho es el vuelo que cuelga: no es una cuerda que haya que levantar.
      if (altura[a] + (altura[b] - altura[a]) * t < lecho) continue
      if (cenida[a] + (cenida[b] - cenida[a]) * t < lecho + HOLGURA_DE_LA_CUERDA) return true
    }
    return false
  }
  const largo2 = (m: number, n: number) =>
    (coordenada(m, 0) - coordenada(n, 0)) ** 2 + (coordenada(m, 1) - coordenada(n, 1)) ** 2 + (coordenada(m, 2) - coordenada(n, 2)) ** 2

  let cuenta = alEmpezar
  for (let pasada = 0; pasada < PASADAS_AL_AFINAR; pasada++) {
    const antes = cuenta
    const medios = new Map<number, number>()
    /** El vértice de en medio de la arista, si hay que partirla; -1 si no. Una vez por arista. */
    const medio = (a: number, b: number): number => {
      const clave = a < b ? a * antes + b : b * antes + a
      const ya = medios.get(clave)
      if (ya !== undefined) return ya
      let nuevo = -1
      if (hayQuePartir(a, b)) {
        nuevo = cuenta++
        for (let k = 0; k < 3; k++) nuevasPosiciones.push((coordenada(a, k) + coordenada(b, k)) / 2)
        for (let k = 0; k < 2; k++) nuevasUv.push((deLaUv(a, k) + deLaUv(b, k)) / 2)
      }
      medios.set(clave, nuevo)
      return nuevo
    }

    const salida: number[] = []
    for (let t = 0; t < franja.length; t += 3) {
      let a = franja[t]
      let b = franja[t + 1]
      let c = franja[t + 2]
      let ab = medio(a, b)
      let bc = medio(b, c)
      let ca = medio(c, a)
      const cuantas = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0)
      if (cuantas === 0) {
        salida.push(a, b, c)
      } else if (cuantas === 3) {
        salida.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
      } else if (cuantas === 1) {
        // Se gira hasta que la arista partida sea la `ab`: el giro conserva el sentido del triángulo.
        while (ab < 0) [a, b, c, ab, bc, ca] = [b, c, a, bc, ca, ab]
        salida.push(a, ab, c, ab, b, c)
      } else {
        // Dos: se gira hasta que la entera sea la `ca`. Queda la punta de `b` y un cuadrilátero, que se cierra
        // por su diagonal más corta para no dejar un triángulo en aguja.
        while (ca >= 0) [a, b, c, ab, bc, ca] = [b, c, a, bc, ca, ab]
        salida.push(ab, b, bc)
        if (largo2(ab, c) <= largo2(a, bc)) salida.push(a, ab, c, ab, bc, c)
        else salida.push(a, ab, bc, a, bc, c)
      }
    }
    if (cuenta === antes) break
    franja = salida
    medir(antes, cuenta)
  }

  if (cuenta === alEmpezar) return tela
  const posiciones = new Float32Array(cuenta * 3)
  posiciones.set(tela.posiciones)
  posiciones.set(nuevasPosiciones, alEmpezar * 3)
  const uv = new Float32Array(cuenta * 2)
  uv.set(tela.uv)
  uv.set(nuevasUv, alEmpezar * 2)
  const indices = new Uint32Array(lejos.length + franja.length)
  indices.set(lejos)
  indices.set(franja, lejos.length)
  return { posiciones, uv, indices }
}

/**
 * Baja el paño a pegarse a la piel y a la sábana alrededor de la ventana. Cambia la tela en su sitio.
 *
 * La tela se simuló cayendo sobre el cuerpo entero, sin ventana: junto a un muslo no toca la sábana, hace una
 * carpa desde lo más ancho del muslo hasta el colchón. Cortada tal cual, por el borde de la ventana se vería el
 * hueco de debajo, y en ese hueco no hay nada —el cuerpo entero no está, solo lo recortado—. En pabellón el
 * borde de un paño fenestrado va pegado a la piel; aquí se pega igual, y de paso cierra la vista.
 *
 * Solo baja, nunca sube, y solo lo que está por encima del lecho: el vuelo que cuelga junto al colchón queda
 * por debajo de la sábana, con razón, y no se toca.
 */
export function cenirAlBorde(tela: Tela, zona: ZonaDelPano, relieve: Relieve, radio = radioDeLaVentana(zona)): void {
  const { posiciones } = tela
  const signo = relieve.signo
  for (let i = 0; i < posiciones.length; i += 3) {
    const x = posiciones[i]
    const y = posiciones[i + 1]
    const peso = pesoDelCenido(distanciaALaVentana(zona, x, y, radio))
    if (peso <= 0) continue
    // La misma cuenta con la que `afinarElBorde` decide por dónde partir: si se separan, afinar deja de servir.
    posiciones[i + 2] = signo * alturaCenida(signo * posiciones[i + 2], alturaEn(relieve, relieve.lecho, x, y), peso)
  }
}

// ---------------------------------------------------------------------- la piel que se sale del atlas

/** Lo que la piel de la escena tiene que pasar del lecho para subirlo: menos que esto es el redondeo de la rejilla. */
const TOLERANCIA_DE_LA_PIEL = 0.0008
/** Cada cuánto se mira un triángulo de la piel al posarlo en la rejilla: media celda. */
const PASO_AL_MIRAR_LA_PIEL = 0.003
/** Lo más que se trocea el lado de un triángulo para mirarlo: uno enorme no puede costar un cuadro. */
const TROZOS_POR_LADO = 16
/** Cuánto hacia dentro de la ventana sigue contando una celda: la tela del borde lee las de un paso más allá. */
const DENTRO_QUE_AUN_CUENTA = 0.012

/** Un relieve con el lecho subido por donde la piel de la escena queda por encima de la del atlas. */
export interface RelieveConLaPiel extends Relieve {
  /** La altura nueva de cada celda que subió, en las unidades de la rejilla; `sinDato` en las que no. */
  subido: Int16Array
  /** Entre qué celdas subió: `[iMin, iMax, jMin, jMax]`. */
  dondeSubio: [number, number, number, number]
}

/**
 * Sube el lecho hasta la piel de la escena donde esta queda por encima. `null` si no queda en ninguna parte.
 *
 * El relieve sale del atlas, y el atlas es un paciente sano y quieto. El del caso no: la piel se abulta sobre el
 * fragmento desplazado y sobre la placa (`abultamientoDeLaPiel.ts`, hasta tres centímetros). Mientras la
 * ventana fue siempre la automática no se notó, porque el bulto cae dentro de lo recortado y ahí no hay tela.
 * Al mover la ventana a mano hasta dejar su borde junto al tobillo de una tibia fracturada, el paño se ciñó a la
 * pierna del atlas, dos centímetros y medio más estrecha que la de la escena, y la piel asomó por fuera del
 * marco en una tira del largo de la fractura.
 *
 * Cada punto de la piel que pasa del lecho sube las cuatro celdas que lo rodean hasta su altura: interpolado
 * entre ellas, el lecho ya no puede quedar por debajo de él. Es la misma garantía que da `cubrir` al escribir
 * el relieve (`scripts/pabellon/generar.py`), con un paso de más de holgura en los bordes del bulto.
 *
 * `triangulos` son nueve números por triángulo —x, y, z de sus tres vértices—, en las coordenadas del cuerpo.
 */
export function lechoConLaPiel(relieve: Relieve, triangulos: ArrayLike<number>): RelieveConLaPiel | null {
  const { nx, ny, x0, y0, paso, unidad, sinDato, signo } = relieve
  let lecho = relieve.lecho
  let subido: Int16Array | null = null
  let iMin = nx
  let iMax = -1
  let jMin = ny
  let jMax = -1
  for (let t = 0; t + 8 < triangulos.length; t += 9) {
    const ax = triangulos[t]
    const ay = triangulos[t + 1]
    const ah = signo * triangulos[t + 2]
    const bx = triangulos[t + 3]
    const by = triangulos[t + 4]
    const bh = signo * triangulos[t + 5]
    const cx = triangulos[t + 6]
    const cy = triangulos[t + 7]
    const ch = signo * triangulos[t + 8]
    const lado = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - bx, cy - by), Math.hypot(ax - cx, ay - cy))
    const n = Math.min(TROZOS_POR_LADO, Math.max(1, Math.ceil(lado / PASO_AL_MIRAR_LA_PIEL)))
    for (let p = 0; p <= n; p++) {
      for (let q = 0; q <= n - p; q++) {
        const u = p / n
        const v = q / n
        const w = 1 - u - v
        const h = ah * w + bh * u + ch * v
        const fx = (ax * w + bx * u + cx * v - x0) / paso - 0.5
        const fy = (ay * w + by * u + cy * v - y0) / paso - 0.5
        const i = Math.floor(fx)
        const j = Math.floor(fy)
        if (i < -1 || j < -1 || i >= nx || j >= ny) continue
        // La cuenta de `alturaEn`, aquí dentro: se hace por cada punto de la piel y no puede costar una llamada.
        const du = fx - i
        const dw = fy - j
        let suma = 0
        let peso = 0
        for (let dj = 0; dj < 2; dj++) {
          const jj = j + dj
          if (jj < 0 || jj >= ny) continue
          for (let di = 0; di < 2; di++) {
            const ii = i + di
            if (ii < 0 || ii >= nx) continue
            const valor = lecho[jj * nx + ii]
            if (valor === sinDato) continue
            const parte = (di ? du : 1 - du) * (dj ? dw : 1 - dw)
            suma += valor * parte
            peso += parte
          }
        }
        if (peso > 1e-6 && h <= (suma / peso) * unidad + TOLERANCIA_DE_LA_PIEL) continue
        const entero = Math.min(32767, Math.max(-32767, Math.ceil(h / unidad)))
        for (let dj = 0; dj < 2; dj++) {
          const jj = j + dj
          if (jj < 0 || jj >= ny) continue
          for (let di = 0; di < 2; di++) {
            const ii = i + di
            if (ii < 0 || ii >= nx) continue
            const k = jj * nx + ii
            if (lecho[k] !== sinDato && lecho[k] >= entero) continue
            if (!subido) {
              // El lecho del relieve es de todos los paños que se corten de él: se sube una copia.
              lecho = lecho.slice()
              subido = new Int16Array(nx * ny).fill(sinDato)
            }
            lecho[k] = entero
            subido[k] = entero
            if (ii < iMin) iMin = ii
            if (ii > iMax) iMax = ii
            if (jj < jMin) jMin = jj
            if (jj > jMax) jMax = jj
          }
        }
      }
    }
  }
  if (!subido) return null
  return { ...relieve, lecho, subido, dondeSubio: [iMin, iMax, jMin, jMax] }
}

/**
 * Levanta la tela entera por donde la piel de la escena quedó por encima de ella. Devuelve la misma si no hizo
 * falta levantar nada.
 *
 * Lejos de la ventana el paño no se ciñe: queda como cayó sobre el cuerpo del atlas, a unos milímetros de su
 * piel, y un bulto de dos centímetros lo atraviesa igual que al borde ceñido. Aquí no hace falta afinar: es
 * tela suelta, y `lechoConLaPiel` ya deja el lecho un paso más ancho que el bulto, que con el claro basta para
 * que la cuerda entre dos vértices pase por encima. Junto a la ventana, `cenirAlBorde` la baja después a su
 * sitio exacto.
 *
 * Solo se toca la tela que tiene debajo alguna celda subida. El resto del lecho es el del atlas, y contra él la
 * tela está donde cayó: el vuelo que cuelga junto al colchón queda por debajo de la sábana, y no hay que subirlo.
 *
 * Se lee el lecho interpolado, como al ceñir. La primera versión tomaba lo más alto a un paso a la redonda, celda
 * a celda, y dejaba la tela en terrazas de seis milímetros.
 */
export function levantarLaTela(tela: Tela, relieve: RelieveConLaPiel): Tela {
  const { nx, ny, x0, y0, paso, sinDato, signo, subido } = relieve
  const [iMin, iMax, jMin, jMax] = relieve.dondeSubio
  let posiciones = tela.posiciones
  for (let v = 0; v < posiciones.length; v += 3) {
    // Las cuatro celdas entre cuyos centros cae el vértice: las mismas que lee `alturaEn`.
    const i = Math.floor((posiciones[v] - x0) / paso - 0.5)
    if (i < iMin - 1 || i > iMax) continue
    const j = Math.floor((posiciones[v + 1] - y0) / paso - 0.5)
    if (j < jMin - 1 || j > jMax) continue
    let algunaSubio = false
    for (let jj = Math.max(0, j); jj <= Math.min(ny - 1, j + 1) && !algunaSubio; jj++) {
      for (let ii = Math.max(0, i); ii <= Math.min(nx - 1, i + 1); ii++) {
        if (subido[jj * nx + ii] !== sinDato) {
          algunaSubio = true
          break
        }
      }
    }
    if (!algunaSubio) continue
    const minima = alturaEn(relieve, relieve.lecho, posiciones[v], posiciones[v + 1]) + CLARO_DEL_CENIDO
    if (!(signo * posiciones[v + 2] < minima)) continue
    // La tela del archivo es de la que se cortan todas las ventanas: se levanta una copia.
    if (posiciones === tela.posiciones) posiciones = tela.posiciones.slice()
    posiciones[v + 2] = signo * minima
  }
  return posiciones === tela.posiciones ? tela : { ...tela, posiciones }
}

/**
 * Una huella de lo que subió donde hay tela: fuera de la ventana y en su mismo borde. Dos relieves con la misma
 * huella dan el mismo paño, y eso es lo que evita rehacerlo mientras se reduce una fractura a la vista: el bulto
 * cambia en cada cuadro, pero dentro de la ventana, donde no hay nada que ceñir. Vacía si no subió nada ahí.
 */
export function huellaDeLoSubido(relieve: RelieveConLaPiel | null, zona: ZonaDelPano | null): string {
  if (!relieve) return ''
  const { nx, x0, y0, paso, sinDato, subido } = relieve
  const [iMin, iMax, jMin, jMax] = relieve.dondeSubio
  const radio = zona ? radioDeLaVentana(zona) : 0
  let cuantas = 0
  let mezcla = 2166136261
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const valor = subido[j * nx + i]
      if (valor === sinDato) continue
      if (zona && distanciaALaVentana(zona, x0 + (i + 0.5) * paso, y0 + (j + 0.5) * paso, radio) < -DENTRO_QUE_AUN_CUENTA) continue
      cuantas++
      mezcla = Math.imul(mezcla ^ (j * nx + i), 16777619)
      mezcla = Math.imul(mezcla ^ (valor & 0xffff), 16777619)
    }
  }
  return cuantas ? `${cuantas}:${mezcla >>> 0}` : ''
}

// ------------------------------------------------------------------------------------------ lo que tapa

/**
 * La tela, repartida en casillas sobre el plano (x, y), para preguntarle rápido qué tapa.
 *
 * El lienzo no tiene con qué acelerar un rayo contra ochenta mil triángulos, y esa pregunta se hace con cada
 * movimiento del ratón. Pero el paño es casi un campo de alturas —visto desde arriba apenas se pisa a sí
 * mismo—, y eso lo hace fácil: un rayo solo puede tocar los triángulos de las casillas por las que pasa su
 * sombra.
 */
export interface IndiceDeLaTela {
  tela: Tela
  x0: number
  y0: number
  celda: number
  nx: number
  ny: number
  /** Dónde empiezan, en `triangulos`, los de cada casilla; uno más que casillas. */
  inicio: Uint32Array
  triangulos: Uint32Array
  /** En qué rayo se probó por última vez cada triángulo: uno que cruza varias casillas se prueba una sola vez. */
  visto: Uint32Array
  rayo: number
}

export function indexarLaTela(tela: Tela, celda = 0.02): IndiceDeLaTela {
  const { posiciones, indices } = tela
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  // Solo cuentan los vértices que algún triángulo usa: al cortar la ventana quedan sueltos los de dentro.
  for (let k = 0; k < indices.length; k++) {
    const x = posiciones[indices[k] * 3]
    const y = posiciones[indices[k] * 3 + 1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (!(x1 >= x0)) {
    return { tela, x0: 0, y0: 0, celda, nx: 0, ny: 0, inicio: new Uint32Array(1), triangulos: new Uint32Array(0), visto: new Uint32Array(0), rayo: 0 }
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / celda + 1e-6))
  const ny = Math.max(1, Math.ceil((y1 - y0) / celda + 1e-6))
  const casilla = (v: number, origen: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - origen) / celda)))
  const cuantos = indices.length / 3
  const limites = new Int32Array(cuantos * 4)
  const inicio = new Uint32Array(nx * ny + 1)
  for (let t = 0; t < cuantos; t++) {
    const a = indices[t * 3] * 3
    const b = indices[t * 3 + 1] * 3
    const c = indices[t * 3 + 2] * 3
    const i0 = casilla(Math.min(posiciones[a], posiciones[b], posiciones[c]), x0, nx)
    const i1 = casilla(Math.max(posiciones[a], posiciones[b], posiciones[c]), x0, nx)
    const j0 = casilla(Math.min(posiciones[a + 1], posiciones[b + 1], posiciones[c + 1]), y0, ny)
    const j1 = casilla(Math.max(posiciones[a + 1], posiciones[b + 1], posiciones[c + 1]), y0, ny)
    limites.set([i0, i1, j0, j1], t * 4)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) inicio[j * nx + i + 1]++
  }
  for (let k = 0; k < nx * ny; k++) inicio[k + 1] += inicio[k]
  const triangulos = new Uint32Array(inicio[nx * ny])
  const puesto = inicio.slice(0, nx * ny)
  for (let t = 0; t < cuantos; t++) {
    for (let j = limites[t * 4 + 2]; j <= limites[t * 4 + 3]; j++) {
      for (let i = limites[t * 4]; i <= limites[t * 4 + 1]; i++) triangulos[puesto[j * nx + i]++] = t
    }
  }
  return { tela, x0, y0, celda, nx, ny, inicio, triangulos, visto: new Uint32Array(cuantos), rayo: 0 }
}

/**
 * ¿Atraviesa la tela este rayo antes de llegar a `hasta`? Es lo que decide que un clic no entra.
 *
 * El rayo va en las coordenadas del cuerpo, y `hasta` es la distancia al punto que tocó en el modelo, medida
 * en largos de `direccion`. Se pregunta a la misma malla que se dibuja, ya cortada y ceñida: lo que se ve por
 * la ventana se puede tocar y lo que el paño tapa no, sin una franja en que las dos cosas no coincidan.
 *
 * La tela cuenta por sus dos caras. Quien mete la cámara debajo del paño ve la pieza por dentro, y por dentro
 * la toca.
 */
export function laTelaTapa(indice: IndiceDeLaTela, origen: Vec3, direccion: Vec3, hasta: number): boolean {
  const { nx, ny, celda, x0, y0 } = indice
  if (!(hasta > 0) || nx === 0) return false
  // El tramo del rayo cuya sombra cae sobre las casillas.
  let desde = 0
  let fin = hasta
  for (let eje = 0; eje < 2; eje++) {
    const o = origen[eje]
    const d = direccion[eje]
    const menor = eje === 0 ? x0 : y0
    const mayor = menor + (eje === 0 ? nx : ny) * celda
    if (Math.abs(d) < 1e-12) {
      if (o < menor || o > mayor) return false
      continue
    }
    const t1 = (menor - o) / d
    const t2 = (mayor - o) / d
    desde = Math.max(desde, Math.min(t1, t2))
    fin = Math.min(fin, Math.max(t1, t2))
  }
  if (fin < desde) return false

  indice.rayo = (indice.rayo + 1) >>> 0
  if (indice.rayo === 0) {
    indice.visto.fill(0)
    indice.rayo = 1
  }
  const { posiciones, indices } = indice.tela
  const [ox, oy, oz] = origen
  const [dx, dy, dz] = direccion
  // Un pelo antes del punto tocado: la piel bajo el borde ceñido está a tres milímetros del paño, y el redondeo
  // de un rayo que llega justo hasta ella no debe darla por tapada ni por descubierta al azar.
  const limite = hasta * (1 - 1e-6) - 1e-5

  const probar = (i: number, j: number): boolean => {
    const k = j * nx + i
    for (let n = indice.inicio[k]; n < indice.inicio[k + 1]; n++) {
      const t = indice.triangulos[n]
      if (indice.visto[t] === indice.rayo) continue
      indice.visto[t] = indice.rayo
      const a = indices[t * 3] * 3
      const b = indices[t * 3 + 1] * 3
      const c = indices[t * 3 + 2] * 3
      // Möller y Trumbore, sin mirar de qué cara viene el rayo.
      const e1x = posiciones[b] - posiciones[a]
      const e1y = posiciones[b + 1] - posiciones[a + 1]
      const e1z = posiciones[b + 2] - posiciones[a + 2]
      const e2x = posiciones[c] - posiciones[a]
      const e2y = posiciones[c + 1] - posiciones[a + 1]
      const e2z = posiciones[c + 2] - posiciones[a + 2]
      const px = dy * e2z - dz * e2y
      const py = dz * e2x - dx * e2z
      const pz = dx * e2y - dy * e2x
      const det = e1x * px + e1y * py + e1z * pz
      if (Math.abs(det) < 1e-18) continue
      const inv = 1 / det
      const sx = ox - posiciones[a]
      const sy = oy - posiciones[a + 1]
      const sz = oz - posiciones[a + 2]
      const u = (sx * px + sy * py + sz * pz) * inv
      if (u < 0 || u > 1) continue
      const qx = sy * e1z - sz * e1y
      const qy = sz * e1x - sx * e1z
      const qz = sx * e1y - sy * e1x
      const v = (dx * qx + dy * qy + dz * qz) * inv
      if (v < 0 || u + v > 1) continue
      const donde = (e2x * qx + e2y * qy + e2z * qz) * inv
      if (donde > 0 && donde < limite) return true
    }
    return false
  }

  // Las casillas por las que pasa la sombra del rayo, una tras otra (Amanatides y Woo).
  const entrada = desde + 1e-9
  let i = Math.min(nx - 1, Math.max(0, Math.floor((ox + dx * entrada - x0) / celda)))
  let j = Math.min(ny - 1, Math.max(0, Math.floor((oy + dy * entrada - y0) / celda)))
  const pasoI = dx > 0 ? 1 : -1
  const pasoJ = dy > 0 ? 1 : -1
  const hastaElBorde = (o: number, d: number, origenDeLaRejilla: number, casilla: number, paso: number) =>
    Math.abs(d) < 1e-12 ? Infinity : (origenDeLaRejilla + (casilla + (paso > 0 ? 1 : 0)) * celda - o) / d
  let tI = hastaElBorde(ox, dx, x0, i, pasoI)
  let tJ = hastaElBorde(oy, dy, y0, j, pasoJ)
  const porCasillaI = Math.abs(dx) < 1e-12 ? Infinity : celda / Math.abs(dx)
  const porCasillaJ = Math.abs(dy) < 1e-12 ? Infinity : celda / Math.abs(dy)
  for (let vuelta = 0; vuelta < nx + ny + 2; vuelta++) {
    if (probar(i, j)) return true
    if (Math.min(tI, tJ) > fin) return false
    if (tI < tJ) {
      i += pasoI
      tI += porCasillaI
    } else {
      j += pasoJ
      tJ += porCasillaJ
    }
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false
  }
  return false
}

/** Lo que impide tocar un punto del modelo: el paño, el colchón, o que al paciente se le está dando la vuelta. */
export type QueTapa = 'pano' | 'colchon' | 'vuelta'

/** Lo que se le dice a quien pincha algo tapado. Corto: sale en la etiqueta del lienzo, junto al cursor. */
export function avisoDeLoTapado(que: QueTapa): string {
  if (que === 'pano') return 'Eso queda bajo el paño: se opera por la ventana. El paño se quita en «Capas».'
  if (que === 'colchon') return 'Eso queda contra el colchón: para operar por ese lado, dé la vuelta al paciente.'
  return 'Se le está dando la vuelta al paciente.'
}

/**
 * ¿Atraviesa el colchón este rayo antes de llegar a `hasta`?
 *
 * Hasta que hubo colchón, quien llevaba la cámara por detrás de la rodilla la operaba por detrás. Ahora ahí se
 * ve un colchón, y un clic que lo atravesara cortaría una piel que no se ve: lo que no se ve no se toca, que es
 * la misma regla del paño. Para operar por detrás se le da la vuelta al paciente, como en el pabellón.
 *
 * El colchón es una caja en su propio marco: de canto a canto a lo ancho y a lo largo, y de su cara de arriba
 * —`hundimiento` por debajo del plano de apoyo— a la de abajo. Las esquinas redondeadas no se cuentan: son dos
 * centímetros en un sitio donde nunca hay paciente.
 */
export function elColchonTapa(marco: MarcoDelColchon, medidas: MedidasDelColchon, origen: Vec3, direccion: Vec3, hasta: number): boolean {
  if (!(hasta > 0)) return false
  const o: Vec3 = [origen[0] - marco.origen[0], origen[1] - marco.origen[1], origen[2] - marco.origen[2]]
  const ejes: [Vec3, number, number][] = [
    [marco.ancho, -medidas.ancho / 2, medidas.ancho / 2],
    [marco.largo, -medidas.largo / 2, medidas.largo / 2],
    [marco.normal, -medidas.grosor, -medidas.hundimiento],
  ]
  let desde = 0
  let fin = hasta * (1 - 1e-6) - 1e-5
  for (const [eje, menor, mayor] of ejes) {
    const p = o[0] * eje[0] + o[1] * eje[1] + o[2] * eje[2]
    const d = direccion[0] * eje[0] + direccion[1] * eje[1] + direccion[2] * eje[2]
    if (Math.abs(d) < 1e-12) {
      if (p < menor || p > mayor) return false
      continue
    }
    const t1 = (menor - p) / d
    const t2 = (mayor - p) / d
    desde = Math.max(desde, Math.min(t1, t2))
    fin = Math.min(fin, Math.max(t1, t2))
    if (fin < desde) return false
  }
  return true
}

// ------------------------------------------------------------------------------- dar la vuelta al paciente

export type Cuaternion = [number, number, number, number]

/** Una postura rígida: dónde está y cómo está girado. */
export interface Postura {
  posicion: Vec3
  giro: Cuaternion
}

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const porEscalar = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const mezcla = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export function multiplicarCuaterniones(a: Cuaternion, b: Cuaternion): Cuaternion {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

const conjugado = (q: Cuaternion): Cuaternion => [-q[0], -q[1], -q[2], q[3]]

export function girarVector(q: Cuaternion, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  // v + 2·q×(q×v + w·v), con q el vector del cuaternión.
  const cx = y * v[2] - z * v[1] + w * v[0]
  const cy = z * v[0] - x * v[2] + w * v[1]
  const cz = x * v[1] - y * v[0] + w * v[2]
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)]
}

export function cuaternionDelEje(eje: Vec3, angulo: number): Cuaternion {
  const largo = Math.hypot(eje[0], eje[1], eje[2]) || 1
  const s = Math.sin(angulo / 2) / largo
  return [eje[0] * s, eje[1] * s, eje[2] * s, Math.cos(angulo / 2)]
}

/** El cuaternión de una base ortonormal diestra: lleva X, Y y Z a esos tres vectores. */
export function cuaternionDeLaBase(x: Vec3, y: Vec3, z: Vec3): Cuaternion {
  const traza = x[0] + y[1] + z[2]
  let q: Cuaternion
  if (traza > 0) {
    const s = Math.sqrt(traza + 1) * 2
    q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2
    q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]
  } else if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2
    q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]
  } else {
    const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]
  }
  const largo = Math.hypot(...q) || 1
  return [q[0] / largo, q[1] / largo, q[2] / largo, q[3] / largo]
}

function mezclarGiros(a: Cuaternion, b: Cuaternion, t: number): Cuaternion {
  let coseno = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  // Por el camino corto: q y −q son el mismo giro.
  const hacia: Cuaternion = coseno < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b
  coseno = Math.abs(coseno)
  let pa = 1 - t
  let pb = t
  if (coseno < 0.9995) {
    const angulo = Math.acos(coseno)
    pa = Math.sin((1 - t) * angulo) / Math.sin(angulo)
    pb = Math.sin(t * angulo) / Math.sin(angulo)
  }
  const q: Cuaternion = [a[0] * pa + hacia[0] * pb, a[1] * pa + hacia[1] * pb, a[2] * pa + hacia[2] * pb, a[3] * pa + hacia[3] * pb]
  const largo = Math.hypot(...q) || 1
  return [q[0] / largo, q[1] / largo, q[2] / largo, q[3] / largo]
}

/**
 * La postura del colchón en su sitio. El `.glb` del colchón viene tumbado en su propio marco —X el ancho, Y
 * hacia el paciente y −Z el largo—, y esto lo lleva al cuerpo.
 */
export function posturaDelColchon(marco: MarcoDelColchon): Postura {
  return { posicion: [...marco.origen], giro: cuaternionDeLaBase(marco.ancho, marco.normal, porEscalar(marco.largo, -1)) }
}

/** Gira una postura un ángulo alrededor de un eje que pasa por un punto. */
export function girarLaPostura(postura: Postura, punto: Vec3, eje: Vec3, angulo: number): Postura {
  const q = cuaternionDelEje(eje, angulo)
  return { posicion: suma(girarVector(q, resta(postura.posicion, punto)), punto), giro: multiplicarCuaterniones(q, postura.giro) }
}

/** Sale despacio y llega despacio. */
export const suavizar = (t: number) => {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

/**
 * Dónde está el colchón en cada instante de una vuelta, con `t` de 0 a 1.
 *
 * En el simulador **se mueve la vista y no el modelo** (`posicionDelPaciente.ts`): pasar de supino a prono es
 * llevar la cámara al otro lado del paciente, media vuelta alrededor de su eje largo. Con un colchón en la
 * escena eso solo no basta, porque el colchón se quedaría donde estaba: delante de la cámara, tapando al
 * paciente. Así que el colchón da la misma media vuelta que la cámara. En la pantalla no se mueve —la cámara y
 * él giran juntos—, y lo que se ve es al paciente rodando sobre la camilla, que es lo que el dueño pidió.
 *
 * Tres cosas más, pequeñas, para que la vuelta se pueda mirar:
 *
 * - El colchón de boca abajo no es el de boca arriba girado: apoya en el pecho y no en la espalda, y está
 *   corrido hacia la cabeza para que los pies cuelguen. Esa diferencia se reparte a lo largo de la vuelta.
 * - A media vuelta el paciente está de canto, y de canto es más ancho que tumbado: el colchón se aparta
 *   `despeje` para no atravesarlo. Visto desde la cámara, el paciente se levanta para girar y vuelve a bajar.
 * - `sentido` es hacia qué lado rueda: +1 o −1.
 *
 * `eje` es el eje largo del paciente y pasa por `pivote`, que es a donde mira la cámara.
 */
export function colchonAlDarLaVuelta(
  t: number,
  desde: MarcoDelColchon,
  hasta: MarcoDelColchon,
  pivote: Vec3,
  eje: Vec3,
  despeje: number,
  sentido: 1 | -1 = 1,
): Postura {
  const avance = suavizar(t)
  const total = Math.PI * sentido
  const salida = posturaDelColchon(desde)
  // La postura de llegada, deshecha la media vuelta: dónde tendría que estar el colchón de boca abajo si no se
  // hubiera girado nada. Lo que la separa de la de salida es lo que hay que repartir.
  const llegada = girarLaPostura(posturaDelColchon(hasta), pivote, eje, -total)
  const lejos = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 2 * despeje
  const sinGirar: Postura = {
    posicion: suma(mezcla(salida.posicion, llegada.posicion, avance), porEscalar(desde.normal, -lejos)),
    giro: mezclarGiros(salida.giro, llegada.giro, avance),
  }
  return girarLaPostura(sinGirar, pivote, eje, total * avance)
}

/**
 * La postura de lo que va cosido al colchón —la sábana, el paño— cuando el colchón está en `colchon`. Esas
 * mallas vienen en el cuerpo, ya colocadas para el colchón en su `marco`; con el colchón en su sitio, esto da
 * la postura nula.
 */
export function posturaDeLoCosido(colchon: Postura, marco: MarcoDelColchon): Postura {
  const enSuSitio = posturaDelColchon(marco)
  const giro = multiplicarCuaterniones(colchon.giro, conjugado(enSuSitio.giro))
  return { posicion: resta(colchon.posicion, girarVector(giro, enSuSitio.posicion)), giro }
}

/**
 * Cuánto tiene que apartarse el colchón para que el modelo gire sin atravesarlo: lo que el modelo sobresale,
 * de canto, de lo que hoy lo separa del plano del colchón. `radio` es lo más lejos que llega el modelo de su
 * eje de giro, y `alPlano` lo que hay del eje al colchón.
 */
export function despejeParaGirar(radio: number, alPlano: number): number {
  return Math.max(0, radio - Math.max(0, alPlano)) + 0.025
}

/** Cómo mira la cámara: a qué punto, desde qué dirección (del punto a la cámara), con qué arriba y a qué distancia. */
export interface VistaDeLaCamara {
  centro: Vec3
  direccion: Vec3
  arriba: Vec3
  distancia: number
}

const productoCruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unitarioDe = (a: Vec3, siNulo: Vec3): Vec3 => {
  const largo = Math.hypot(a[0], a[1], a[2])
  return largo < 1e-12 ? siNulo : [a[0] / largo, a[1] / largo, a[2] / largo]
}

/** El giro de una cámara que mira así: su X a la derecha de la pantalla, su Y arriba y su Z hacia quien mira. */
function giroDeLaVista(vista: VistaDeLaCamara): Cuaternion {
  const z = unitarioDe(vista.direccion, [0, 0, 1])
  // El arriba que llega no tiene por qué ser perpendicular a la mirada (la pose de «De pie» abre con sesgo).
  const sobra = vista.arriba[0] * z[0] + vista.arriba[1] * z[1] + vista.arriba[2] * z[2]
  let y = unitarioDe([vista.arriba[0] - z[0] * sobra, vista.arriba[1] - z[1] * sobra, vista.arriba[2] - z[2] * sobra], [0, 0, 0])
  if (y[0] === 0 && y[1] === 0 && y[2] === 0) y = unitarioDe(productoCruz(z, [1, 0, 0]), [0, 1, 0])
  return cuaternionDeLaBase(productoCruz(y, z), y, z)
}

/**
 * Dónde está la cámara en cada instante de una vuelta, con `t` de 0 a 1: la pareja de `colchonAlDarLaVuelta`.
 *
 * La cámara da la misma media vuelta que el colchón, alrededor del mismo eje y con el mismo paso, y por eso en
 * la pantalla el colchón no se mueve y el que rueda es el paciente. Lo que separa la vista de salida de la de
 * llegada una vez deshecha esa media vuelta —venir de una vista girada a mano, o ir de «Prono» a «De pie»— se
 * reparte por el camino, igual que se reparte lo que separa a los dos colchones.
 */
export function camaraAlDarLaVuelta(
  t: number,
  desde: VistaDeLaCamara,
  hasta: VistaDeLaCamara,
  pivote: Vec3,
  eje: Vec3,
  sentido: 1 | -1 = 1,
): VistaDeLaCamara {
  const avance = suavizar(t)
  const total = Math.PI * sentido
  const deshacer = cuaternionDelEje(eje, -total)
  const llegada: VistaDeLaCamara = {
    centro: suma(girarVector(deshacer, resta(hasta.centro, pivote)), pivote),
    direccion: girarVector(deshacer, hasta.direccion),
    arriba: girarVector(deshacer, hasta.arriba),
    distancia: hasta.distancia,
  }
  const giro = multiplicarCuaterniones(cuaternionDelEje(eje, total * avance), mezclarGiros(giroDeLaVista(desde), giroDeLaVista(llegada), avance))
  const centro = mezcla(desde.centro, llegada.centro, avance)
  return {
    centro: suma(girarVector(cuaternionDelEje(eje, total * avance), resta(centro, pivote)), pivote),
    direccion: girarVector(giro, [0, 0, 1]),
    arriba: girarVector(giro, [0, 1, 0]),
    distancia: desde.distancia + (hasta.distancia - desde.distancia) * avance,
  }
}

/**
 * En qué decúbito tiene que estar el paciente para que se le pueda mirar desde ahí.
 *
 * Un paso puede guardar su encuadre sin decir la posición del paciente —la vista se giró a mano—. Con un
 * colchón en la escena hay que decidirla igual: si la cámara mira la espalda y el paciente está boca arriba, lo
 * que se ve es el colchón por debajo. Manda de qué lado está la cámara, y cerca del perfil, donde las dos valen,
 * se queda como estaba para no darle la vuelta por medio grado.
 */
export function decubitoDeLaVista(direccion: Vec3, actual: Decubito): Decubito {
  const haciaDelante = unitarioDe(direccion, [0, 0, 1])[2]
  if (haciaDelante > 0.2) return 'supino'
  if (haciaDelante < -0.2) return 'prono'
  return actual
}
