import referencias from '@/atlas/referenciasDelCuerpo.json'

/**
 * El color de cada parte del cuerpo (D-227): los codos más oscuros que el brazo, la palma más clara que el dorso,
 * los labios rojos, el blanco del ojo y el iris con su anillo.
 *
 * Sin `three` y sin sombreadores: se hornea al exportar, como color por vértice, y viaja en el archivo como `COLOR_0`.
 * Es el único sitio donde las coordenadas del cuerpo todavía son las del atlas. Un caso exportado se centra en lo que
 * se prepara (`centrarEnSuCaja`) y el desplazamiento no queda anotado en el archivo, así que un sombreador que
 * quisiera pintar «el codo» no sabría dónde está; con el color ya puesto en el vértice, el simulador y Blender lo leen
 * sin saber nada de anatomía, y un modelo viejo —sin colores— sigue viéndose como antes.
 *
 * **Lo que se hace aquí no es el detalle fino.** Los poros, las pecas y el relieve se calculan en el sombreador de la
 * piel (`aspectoDelPaciente.ts`) y no necesitan coordenadas del cuerpo. Aquí van las manchas de tamaño de un
 * centímetro o más, que es lo que una malla de cuatro a once milímetros de arista sabe llevar.
 *
 * **Multiplicadores, no colores.** El color de una pieza ya viene en su material, y otros lectores lo usan (el pliegue
 * de la piel pellizcada, los fragmentos): el vértice solo lo multiplica. Eso obliga a que todos los factores sean
 * menores que uno —un color por vértice no puede aclarar—, y por eso la palma sale «más clara» porque el dorso, la
 * cara y el antebrazo se oscurecen un poco, y no al revés. El tono de referencia, el que no se toca, es el de la
 * piel que no ve el sol: el tronco, la cara interna del brazo, la planta.
 */

export type Vec3 = [number, number, number]

const puntos = referencias as unknown as Record<string, Vec3>

/** Un punto de referencia del cuerpo, en las coordenadas del atlas. Falla con su nombre si no existe: un codo mal escrito no debe pintar el origen. */
function punto(nombre: string): Vec3 {
  const p = puntos[nombre]
  if (!p) throw new Error(`Falta el punto de referencia «${nombre}» en referenciasDelCuerpo.json.`)
  return p
}

/**
 * El punto de un lado: `codo` → `codo-derecho` y `codo-izquierdo`. Si el punto no tiene lado —la punta de la nariz— sirve
 * el mismo para los dos, y el desplazamiento de la zona (`correr`) lo separa hacia cada lado.
 */
function puntoDelLado(nombre: string, lado: (typeof LADOS)[number] | null): Vec3 {
  return lado && puntos[`${nombre}-${lado}`] ? punto(`${nombre}-${lado}`) : punto(nombre)
}
const LADOS = ['derecho', 'izquierdo'] as const

/**
 * Una mancha de color: un elipsoide, o una cápsula entre dos puntos, que multiplica el color de la piel por `tinte`
 * con una fuerza que baja suavemente hasta cero en el borde.
 */
interface Zona {
  /** El punto de referencia donde está, sin el lado: `codo`. Sin lado (`central`) se escribe tal cual. */
  en: string
  /** Si es una cápsula, el otro extremo. */
  hasta?: string
  /** Se repite en cada lado, con el eje X reflejado. */
  lados?: boolean
  /** Cuánto se corre el centro, en metros, para el lado derecho (el izquierdo lo refleja en X). */
  correr?: Vec3
  /** El radio en metros: uno solo, o los tres semiejes de un elipsoide. En una cápsula, el radio del tubo. */
  radio: number | Vec3
  /** El multiplicador del color de la piel, en lineal, en rojo, verde y azul. */
  tinte: Vec3
  /** De 0 a 1: cuánto del tinte llega al centro. */
  fuerza: number
  /**
   * Solo donde la piel mira hacia ahí: el dorso de la mano y no la palma, la planta y no el empeine. `desde` y `hasta`
   * son el producto de la normal por `eje` donde empieza y donde acaba de llegar del todo.
   */
  orientacion?: { eje: Vec3; desde: number; hasta: number }
  /**
   * Hasta qué fracción del radio la fuerza es entera (0,5 si no se dice). Los nudillos piden poca: con una meseta ancha
   * eran un disco de borde nítido, que es lo que no tiene una articulación.
   */
  meseta?: number
  /** De 0 a 1: cuánto varía la fuerza de un punto a otro, con un ruido de 6 mm, para que el borde no sea un óvalo exacto. */
  irregular?: number
}

const ATRAS: Vec3 = [0, 0, -1]
const ADELANTE: Vec3 = [0, 0, 1]
const ABAJO: Vec3 = [0, -1, 0]

/**
 * La piel, mancha a mancha. Los números salen de mirar el modelo en Blender y no de un libro: lo que importa es lo que
 * se ve al lado de lo demás, y una malla de este tamaño no sostiene más contraste que el que un ojo reconoce.
 */
const ZONAS: Zona[] = [
  // --- Lo que el sol toca: cara, cuello, antebrazos y dorso de las manos, y la parte de delante de las piernas.
  { en: 'punta-de-la-nariz', correr: [0, 0.045, -0.09], radio: [0.1, 0.12, 0.12], tinte: [0.96, 0.92, 0.88], fuerza: 0.9 },
  { en: 'menton', correr: [0, -0.075, -0.1], radio: [0.07, 0.07, 0.08], tinte: [0.95, 0.91, 0.87], fuerza: 0.9 },
  { en: 'codo', hasta: 'nudillo-medio', lados: true, radio: 0.065, tinte: [0.95, 0.9, 0.85], fuerza: 0.8, orientacion: { eje: ATRAS, desde: -0.2, hasta: 0.3 } },
  { en: 'rodilla', hasta: 'talon', lados: true, radio: 0.075, tinte: [0.96, 0.92, 0.88], fuerza: 0.7, orientacion: { eje: ADELANTE, desde: -0.2, hasta: 0.5 } },

  // --- Donde la piel se arruga y se roza: más oscura, más rojiza y más áspera.
  { en: 'codo', lados: true, radio: [0.034, 0.05, 0.036], tinte: [0.8, 0.6, 0.56], fuerza: 0.9, orientacion: { eje: ATRAS, desde: -0.1, hasta: 0.5 } },
  { en: 'rodilla', lados: true, radio: [0.05, 0.055, 0.045], tinte: [0.86, 0.7, 0.66], fuerza: 0.85, orientacion: { eje: ADELANTE, desde: 0, hasta: 0.6 } },
  { en: 'talon', lados: true, radio: [0.034, 0.03, 0.034], tinte: [0.92, 0.82, 0.68], fuerza: 0.8 },

  // --- La mano: el dorso, más moreno que la palma, con los nudillos y las articulaciones apenas más oscuros y rojizos;
  // la palma y las yemas, claras y rosadas. Los nudillos son óvalos anchos —más a lo ancho del dedo que a lo largo— de borde
  // suave e irregular: al principio eran discos iguales y nítidos, y se leían como manchas pegadas sobre la mano.
  ...['pulgar', 'indice', 'medio', 'anular', 'menique'].flatMap((dedo): Zona[] => {
    const dorso = { eje: ATRAS, desde: 0, hasta: 0.4 }
    return [
      // El dorso del dedo entero, de la base a la yema.
      { en: `nudillo-${dedo}`, hasta: `yema-${dedo}`, lados: true, radio: 0.0085, tinte: [0.92, 0.84, 0.78], fuerza: 0.65, orientacion: { eje: ATRAS, desde: 0, hasta: 0.5 } },
      // El nudillo del pulgar es la base del dedo y no una articulación que sobresalga: más tenue.
      dedo === 'pulgar'
        ? { en: `nudillo-${dedo}`, lados: true, radio: [0.011, 0.011, 0.011], tinte: [0.94, 0.87, 0.84], fuerza: 0.5, meseta: 0.2, irregular: 0.25, orientacion: dorso }
        : { en: `nudillo-${dedo}`, lados: true, radio: [0.0105, 0.0085, 0.0115], tinte: [0.92, 0.82, 0.78], fuerza: 0.65, meseta: 0.15, irregular: 0.3, orientacion: dorso },
      ...(dedo === 'pulgar' ? [] : [{ en: `interfalangica-proximal-${dedo}`, lados: true, radio: [0.0088, 0.0065, 0.0095] as Vec3, tinte: [0.87, 0.74, 0.7] as Vec3, fuerza: 0.75, meseta: 0.15, irregular: 0.3, orientacion: dorso }]),
      { en: `interfalangica-distal-${dedo}`, lados: true, radio: [0.0075, 0.005, 0.008], tinte: [0.94, 0.87, 0.84], fuerza: 0.55, meseta: 0.15, irregular: 0.25, orientacion: dorso },
      // La cara de la palma de cada dedo, desde el nudillo hasta la yema.
      { en: `nudillo-${dedo}`, hasta: `yema-${dedo}`, lados: true, radio: 0.013, tinte: [1, 0.86, 0.84], fuerza: 0.8, orientacion: { eje: ADELANTE, desde: 0.1, hasta: 0.6 } },
      { en: `yema-${dedo}`, lados: true, radio: 0.011, tinte: [1, 0.74, 0.72], fuerza: 0.85 },
    ]
  }),
  // La fila de los nudillos se ve como una banda tenue de un lado a otro de la mano, y no como cuatro manchas.
  { en: 'nudillo-medio', correr: [0, 0.004, 0], lados: true, radio: [0.04, 0.011, 0.02], tinte: [0.95, 0.89, 0.86], fuerza: 0.5, meseta: 0.3, irregular: 0.2, orientacion: { eje: ATRAS, desde: 0, hasta: 0.4 } },
  { en: 'nudillo-medio', correr: [0, 0.03, 0.02], lados: true, radio: [0.05, 0.055, 0.04], tinte: [1, 0.88, 0.86], fuerza: 0.85, orientacion: { eje: ADELANTE, desde: 0.2, hasta: 0.7 } },

  // --- El pie: planta clara y amarillenta, dedos rosados.
  { en: 'talon', hasta: 'metatarso-segundo', lados: true, radio: 0.05, tinte: [1, 0.9, 0.78], fuerza: 0.85, orientacion: { eje: ABAJO, desde: 0.3, hasta: 0.8 } },
  ...['primer', 'segundo', 'tercer', 'cuarto', 'quinto'].map((dedo): Zona => ({
    en: `metatarso-${dedo}`, lados: true, radio: 0.014, tinte: [1, 0.82, 0.78], fuerza: 0.6,
  })),

  // --- El tronco: pezones con su areola, ombligo, axilas y vello del pubis.
  { en: 'pezon', lados: true, radio: [0.0175, 0.0175, 0.0175], tinte: [0.62, 0.42, 0.38], fuerza: 0.95 },
  { en: 'pezon', lados: true, radio: [0.0065, 0.0065, 0.0065], tinte: [0.8, 0.62, 0.6], fuerza: 0.9 },
  { en: 'ombligo', radio: 0.009, tinte: [0.86, 0.66, 0.62], fuerza: 0.7 },
  { en: 'axila', lados: true, radio: [0.03, 0.04, 0.035], tinte: [0.9, 0.8, 0.76], fuerza: 0.7 },
  { en: 'pubis', radio: [0.075, 0.055, 0.045], tinte: [0.9, 0.84, 0.8], fuerza: 0.6 },
  // El pubis y el escroto son lo más pigmentado del cuerpo, y la mancha va un poco más abajo que el vello.
  { en: 'glande', correr: [0, 0.015, 0], radio: [0.05, 0.065, 0.05], tinte: [0.84, 0.72, 0.66], fuerza: 0.7 },

  // --- La cara.
  { en: 'pomulo', lados: true, radio: 0.032, tinte: [1, 0.86, 0.85], fuerza: 0.55 },
  { en: 'punta-de-la-nariz', radio: [0.014, 0.016, 0.014], tinte: [1, 0.8, 0.78], fuerza: 0.7 },
  // Las alas de la nariz, un poco a cada lado de la punta.
  { en: 'punta-de-la-nariz', correr: [0.0105, -0.005, -0.005], lados: true, radio: 0.008, tinte: [0.98, 0.72, 0.7], fuerza: 0.7 },
  { en: 'oreja', lados: true, radio: [0.022, 0.036, 0.03], tinte: [1, 0.74, 0.72], fuerza: 0.75 },
  // La ojera: la piel bajo el ojo es la más fina y deja ver lo que tiene debajo, algo más oscura y violácea.
  { en: 'ojo', correr: [0, -0.011, 0.012], lados: true, radio: [0.016, 0.009, 0.014], tinte: [0.9, 0.82, 0.86], fuerza: 0.7 },
  // El párpado, alrededor de la rendija.
  { en: 'ojo', correr: [0, 0.004, 0.012], lados: true, radio: [0.021, 0.015, 0.016], tinte: [0.96, 0.84, 0.86], fuerza: 0.6 },
  // La ceja: una sombra oscura y alargada sobre el ojo, con el extremo de fuera algo más bajo.
  { en: 'ojo', correr: [-0.0008, 0.0215, 0.014], lados: true, radio: [0.0275, 0.0048, 0.02], tinte: [0.42, 0.37, 0.34], fuerza: 0.9 },
  // La barba de un día: gris azulada en la mandíbula, la mejilla baja y sobre el labio.
  { en: 'menton', correr: [0, 0.012, -0.03], radio: [0.075, 0.05, 0.05], tinte: [0.9, 0.9, 0.94], fuerza: 0.5 },
  { en: 'labios', correr: [0, 0.011, -0.002], radio: [0.022, 0.007, 0.015], tinte: [0.9, 0.9, 0.93], fuerza: 0.4 },
  // El rubor del labio sobre la piel de alrededor: sin él, el borde de la pieza del labio es un escalón de color.
  { en: 'labios', radio: [0.036, 0.0125, 0.024], tinte: [0.96, 0.85, 0.86], fuerza: 0.65, meseta: 0.25 },
]

/** El tono del cuero cabelludo, donde el pelo corto deja la piel más oscura. */
const CUERO_CABELLUDO: Vec3 = [0.4, 0.32, 0.28]
/** El borde de arriba lleva las pestañas, oscuro; el de abajo es la mucosa mojada, rojiza. */
const BORDE_DEL_PARPADO_SUPERIOR: Vec3 = [0.4, 0.32, 0.3]
const BORDE_DEL_PARPADO_INFERIOR: Vec3 = [0.88, 0.5, 0.52]

/** De 0 a 1 entre `desde` y `hasta`, con la pendiente nula en los dos extremos (el `smoothstep` de GLSL). */
const suave = (desde: number, hasta: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - desde) / (hasta - desde)))
  return t * t * (3 - 2 * t)
}

/** Una zona ya lista para medir: sus extremos en el cuerpo, su caja y su orientación reflejada si hacía falta. */
interface ZonaResuelta {
  a: Vec3
  b: Vec3
  radio: Vec3
  esCapsula: boolean
  tinte: Vec3
  fuerza: number
  orientacion?: { eje: Vec3; desde: number; hasta: number }
  meseta: number
  irregular: number
  min: Vec3
  max: Vec3
}

function resolver(zona: Zona, lado: (typeof LADOS)[number] | null): ZonaResuelta {
  // `correr` está escrito para el lado derecho (x negativa); el izquierdo es su espejo.
  const mover = (p: Vec3): Vec3 => {
    const c = zona.correr ?? [0, 0, 0]
    return [p[0] + (lado === 'izquierdo' ? -c[0] : c[0]), p[1] + c[1], p[2] + c[2]]
  }
  const a = mover(puntoDelLado(zona.en, lado))
  const b = zona.hasta ? mover(puntoDelLado(zona.hasta, lado)) : a
  const radio: Vec3 = typeof zona.radio === 'number' ? [zona.radio, zona.radio, zona.radio] : zona.radio
  const eje = zona.orientacion ? (lado === 'izquierdo' ? ([-zona.orientacion.eje[0], zona.orientacion.eje[1], zona.orientacion.eje[2]] as Vec3) : zona.orientacion.eje) : null
  return {
    a,
    b,
    radio,
    esCapsula: Boolean(zona.hasta),
    tinte: zona.tinte,
    fuerza: zona.fuerza,
    orientacion: zona.orientacion && eje ? { ...zona.orientacion, eje } : undefined,
    meseta: zona.meseta ?? 0.5,
    irregular: zona.irregular ?? 0,
    min: [Math.min(a[0], b[0]) - radio[0], Math.min(a[1], b[1]) - radio[1], Math.min(a[2], b[2]) - radio[2]],
    max: [Math.max(a[0], b[0]) + radio[0], Math.max(a[1], b[1]) + radio[1], Math.max(a[2], b[2]) + radio[2]],
  }
}

let zonasResueltas: ZonaResuelta[] | null = null
function todasLasZonas(): ZonaResuelta[] {
  if (zonasResueltas) return zonasResueltas
  const salida: ZonaResuelta[] = []
  for (const zona of ZONAS) {
    if (zona.lados) for (const lado of LADOS) salida.push(resolver(zona, lado))
    else salida.push(resolver(zona, null))
  }
  zonasResueltas = salida
  return salida
}

/** Las zonas en las que la piel de ese lado del cuerpo se tiñe, para quien quiera dibujarlas o contarlas. */
export const NUMERO_DE_ZONAS = () => todasLasZonas().length

/**
 * El multiplicador del color de la piel en un punto con esa normal: el producto de lo que le aporta cada zona que lo
 * cubre. Entre 0 y 1 en cada canal.
 */
export function tinteDeLaPiel(x: number, y: number, z: number, nx: number, ny: number, nz: number, salida: Vec3 = [1, 1, 1]): Vec3 {
  salida[0] = salida[1] = salida[2] = 1
  for (const zona of todasLasZonas()) {
    if (x < zona.min[0] || x > zona.max[0] || y < zona.min[1] || y > zona.max[1] || z < zona.min[2] || z > zona.max[2]) continue
    let d2: number
    if (zona.esCapsula) {
      const abx = zona.b[0] - zona.a[0], aby = zona.b[1] - zona.a[1], abz = zona.b[2] - zona.a[2]
      const apx = x - zona.a[0], apy = y - zona.a[1], apz = z - zona.a[2]
      const largo2 = abx * abx + aby * aby + abz * abz
      const t = largo2 > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / largo2)) : 0
      const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t
      d2 = (dx * dx + dy * dy + dz * dz) / (zona.radio[0] * zona.radio[0])
    } else {
      const dx = (x - zona.a[0]) / zona.radio[0], dy = (y - zona.a[1]) / zona.radio[1], dz = (z - zona.a[2]) / zona.radio[2]
      d2 = dx * dx + dy * dy + dz * dz
    }
    if (d2 >= 1) continue
    // Una meseta hasta la mitad del radio y de ahí a cero con pendiente nula: con una campana (1 − d²)² la mancha era
    // un punto con cola, y a cinco milímetros de arista por vértice solo se veía el punto.
    let w = zona.fuerza * (1 - suave(zona.meseta, 1, Math.sqrt(d2)))
    // El borde de una mancha de piel no es un óvalo: el ruido lo come un poco por un lado y lo estira por el otro.
    if (zona.irregular > 0) w *= Math.max(0, 1 + zona.irregular * (2 * ruido(x, y, z, 0.006) - 1))
    if (zona.orientacion) {
      const { eje, desde, hasta } = zona.orientacion
      w *= suave(desde, hasta, nx * eje[0] + ny * eje[1] + nz * eje[2])
    }
    if (w <= 0) continue
    salida[0] *= 1 + w * (zona.tinte[0] - 1)
    salida[1] *= 1 + w * (zona.tinte[1] - 1)
    salida[2] *= 1 + w * (zona.tinte[2] - 1)
  }
  return salida
}

// ----------------------------------------------------------------------------------------------- el cuero cabelludo

/**
 * Cuánto cuero cabelludo hay en un punto de la cabeza, de 0 a 1: la línea del pelo baja desde la frente hacia las
 * sienes, rodea la oreja por arriba y baja por detrás hasta la nuca. Los números salen de la cabeza del atlas, que es
 * calva: la frente acaba en `y` = 1,665 y la nuca empieza en 1,53.
 */
export function cueroCabelludo(x: number, y: number, z: number): number {
  if (y < 1.5) return 0
  const lineaDelPelo = 1.664 - 0.9 * Math.max(0, 0.02 - z) - 3 * Math.max(0, Math.abs(x) - 0.052) * Math.min(1, Math.max(0, z + 0.02) * 12) - 2.6 * Math.max(0, -z - 0.05)
  const arribaDeLaLinea = suave(lineaDelPelo - 0.0045, lineaDelPelo + 0.0045, y)
  // Más allá del plano de las orejas y por debajo de la mitad de la cabeza ya es cuello.
  return arribaDeLaLinea * suave(1.5, 1.545, y)
}

// ----------------------------------------------------------------------------------------------- la piel entera

/** El hash de un punto del espacio en [0, 1): el mismo para el mismo punto, que es lo que hace repetible la exportación. */
function azar3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/** Ruido de valor en una rejilla de `paso` metros, suavizado. */
function ruido(x: number, y: number, z: number, paso: number): number {
  const fx = x / paso, fy = y / paso, fz = z / paso
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz)
  const tx = suave(0, 1, fx - ix), ty = suave(0, 1, fy - iy), tz = suave(0, 1, fz - iz)
  const v = (a: number, b: number, c: number) => azar3(ix + a, iy + b, iz + c)
  const x00 = v(0, 0, 0) * (1 - tx) + v(1, 0, 0) * tx
  const x10 = v(0, 1, 0) * (1 - tx) + v(1, 1, 0) * tx
  const x01 = v(0, 0, 1) * (1 - tx) + v(1, 0, 1) * tx
  const x11 = v(0, 1, 1) * (1 - tx) + v(1, 1, 1) * tx
  return (x00 * (1 - ty) + x10 * ty) * (1 - tz) + (x01 * (1 - ty) + x11 * ty) * tz
}

/**
 * Los vértices del borde abierto de una malla que caen a menos de `radio` de alguno de los `centros`: la rendija
 * de los ojos. El resto de la piel es cerrado, así que un borde abierto en la cara es un ojo o una fosa nasal.
 * Se mira solo lo que está cerca: contar las aristas de las cuatrocientas noventa mil caras de la piel entera
 * para encontrar cien vértices era lo más caro de todo el cálculo.
 */
export function bordeAbiertoCerca(posiciones: ArrayLike<number>, indices: ArrayLike<number>, centros: readonly Vec3[], radio: number): Vec3[] {
  const n = Math.floor(posiciones.length / 3)
  const cerca = new Uint8Array(n)
  const r2 = radio * radio
  for (let i = 0; i < n; i++) {
    for (const c of centros) {
      const dx = posiciones[i * 3] - c[0], dy = posiciones[i * 3 + 1] - c[1], dz = posiciones[i * 3 + 2] - c[2]
      if (dx * dx + dy * dy + dz * dz < r2) {
        cerca[i] = 1
        break
      }
    }
  }
  const cuenta = new Map<number, number>()
  const arista = (a: number, b: number) => (a < b ? a * n + b : b * n + a)
  const completos = indices.length - (indices.length % 3)
  for (let t = 0; t < completos; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2]
    if (!cerca[a] && !cerca[b] && !cerca[c]) continue
    for (const k of [arista(a, b), arista(b, c), arista(c, a)]) cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  const borde = new Set<number>()
  for (const [k, veces] of cuenta) {
    if (veces !== 1) continue
    const a = Math.floor(k / n), b = k % n
    if (cerca[a]) borde.add(a)
    if (cerca[b]) borde.add(b)
  }
  return [...borde].map((i): Vec3 => [posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]])
}

/**
 * Los multiplicadores de color de la piel del atlas, un vértice por cuatro bytes (rojo, verde, azul y 255) en el
 * orden en que `COLOR_0` los quiere. Las posiciones están en las coordenadas del atlas.
 *
 * Con `indices` se pinta también el borde de los párpados: el contorno de la rendija, donde la piel se hace mucosa,
 * es rosado y rojizo, y es lo único del ojo que no es una zona sino una forma.
 */
export function pigmentoDeLaPiel(posiciones: ArrayLike<number>, normales: ArrayLike<number>, indices?: ArrayLike<number>): Uint8Array {
  const n = Math.floor(posiciones.length / 3)
  const salida = new Uint8Array(n * 4)
  const escala = normales instanceof Int16Array ? 1 / 32767 : 1
  const tinte: Vec3 = [1, 1, 1]
  const bordes = indices ? bordeAbiertoCerca(posiciones, indices, LADOS.map((l) => punto(`ojo-${l}`)), 0.022) : []
  const r2Borde = 0.0045 * 0.0045
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1], z = posiciones[i * 3 + 2]
    tinteDeLaPiel(x, y, z, normales[i * 3] * escala, normales[i * 3 + 1] * escala, normales[i * 3 + 2] * escala, tinte)
    let r = tinte[0], g = tinte[1], b = tinte[2]
    const pelo = cueroCabelludo(x, y, z)
    if (pelo > 0) {
      // El pelo corto, algo moteado: rasurado, la piel se ve gris por debajo.
      const moteado = 0.82 + 0.36 * ruido(x, y, z, 0.0022)
      const w = pelo * 0.85
      r *= 1 + w * (CUERO_CABELLUDO[0] * moteado - 1)
      g *= 1 + w * (CUERO_CABELLUDO[1] * moteado - 1)
      b *= 1 + w * (CUERO_CABELLUDO[2] * moteado - 1)
    }
    if (bordes.length > 0 && y > 1.57 && y < 1.62 && Math.abs(x) < 0.05) {
      let d2 = Infinity
      for (const p of bordes) {
        const dx = x - p[0], dy = y - p[1], dz = z - p[2]
        const e = dx * dx + dy * dy + dz * dz
        if (e < d2) d2 = e
      }
      if (d2 < r2Borde) {
        const w = (1 - d2 / r2Borde) ** 2 * 0.9
        // Arriba o abajo de la mitad de la rendija: el ojo está a 1,596 de altura en el atlas.
        const borde = y > 1.5962 ? BORDE_DEL_PARPADO_SUPERIOR : BORDE_DEL_PARPADO_INFERIOR
        r *= 1 + w * (borde[0] - 1)
        g *= 1 + w * (borde[1] - 1)
        b *= 1 + w * (borde[2] - 1)
      }
    }
    salida[i * 4] = Math.round(Math.min(1, r) * 255)
    salida[i * 4 + 1] = Math.round(Math.min(1, g) * 255)
    salida[i * 4 + 2] = Math.round(Math.min(1, b) * 255)
    salida[i * 4 + 3] = 255
  }
  return salida
}

// ----------------------------------------------------------------------------------------------- los labios

/**
 * El color del labio, multiplicando al de la piel (en lineal): un rosa apagado. Antes era [0,72; 0,27; 0,33], un rojo que
 * dejaba al labio como una pieza pintada puesta sobre la cara, y con el verde tan bajo el sombreador lo mojaba del todo y
 * lo hacía brillar como plástico. El verde queda por debajo de 0,55 a propósito: es lo que el vello del simulador lee como
 * mucosa (`triangulosSinVello`), y lo que le da al labio un brillo de húmedo y no de laca.
 */
const LABIO: Vec3 = [0.9, 0.5, 0.52]
/** La línea de la boca, donde se juntan los dos labios, es apenas más oscura y más roja: una sombra, no un trazo. */
const LINEA_DE_LA_BOCA: Vec3 = [0.76, 0.38, 0.42]

/**
 * El color de la pieza «Lip» del atlas: el bermellón entero, que es solo lo rojo del labio. Más claro hacia la
 * comisura y por el borde, donde se confunde con la piel, y más oscuro y rojo en la línea de la boca.
 */
export function pigmentoDeLosLabios(posiciones: ArrayLike<number>): Uint8Array {
  const n = Math.floor(posiciones.length / 3)
  const salida = new Uint8Array(n * 4)
  const centro = punto('labios')
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1], z = posiciones[i * 3 + 2]
    // 0 en el centro de la boca y 1 en la comisura (a unos 25 mm).
    const alLado = Math.min(1, Math.abs(x - centro[0]) / 0.025)
    // La altura relativa a la línea de la boca, que cae un poco más abajo de la mitad.
    const alto = (y - (centro[1] - 0.0008)) / 0.008
    const cercaDeLaLinea = Math.exp(-alto * alto * 1.6)
    const palidez = suave(0.55, 1, alLado) * 0.5 + suave(0.7, 1.3, Math.abs(alto)) * 0.45
    const moteado = 0.9 + 0.2 * ruido(x, y, z, 0.0012)
    const canal = (k: 0 | 1 | 2) => {
      const base = LABIO[k] + (LINEA_DE_LA_BOCA[k] - LABIO[k]) * cercaDeLaLinea
      return Math.min(1, (base + (1 - base) * palidez) * moteado)
    }
    salida[i * 4] = Math.round(canal(0) * 255)
    salida[i * 4 + 1] = Math.round(canal(1) * 255)
    salida[i * 4 + 2] = Math.round(canal(2) * 255)
    salida[i * 4 + 3] = 255
  }
  return salida
}

// ----------------------------------------------------------------------------------------------- los ojos

/** Cómo se ve un grupo de piezas de aspecto propio: su color de material, su brillo y a qué objeto va. */
export interface AspectoPropio {
  /** El grupo en que se funden las piezas con ese aspecto: sale como un objeto con su propio material. */
  grupo: 'ojos' | 'cornea'
  /** El nombre en español de ese objeto. */
  etiqueta: string
}

/**
 * Las piezas del ojo que necesitan un material propio. No se mezclan con el resto de los órganos de los sentidos
 * porque su color no es el del sistema, y un color por vértice solo multiplica: el blanco del ojo no sale de un
 * lila. La córnea y la cámara anterior van aparte por otra razón: son transparentes, y opacas ocultarían el iris.
 */
export function aspectoPropioDe(nombre: string): AspectoPropio | null {
  if (/^(left|right) (sclera|iris|lens)$/i.test(nombre) || /^optic part of (left|right) retina$/i.test(nombre) || /^tarsal plate of /i.test(nombre)) {
    return { grupo: 'ojos', etiqueta: 'Ojos' }
  }
  if (/^(left|right) cornea$/i.test(nombre) || /^anterior chamber of (left|right) eyeball$/i.test(nombre)) return { grupo: 'cornea', etiqueta: 'Córnea' }
  return null
}

/** El color de los grupos de aspecto propio, ya en lineal y sin pasar por el color del sistema. */
export const COLOR_DE_LA_CORNEA: [number, number, number, number] = [1, 1, 1, 0.03]
export const COLOR_DE_LOS_OJOS: [number, number, number, number] = [1, 1, 1, 1]

/** Esclera, iris y pupila, en lineal. El iris es castaño, el más común. */
const ESCLERA: Vec3 = [0.78, 0.74, 0.68]
const ESCLERA_ENROJECIDA: Vec3 = [0.8, 0.42, 0.36]
const ESCLERA_DEL_LIMBO: Vec3 = [0.34, 0.3, 0.27]
const IRIS_INTERIOR: Vec3 = [0.2, 0.075, 0.018]
const IRIS_MEDIO: Vec3 = [0.34, 0.14, 0.035]
const IRIS_DEL_LIMBO: Vec3 = [0.04, 0.016, 0.008]
const PUPILA: Vec3 = [0.008, 0.007, 0.009]
/** El párpado visto por la rendija: la piel (0,72; 0,53; 0,39) con su rojo. */
const PARPADO: Vec3 = [0.62, 0.36, 0.3]

const mezcla = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** El centro y el radio de una esfera ajustada a unos puntos, por mínimos cuadrados. */
function esferaDe(posiciones: ArrayLike<number>): { centro: Vec3; radio: number } {
  const n = Math.floor(posiciones.length / 3)
  // x² + y² + z² = 2ax + 2by + 2cz + d, resuelto por las ecuaciones normales.
  const M = Array.from({ length: 4 }, () => new Array<number>(5).fill(0))
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1], z = posiciones[i * 3 + 2]
    const fila = [2 * x, 2 * y, 2 * z, 1]
    const rhs = x * x + y * y + z * z
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) M[r][c] += fila[r] * fila[c]
      M[r][4] += fila[r] * rhs
    }
  }
  for (let k = 0; k < 4; k++) {
    let mayor = k
    for (let r = k + 1; r < 4; r++) if (Math.abs(M[r][k]) > Math.abs(M[mayor][k])) mayor = r
    ;[M[k], M[mayor]] = [M[mayor], M[k]]
    for (let r = k + 1; r < 4; r++) {
      const f = M[r][k] / (M[k][k] || 1e-30)
      for (let c = k; c < 5; c++) M[r][c] -= f * M[k][c]
    }
  }
  const s = [0, 0, 0, 0]
  for (let k = 3; k >= 0; k--) {
    let v = M[k][4]
    for (let c = k + 1; c < 4; c++) v -= M[k][c] * s[c]
    s[k] = v / (M[k][k] || 1e-30)
  }
  return { centro: [s[0], s[1], s[2]], radio: Math.sqrt(Math.max(0, s[3] + s[0] * s[0] + s[1] * s[1] + s[2] * s[2])) }
}

function aBytes(color: Vec3, salida: Uint8Array, i: number) {
  salida[i * 4] = Math.round(Math.min(1, Math.max(0, color[0])) * 255)
  salida[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, color[1])) * 255)
  salida[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, color[2])) * 255)
  salida[i * 4 + 3] = 255
}

/**
 * El color, vértice a vértice, de una pieza del ojo, o `null` si no es de las que lo llevan. Absoluto: el material
 * del grupo es blanco y el color sale entero de aquí.
 *
 *  - **Esclera**: blanco marfil, más enrojecido hacia los ángulos del ojo (la carúncula y el pliegue de fuera) y
 *    ceñido por un anillo oscuro en el limbo, donde se junta con la córnea.
 *  - **Iris**: por radios. Un borde oscuro en la pupila, un collar más claro, el cuerpo castaño y el limbo oscuro,
 *    con las fibras radiales como una variación por ángulo.
 *  - **Cristalino**: lo que se ve por el agujero de la pupila, casi negro.
 *  - **Retina**: roja oscura; no se ve, pero es lo que llevaría si se abriera.
 */
export function pigmentoDelOjo(nombre: string, posiciones: ArrayLike<number>): Uint8Array | null {
  const n = Math.floor(posiciones.length / 3)
  if (n === 0) return null
  const esclera = /^(left|right) sclera$/i.test(nombre), iris = /^(left|right) iris$/i.test(nombre)
  const cristalino = /^(left|right) lens$/i.test(nombre), retina = /^optic part of (left|right) retina$/i.test(nombre)
  const tarso = /^tarsal plate of /i.test(nombre)
  if (!esclera && !iris && !cristalino && !retina && !tarso) return null
  const salida = new Uint8Array(n * 4)
  if (tarso) {
    // La placa del párpado es lo que se ve del párpado en la rendija: del color de la piel de allí, más rojiza.
    for (let i = 0; i < n; i++) aBytes(PARPADO, salida, i)
    return salida
  }
  if (cristalino) {
    for (let i = 0; i < n; i++) aBytes(PUPILA, salida, i)
    return salida
  }
  if (retina) {
    for (let i = 0; i < n; i++) aBytes([0.12, 0.012, 0.01], salida, i)
    return salida
  }
  if (esclera) {
    const { centro } = esferaDe(posiciones)
    for (let i = 0; i < n; i++) {
      const dx = posiciones[i * 3] - centro[0], dy = posiciones[i * 3 + 1] - centro[1], dz = posiciones[i * 3 + 2] - centro[2]
      const l = Math.hypot(dx, dy, dz) || 1
      // El ángulo con el eje de la mirada (hacia delante): 0 en la pupila, 90° en el ecuador.
      const angulo = Math.acos(Math.min(1, Math.max(-1, dz / l)))
      const limbo = 1 - suave(0.55, 0.78, angulo)
      // Hacia los ángulos del ojo, a los lados.
      const alLado = suave(0.78, 0.97, Math.abs(dx / l))
      const vaso = suave(0.7, 0.92, ruido(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2], 0.0016))
      let c = mezcla(ESCLERA, ESCLERA_ENROJECIDA, Math.min(1, alLado * 0.7 + vaso * 0.18))
      c = mezcla(c, ESCLERA_DEL_LIMBO, limbo * 0.85)
      aBytes(c, salida, i)
    }
    return salida
  }
  // Iris: el centro y el radio en el plano frontal, del conjunto de sus vértices.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const x = posiciones[i * 3], y = posiciones[i * 3 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const radioDelIris = Math.max(maxX - minX, maxY - minY) / 2
  for (let i = 0; i < n; i++) {
    const dx = posiciones[i * 3] - cx, dy = posiciones[i * 3 + 1] - cy
    const r = Math.hypot(dx, dy) / radioDelIris
    const angulo = Math.atan2(dy, dx)
    // Las fibras: una variación por ángulo, en dos escalas, que se acentúa hacia fuera.
    const fibra = 0.5 * ruido(Math.cos(angulo) * 0.01, Math.sin(angulo) * 0.01, 0.37, 0.0009) + 0.5 * ruido(Math.cos(angulo * 3) * 0.01, Math.sin(angulo * 3) * 0.01, 1.7, 0.0016)
    let c = mezcla(IRIS_INTERIOR, IRIS_MEDIO, suave(0.3, 0.55, r))
    c = mezcla(c, IRIS_DEL_LIMBO, suave(0.82, 1, r))
    const rayado = 0.78 + 0.5 * fibra
    c = [c[0] * rayado, c[1] * rayado, c[2] * rayado]
    // El borde de la pupila, apretado y oscuro.
    c = mezcla(c, PUPILA, 1 - suave(0.28, 0.4, r))
    aBytes(c, salida, i)
  }
  return salida
}
