/**
 * Pone en el atlas la piel recalculada (D-224): lisa, con holgura sobre todo lo de dentro y comprobada.
 *
 *   python scripts/atlas/piel/generar.py          # la forma: lisa, sin holgura (ver allí)
 *   node scripts/atlas/recalcular-piel.mjs        # mide, comprueba y dice qué haría
 *   node scripts/atlas/recalcular-piel.mjs --aplicar
 *
 * Sustituye a `ajustar-piel.mjs` (D-159), que empujaba la piel de origen —once mil vértices— hasta 12 mm
 * a lo largo de su normal. Aquí se empuja lo mismo, por lo mismo y con el mismo buscador, pero sobre la
 * piel densa y lisa que deja `generar.py`, donde un empuje es un abultamiento de dos o tres centímetros y
 * no una pirámide de ocho.
 *
 * Qué hace:
 *
 * 1. Junta los puntos de lo de dentro que quedan a menos de `ALCANCE` de la piel (vértices y centros de
 *    triángulo de todo, y una rejilla de 3 mm sobre los triángulos de las fascias generadas, salvo lo
 *    apartado en `geometriaDePiel.mjs`: ojos, labios, uñas y la oreja, que tiene su propia cáscara).
 * 2. Hasta `PASADAS` veces: mide a qué profundidad queda cada punto bajo la cáscara del cuerpo; donde no
 *    llega a `HOLGURA`, los tres vértices del triángulo que lo rige necesitan subir lo que falte. Ese
 *    empuje se reparte entre los vecinos (`relajarEmpuje`) y se aplica a lo largo de la normal, sin dejar
 *    que ninguna cara se dé la vuelta. Lo poco que eso no resuelve se remata subiendo la cara por su propia
 *    normal. Lo mismo, antes, con la piel de cada oreja sobre la oreja anatómica.
 * 3. La cara de dentro de la piel —la que se ve en el labio de una incisión— se rehace a partir de la de
 *    fuera, con su misma malla: `ESPESOR_CON_LA_GRASA` por debajo en el cuerpo y `ESPESOR_DE_LA_DERMIS` en la
 *    cabeza (`espesorPedido`, D-331), o menos donde lo de dentro está más cerca, y nunca a menos de
 *    `HOLGURA_DE_DENTRO` de ello. Los vasos y los nervios no cuentan (`limitaLaGrasa`): van dentro de la
 *    grasa.
 * 4. Comprueba lo que exige la prueba (`tests/unit/geometriaDePiel.test.ts`), con las mismas funciones.
 *    Si no se cumple, no escribe.
 * 5. Rehace el paquete de la piel con las demás piezas byte a byte iguales (se comprueba), anota la
 *    pieza en `catalogo.json` con una versión nueva y rehace `ATRIBUCION.md`.
 *
 * Es idempotente: parte siempre de lo que dejó `generar.py`, no de la piel que haya en el atlas.
 *
 * **Regenerar el atlas con `preparar.mjs` devuelve la piel de origen.** Después hay que volver a pasar
 * este guion (y el de las fascias, ver `README.md`).
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { atribucion } from './atribucion.mjs'
import { alinear, versionDelCatalogo } from './fascias/empaquetar.mjs'
import { HOLGURA_BAJO_LA_CARA_DE_DENTRO, HOLGURA_MINIMA, comprobarLaPiel } from './comprobarPiel.mjs'
import {
  NOMBRE_DE_LA_OREJA,
  NOMBRE_DE_LA_PIEL,
  crearBuscador,
  cubiertaPorElCuerpo,
  envolventeConPendiente,
  filtroDeCercania,
  limitaLaGrasa,
  normalesDeVertice,
  profundidadBajoLaPiel,
  puntosDeLoDeDentro,
  relajarEmpuje,
  suavizarNormales,
  vecinosDe,
} from './geometriaDePiel.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ATLAS = join(RAIZ, 'public', 'atlas')
const SALIDA = join(RAIZ, 'scripts', 'atlas', 'piel', 'salida')
const aplicar = process.argv.includes('--aplicar')

/**
 * Cuánto debe quedar por debajo de la piel lo más superficial: lo de D-159, que ya se vio bien. La prueba
 * exige menos (`HOLGURA_MINIMA`, en `comprobarPiel.mjs`): la cara de la piel no pasa por los vértices
 * empujados sino entre ellos, y entre dos vértices queda algo más baja.
 */
const HOLGURA = 0.002
/** Hasta dónde se mira alrededor de la piel: lo que está más hondo no la toca. */
const ALCANCE = 0.03
/**
 * Lo máximo que sube un vértice. Con 12 mm (lo de D-159) no llegaba alrededor de la oreja: `generar.py` aplana su
 * bulto, y la fascia temporal queda a 14 o 15 mm por encima de lo aplanado.
 */
const TOPE = 0.018
const PASADAS = 18
/** La dermis y la epidermis de una pierna: lo que mide la piel en la cabeza, donde no lleva grasa (D-331). */
const ESPESOR_DE_LA_DERMIS = 0.002
/**
 * La dermis con 2 mm de grasa debajo (E8 de P-012, D-331): lo que mide la piel en el resto del cuerpo. Es el grosor fijo
 * que eligió el dueño. Con un grosor único fijado por el sitio más estrecho —los retináculos del tobillo, el dorso de
 * la mano— la grasa sería cero, y con lo que cabe en cada sitio cambiaría de una zona a otra. Donde no cabe, se
 * adelgaza: `debajoEnElEntorno` y la comprobación de abajo no cambian.
 */
const ESPESOR_CON_LA_GRASA = 0.004
/**
 * Entre estas dos alturas el cuello pasa de la piel con grasa a la de la cabeza, sin escalón: de la base del cuello
 * al mentón, que está a y = 1,507 (`referenciasDelCuerpo.json`). Por altura y no por región: en la posición anatómica
 * no hay nada más que la cabeza por encima de los hombros.
 */
const CUELLO = { desde: 1.44, hasta: 1.5 }
/**
 * Lo que el grosor puede cambiar por metro de piel donde la grasa se adelgaza: con 0,25, de 4 mm a 1 mm en 12 mm de
 * piel. Sin este freno, un vértice que no cabe junto a uno que sí dejaba en la pared de la herida un escalón de
 * varios milímetros de un labio al de al lado.
 */
const PENDIENTE_DEL_GROSOR = 0.25
const ESPESOR_MINIMO = 0.0003

/** El grosor que se le pide a la piel a la altura `y`: con la grasa abajo, sin ella en la cabeza, y suave en el cuello. */
function espesorPedido(y) {
  const t = Math.min(1, Math.max(0, (y - CUELLO.desde) / (CUELLO.hasta - CUELLO.desde)))
  const suave = t * t * (3 - 2 * t)
  return ESPESOR_CON_LA_GRASA + (ESPESOR_DE_LA_DERMIS - ESPESOR_CON_LA_GRASA) * suave
}
/** La cara de dentro tampoco puede tocar lo de dentro: se queda a esto de lo más superficial que tenga debajo. */
const HOLGURA_DE_DENTRO = 0.0008
/** Lo que la oreja anatómica queda bajo su piel. La prueba pide la mitad (`HOLGURA_DE_LA_OREJA`). */
const HOLGURA_EN_LA_OREJA = 0.001

/**
 * La base de la nariz (D-228): de una ala a la otra, de la mitad de la nariz al labio, y por delante de la cara. Ahí lo de
 * dentro —los cartílagos alares— asoma hasta 13 mm sobre una piel que en el atlas casi no tiene nariz, y la subida no
 * puede cambiar de golpe de un vértice al vecino. Medido en el atlas: la punta está a y = 1,564 y la base a 1,547.
 */
const ZONA_SUAVE = {
  dentro: (x, y, z) => Math.abs(x) < 0.045 && y > 1.52 && y < 1.585 && z > 0.055,
  /** Metros que puede cambiar la subida por metro de piel. Con 0,6 un diente de 12 mm es una loma de 20 mm de radio. */
  pendiente: 0.6,
  /** Vueltas que se promedian las normales por las que suben los vértices de la zona (`suavizarNormales`). */
  vueltasDeNormal: 8,
}

/** Lo más que una cara puede girar al empujarla, como coseno: hasta quedar de canto, nunca del revés. */
const GIRO_MAXIMO = 0

/** La normal unitaria del triángulo `a b c` de `pos`. */
function normalDeCara(pos, a, b, c) {
  const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2]
  const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2]
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

const inicio = Date.now()
const dicho = (texto) => console.log(`[${String(Math.round((Date.now() - inicio) / 1000)).padStart(4)} s] ${texto}`)

// --- lo generado -----------------------------------------------------------------------------
if (!existsSync(join(SALIDA, 'manifiesto.json'))) {
  console.error(`No hay piel generada en ${SALIDA}.\nEjecute antes: python scripts/atlas/piel/generar.py`)
  process.exit(1)
}
const manifiesto = JSON.parse(readFileSync(join(SALIDA, 'manifiesto.json'), 'utf8'))
const bin = readFileSync(join(SALIDA, 'piel.bin'))
const todas = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + manifiesto.vertices * 12))
const triangulosTodos = new Uint32Array(bin.buffer.slice(bin.byteOffset + manifiesto.vertices * 12, bin.byteOffset + bin.byteLength))
/** Cada cáscara con sus vértices y sus triángulos en índices propios (desde cero). */
const cascaras = new Map()
{
  let t = 0
  for (const c of manifiesto.cascaras) {
    const pos = todas.slice(c.desde * 3, (c.desde + c.vertices) * 3)
    const tri = triangulosTodos.slice(t * 3, (t + c.triangulos) * 3).map((i) => i - c.desde)
    cascaras.set(c.nombre, { pos, tri, vertices: c.vertices })
    t += c.triangulos
  }
}
const cuerpo = cascaras.get('cuerpo')
const orejas = ['oreja izquierda', 'oreja derecha'].map((n) => cascaras.get(n))
dicho(`Piel generada: cuerpo ${cuerpo.vertices.toLocaleString('es-CL')} vértices, orejas ${orejas.map((o) => o.vertices).join(' y ')}`)

// --- el atlas --------------------------------------------------------------------------------
const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8'))
const piel = catalogo.piezas.find((p) => p.nombre === NOMBRE_DE_LA_PIEL)
if (!piel) throw new Error('El atlas no tiene piel. Primero scripts/atlas/devolver-piel.mjs.')
const paquetes = new Map()
const paquete = (n) => {
  if (!paquetes.has(n)) paquetes.set(n, gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[n].archivo))))
  return paquetes.get(n)
}
const leer = (p) => {
  const b = paquete(p.paquete)
  return {
    pos: new Float32Array(b.buffer.slice(b.byteOffset + p.pos, b.byteOffset + p.pos + p.vertices * 12)),
    idx: new Uint32Array(b.buffer.slice(b.byteOffset + p.idx, b.byteOffset + p.idx + p.indices * 4)),
  }
}

const cerca = filtroDeCercania(cuerpo.pos, cuerpo.vertices, ALCANCE)
const { puntos, origen } = puntosDeLoDeDentro(catalogo.piezas, leer, cubiertaPorElCuerpo, cerca)
const nPuntos = puntos.length / 3
dicho(`Puntos de lo de dentro cerca de la piel: ${nPuntos.toLocaleString('es-CL')}`)

// --- el empuje --------------------------------------------------------------------------------
/**
 * Sube la cáscara `c` a lo largo de sus normales hasta que los puntos `pts` queden `holgura` por debajo de
 * ella, en `PASADAS` como mucho: en cada una mide, cada punto que no llega pide a los tres vértices de la
 * cara que lo rige lo que le falta, y eso se reparte entre los vecinos (`relajarEmpuje`). Los puntos que
 * marca `ignorar` no piden nada. Devuelve la cáscara empujada y la última medida.
 */
function empujar(c, pts, { holgura, celda, ignorar = null, nombre, suave = null }) {
  const n = pts.length / 3
  const identidad = Int32Array.from({ length: c.vertices }, (_, i) => i)
  // Los vértices de la zona donde la subida no puede cambiar de golpe (`suave`, ver `ZONA_SUAVE`).
  const enLaZonaSuave = suave
    ? Uint8Array.from({ length: c.vertices }, (_, v) => (suave.dentro(c.pos[v * 3], c.pos[v * 3 + 1], c.pos[v * 3 + 2]) ? 1 : 0))
    : null
  const vecinos = vecinosDe(c.tri, identidad, c.vertices)
  // En la zona suave los vértices suben casi en paralelo: por sus normales de verdad, las de la punta de la nariz
  // convergen sobre el labio y el freno contra el giro de las caras dejaba tres vértices 5 mm por debajo de los
  // demás (D-228, `suavizarNormales`).
  const normalesCrudas = normalesDeVertice(c.pos, c.tri, identidad, c.vertices)
  const normalesBase = enLaZonaSuave ? suavizarNormales(normalesCrudas, vecinos, enLaZonaSuave, suave.vueltasDeNormal) : normalesCrudas
  const normalesDeCaraBase = new Float64Array(c.tri.length)
  for (let t = 0; t < c.tri.length / 3; t++) normalesDeCaraBase.set(normalDeCara(c.pos, c.tri[t * 3], c.tri[t * 3 + 1], c.tri[t * 3 + 2]), t * 3)
  const posicion = Float32Array.from(c.pos)
  const subida = new Float64Array(c.vertices)
  const medir = () => {
    const buscador = crearBuscador(posicion, c.tri, { celda })
    const profundidad = new Float64Array(n).fill(Infinity)
    const triangulo = new Int32Array(n).fill(-1)
    for (let i = 0; i < n; i++) {
      const r = profundidadBajoLaPiel(buscador, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], ALCANCE, holgura)
      if (!r) continue
      profundidad[i] = r.profundidad
      triangulo[i] = r.triangulo
    }
    return { buscador, profundidad, triangulo }
  }
  let medida = medir()
  let mejor = Infinity
  let sinMejorar = 0
  for (let pasada = 1; pasada <= PASADAS; pasada++) {
    const necesita = new Float64Array(c.vertices)
    let faltan = 0
    for (let i = 0; i < n; i++) {
      const falta = holgura - medida.profundidad[i]
      if (!(falta > 1e-5) || ignorar?.[i]) continue
      faltan++
      const t = medida.triangulo[i]
      for (let k = 0; k < 3; k++) {
        const v = c.tri[t * 3 + k]
        if (falta > necesita[v]) necesita[v] = falta
      }
    }
    if (faltan === 0) {
      dicho(`${nombre}, pasada ${pasada}: ningún punto sin holgura.`)
      break
    }
    // Si tres pasadas seguidas no mejoran a la mejor, lo que queda no se arregla empujando. Con una sola bastaba
    // para parar, y cortaba a medias en los contactos de la mano con el muslo, que mejoran a saltos.
    if (faltan < mejor) {
      mejor = faltan
      sinMejorar = 0
    } else if (++sinMejorar >= 3) {
      dicho(`${nombre}, pasada ${pasada}: ${faltan} puntos siguen sin holgura y empujar más no los resuelve. Se deja.`)
      break
    }
    const paso = relajarEmpuje(necesita, vecinos, { amortiguacion: 0.85, vueltas: 60 })
    if (enLaZonaSuave) {
      // En la base de la nariz lo que asoma es el cartílago de un ala, pequeño y aislado, y el reparto de arriba lo
      // sube como una aguja: 12 mm en un vértice y 3 en el de al lado, que es el diente que se veía bajo la punta.
      // Aquí la subida cae como mucho `pendiente` milímetros por milímetro, y la aguja es una loma.
      const fuente = new Float64Array(c.vertices)
      for (let v = 0; v < c.vertices; v++) if (enLaZonaSuave[v]) fuente[v] = necesita[v]
      const loma = envolventeConPendiente(fuente, vecinos, c.pos, suave.pendiente)
      for (let v = 0; v < c.vertices; v++) if (loma[v] > paso[v]) paso[v] = loma[v]
    }
    for (let v = 0; v < c.vertices; v++) paso[v] = Math.min(paso[v], TOPE - subida[v])
    // Ninguna cara puede darse la vuelta. En lo cóncavo —entre los dedos, la mano contra el muslo, la entrepierna,
    // las aletas de la nariz, las axilas— las normales de los vértices convergen, y subir mucho a lo largo de ellas
    // cruzaba la piel consigo misma: 459 caras del revés, un pliegue que se ve y donde el buscador ya no sabe qué es
    // dentro. Donde una cara quedaría del revés respecto de como era, el paso de sus vértices se parte por la mitad
    // hasta que no; lo que no cabe se lo lleva el vecindario en la pasada siguiente.
    //
    // Se probó también a subir por la normal de cada pasada y a no dejar girar una cara más de 80°: frenaba lo que
    // hay que subir mucho —el bulto de la oreja que `generar.py` aplana, 15 mm bajo la fascia temporal— y dejaba la
    // fascia 1,7 mm por fuera. Por la normal de partida y sin más freno que el de darse la vuelta, sí llega.
    //
    // A partir del octavo intento el paso no se parte: se anula. Y se sigue mirando hasta que ninguna gire, porque
    // dejar quieto un vértice puede volcar una cara vecina cuyos otros dos sí suben; con ocho intentos y punto se
    // escapaba una cara así, en la mejilla. Termina siempre: cada vuelta anula al menos un vértice que se movía, y
    // una cara con sus tres vértices quietos es la de la pasada anterior, que ya se miró.
    const candidata = new Float32Array(posicion.length)
    let recortadas = 0
    for (let intento = 0; ; intento++) {
      for (let v = 0; v < c.vertices; v++) {
        for (let k = 0; k < 3; k++) candidata[v * 3 + k] = c.pos[v * 3 + k] + normalesBase[v * 3 + k] * (subida[v] + paso[v])
      }
      let giran = 0
      for (let t = 0; t < c.tri.length / 3; t++) {
        const a = c.tri[t * 3], b = c.tri[t * 3 + 1], d = c.tri[t * 3 + 2]
        if (paso[a] === 0 && paso[b] === 0 && paso[d] === 0) continue
        const n = normalDeCara(candidata, a, b, d)
        if (n[0] * normalesDeCaraBase[t * 3] + n[1] * normalesDeCaraBase[t * 3 + 1] + n[2] * normalesDeCaraBase[t * 3 + 2] >= GIRO_MAXIMO) continue
        giran++
        for (const v of [a, b, d]) paso[v] = intento >= 7 ? 0 : paso[v] / 2
      }
      if (intento === 0) recortadas = giran
      if (giran === 0) break
    }
    let mayor = 0
    for (let v = 0; v < c.vertices; v++) {
      subida[v] += paso[v]
      mayor = Math.max(mayor, paso[v])
    }
    posicion.set(candidata)
    dicho(
      `${nombre}, pasada ${pasada}: ${faltan.toLocaleString('es-CL')} puntos sin holgura · se sube hasta ${(mayor * 1000).toFixed(1)} mm` +
        (recortadas ? ` · ${recortadas.toLocaleString('es-CL')} caras se habrían dado la vuelta` : ''),
    )
    medida = medir()
  }
  // El remate, por la normal de la cara y no por la de sus vértices. Donde la malla se pliega las normales de los
  // vértices de una cara pueden mirar casi de canto o contra ella, y subirlos por ahí no la aleja de lo que tiene
  // debajo: tras las pasadas quedaban 31 puntos sin sus 2 mm, los mismos pasada tras pasada. Aquí cada cara que aún no
  // llega se traslada entera a lo largo de su propia normal, sin repartirlo entre los vecinos —son pocas y aisladas— y
  // con el mismo freno contra darse la vuelta. Deja la mitad, y lo que queda pasa del mínimo de la prueba.
  for (let remate = 1; remate <= 6; remate++) {
    const empuje = new Float64Array(c.vertices * 3)
    const cuanto = new Float64Array(c.vertices)
    let faltan = 0
    for (let i = 0; i < n; i++) {
      const falta = holgura - medida.profundidad[i]
      const t = medida.triangulo[i]
      if (!(falta > 1e-5) || ignorar?.[i] || t < 0) continue
      faltan++
      const nc = normalDeCara(posicion, c.tri[t * 3], c.tri[t * 3 + 1], c.tri[t * 3 + 2])
      for (let k = 0; k < 3; k++) {
        const v = c.tri[t * 3 + k]
        if (falta <= cuanto[v]) continue
        cuanto[v] = falta
        for (let j = 0; j < 3; j++) empuje[v * 3 + j] = nc[j] * falta
      }
    }
    if (faltan === 0) break
    if (enLaZonaSuave) {
      // Lo que sube el remate en la nariz también lleva hombros: hasta 1,8 mm en seis vértices sobre vecinos que no
      // subían, y esa diferencia era otra vez un escalón. Los vecinos suben lo que dice la envolvente, por la normal
      // suavizada; los que piden por sí mismos conservan la normal de su cara, que es para lo que se hizo el remate.
      const fuente = new Float64Array(c.vertices)
      for (let v = 0; v < c.vertices; v++) if (enLaZonaSuave[v]) fuente[v] = cuanto[v]
      const loma = envolventeConPendiente(fuente, vecinos, posicion, suave.pendiente)
      for (let v = 0; v < c.vertices; v++) {
        if (!enLaZonaSuave[v] || !(loma[v] > cuanto[v])) continue
        cuanto[v] = loma[v]
        for (let j = 0; j < 3; j++) empuje[v * 3 + j] = normalesBase[v * 3 + j] * loma[v]
      }
    }
    const escala = new Float64Array(c.vertices).fill(1)
    const candidata = Float32Array.from(posicion)
    for (let intento = 0; ; intento++) {
      for (let v = 0; v < c.vertices; v++) {
        if (!cuanto[v]) continue
        for (let k = 0; k < 3; k++) candidata[v * 3 + k] = posicion[v * 3 + k] + empuje[v * 3 + k] * escala[v]
      }
      let giran = 0
      for (let t = 0; t < c.tri.length / 3; t++) {
        const a = c.tri[t * 3], b = c.tri[t * 3 + 1], d = c.tri[t * 3 + 2]
        if (!(cuanto[a] * escala[a]) && !(cuanto[b] * escala[b]) && !(cuanto[d] * escala[d])) continue
        const nn = normalDeCara(candidata, a, b, d)
        if (nn[0] * normalesDeCaraBase[t * 3] + nn[1] * normalesDeCaraBase[t * 3 + 1] + nn[2] * normalesDeCaraBase[t * 3 + 2] >= GIRO_MAXIMO) continue
        giran++
        for (const v of [a, b, d]) escala[v] = intento >= 7 ? 0 : escala[v] / 2
      }
      if (giran === 0) break
    }
    for (let v = 0; v < c.vertices; v++) subida[v] += cuanto[v] * escala[v]
    posicion.set(candidata)
    dicho(`${nombre}, remate ${remate}: ${faltan.toLocaleString('es-CL')} puntos sin holgura se suben por la normal de su cara`)
    medida = medir()
  }
  dicho(`${nombre}: ${medida.buscador.enterradas().toLocaleString('es-CL')} caras enterradas en otra parte de la piel`)
  return { posicion, subida, medida, vecinos, identidad }
}

// --- las orejas ------------------------------------------------------------------------------
// Primero, porque de cómo queden depende qué cubren: la oreja anatómica, a `HOLGURA_EN_LA_OREJA` de su piel.
// `generar.py` la deja a 1,2 mm, pero el suavizado se come el borde del hélix, que es fino.
const deLaOreja = puntosDeLoDeDentro(catalogo.piezas, leer, (p) => p.nombre === NOMBRE_DE_LA_OREJA, () => true).puntos
const cajaDe = (pos, margen) => {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], pos[i + k] - margen)
      hi[k] = Math.max(hi[k], pos[i + k] + margen)
    }
  }
  return (x, y, z) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1] && z >= lo[2] && z <= hi[2]
}
for (const [n, o] of orejas.entries()) {
  const enLaCaja = cajaDe(o.pos, ALCANCE)
  const suyos = []
  for (let i = 0; i < deLaOreja.length; i += 3) if (enLaCaja(deLaOreja[i], deLaOreja[i + 1], deLaOreja[i + 2])) suyos.push(deLaOreja[i], deLaOreja[i + 1], deLaOreja[i + 2])
  o.pos = empujar(o, Float32Array.from(suyos), { holgura: HOLGURA_EN_LA_OREJA, celda: 0.004, nombre: n ? 'Oreja derecha' : 'Oreja izquierda' }).posicion
}

// --- lo que tapa la oreja ----------------------------------------------------------------------
// No se empuja la piel del cuerpo para cubrir lo que ya cubre la de una oreja: `generar.py` le quitó al
// cuerpo el bulto de la oreja, y empujarlo para tapar el cartílago se lo devolvía. Es lo mismo que acepta
// `comprobarLaPiel`, que mira las orejas cuando el cuerpo no basta.
const bajoUnaOreja = new Uint8Array(nPuntos)
for (const o of orejas) {
  const b = crearBuscador(o.pos, o.tri, { celda: 0.004 })
  const enLaCaja = cajaDe(o.pos, ALCANCE)
  for (let i = 0; i < nPuntos; i++) {
    const x = puntos[i * 3], y = puntos[i * 3 + 1], z = puntos[i * 3 + 2]
    if (!enLaCaja(x, y, z)) continue
    const r = profundidadBajoLaPiel(b, x, y, z, ALCANCE, HOLGURA_MINIMA)
    if (r && r.profundidad >= HOLGURA_MINIMA) bajoUnaOreja[i] = 1
  }
}
dicho(`Bajo la piel de las orejas: ${bajoUnaOreja.reduce((n, b) => n + b, 0).toLocaleString('es-CL')} puntos, que no empujan la del cuerpo`)

// --- el cuerpo -------------------------------------------------------------------------------
const { posicion, subida, medida, vecinos, identidad } = empujar(cuerpo, puntos, { holgura: HOLGURA, celda: 0.006, ignorar: bajoUnaOreja, nombre: 'Cuerpo', suave: ZONA_SUAVE })

// --- lo que queda, contado -------------------------------------------------------------------
const sinHolgura = new Map()
let peor = Infinity
for (let i = 0; i < nPuntos; i++) {
  if (bajoUnaOreja[i]) continue
  peor = Math.min(peor, medida.profundidad[i])
  if (medida.profundidad[i] >= HOLGURA_MINIMA) continue
  const nombre = catalogo.piezas[origen[i]].nombre
  const e = sinHolgura.get(nombre) ?? { n: 0, peor: Infinity }
  e.n++
  e.peor = Math.min(e.peor, medida.profundidad[i])
  sinHolgura.set(nombre, e)
}
const escalones = [0.1, 1, 3, 6, 10].map((mm) => [mm, subida.reduce((n, s) => n + (s * 1000 >= mm ? 1 : 0), 0)])
dicho(`Vértices que suben al menos: ${escalones.map(([mm, n]) => `${mm} mm → ${n.toLocaleString('es-CL')}`).join(' · ')}`)
dicho(`Lo más superficial queda a ${(peor * 1000).toFixed(2)} mm bajo la piel`)
for (const [nombre, e] of [...sinHolgura].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
  dicho(`  sin ${HOLGURA_MINIMA * 1000} mm: ${nombre} · ${e.n} puntos, el peor a ${(e.peor * 1000).toFixed(2)} mm`)
}

// --- la cara de dentro -----------------------------------------------------------------------
// Qué se mide contra la cara de dentro, y a qué profundidad bajo la de fuera, se decide exactamente como en
// `comprobarLaPiel`: con su misma llamada y su misma regla para lo que cubre una oreja (eso no cuenta: la cara de
// dentro forra el cuerpo). Se decidía con la medida del empuje, que pide otra holgura y por eso, junto a la oreja,
// podía ver fuera de la piel lo que la comprobación ve a milímetro y medio: si las dos no miran los mismos puntos, el
// guion puede dar por buena una cara de dentro que la comprobación rechaza tras veinte minutos.
const deLasOrejas = orejas.map((o) => crearBuscador(o.pos, o.tri, { celda: 0.004 }))
/** La profundidad de cada punto bajo la cara de fuera del cuerpo, o `NaN` si lo cubre una oreja. */
const deFuera = new Float64Array(nPuntos)
for (let i = 0; i < nPuntos; i++) {
  const x = puntos[i * 3], y = puntos[i * 3 + 1], z = puntos[i * 3 + 2]
  const r = profundidadBajoLaPiel(medida.buscador, x, y, z, ALCANCE, HOLGURA_MINIMA)
  deFuera[i] = r ? r.profundidad : ALCANCE
  if (deFuera[i] >= HOLGURA_MINIMA) continue
  let mejor = deFuera[i]
  for (const b of deLasOrejas) {
    const o = profundidadBajoLaPiel(b, x, y, z, ALCANCE, HOLGURA_MINIMA)
    if (o && o.profundidad > mejor) mejor = o.profundidad
  }
  if (mejor >= HOLGURA_MINIMA) deFuera[i] = NaN
}
// Los vasos y los nervios van dentro de la grasa (`limitaLaGrasa`, D-331): la cara de fuera los cubre, pero la de
// dentro pasa por debajo de ellos. Es la misma regla que `comprobarLaPiel` para la cara de dentro.
const cuentaParaDentro = (i) => !Number.isNaN(deFuera[i]) && limitaLaGrasa(catalogo.piezas[origen[i]])
// Cuánto hay debajo de cada vértice: lo menos profundo de los puntos que rige cada triángulo que lo toca.
const debajo = new Float64Array(cuerpo.vertices).fill(ALCANCE)
for (let i = 0; i < nPuntos; i++) {
  const t = medida.triangulo[i]
  if (t < 0 || !cuentaParaDentro(i)) continue
  for (let k = 0; k < 3; k++) {
    const v = cuerpo.tri[t * 3 + k]
    debajo[v] = Math.min(debajo[v], deFuera[i])
  }
}
// Y lo de los vecinos: un punto que cae en medio de una cara cuenta para los tres vértices, pero la cara de dentro
// de un vértice vecino también pasa por encima de él.
const debajoEnElEntorno = Float64Array.from(debajo)
for (let v = 0; v < cuerpo.vertices; v++) for (const w of vecinos[v]) debajoEnElEntorno[v] = Math.min(debajoEnElEntorno[v], debajo[w])
const normalesFinales = normalesDeVertice(posicion, cuerpo.tri, identidad, cuerpo.vertices)
// La cara de dentro va por la misma malla que la de fuera, vértice a vértice. Iba por la malla gruesa (la de
// Loop ×1, un tercio de vértices), y sobre los abultamientos que deja el empuje cada cara gruesa, plana, pasaba por
// debajo de lo que la fina cubre: junto a la oreja, la fascia del cuero cabelludo quedaba 2 mm por encima de la cara
// de dentro, y acercar sus vértices a la de fuera no lo arreglaba, porque lo que se hundía era el medio de la cara.
const espesor = new Float64Array(cuerpo.vertices)
for (let v = 0; v < cuerpo.vertices; v++) espesor[v] = Math.min(espesorPedido(posicion[v * 3 + 1]), debajoEnElEntorno[v] - HOLGURA_DE_DENTRO)
// Donde la grasa no cabe se adelgaza con pendiente (`PENDIENTE_DEL_GROSOR`), y no de golpe: el mayor grosor que no
// pasa de lo que cabe en cada vértice y no cambia más que eso entre vecinos. `envolventeConPendiente` busca el menor
// campo que no baja de lo pedido; con lo que le falta a cada vértice para el grosor entero, da lo contrario.
{
  const falta = Float64Array.from(espesor, (e) => ESPESOR_CON_LA_GRASA - e)
  const envolvente = envolventeConPendiente(falta, vecinos, posicion, PENDIENTE_DEL_GROSOR)
  for (let v = 0; v < cuerpo.vertices; v++) espesor[v] = Math.max(ESPESOR_MINIMO, ESPESOR_CON_LA_GRASA - envolvente[v])
}
const dentro = new Float32Array(cuerpo.vertices * 3)
const ponerLaCaraDeDentro = () => {
  for (let v = 0; v < cuerpo.vertices; v++) {
    for (let k = 0; k < 3; k++) dentro[v * 3 + k] = posicion[v * 3 + k] - normalesFinales[v * 3 + k] * espesor[v]
  }
}
ponerLaCaraDeDentro()
// Lo de arriba es una estimación, y donde algo queda a menos del doble de lo que pide la prueba la cara de dentro
// se acerca a la de fuera lo que falte. Solo se miran los puntos que pueden estar a su alcance.
//
// La cara de dentro no mira lo que copia una cara de fuera enterrada, igual que `comprobarLaPiel` (ver
// `crearBuscador`). Mirándolo, tres puntos —dos vasos del índice derecho, entre dedos que se meten uno en otro, y uno
// de la fascia temporal derecha, junto al ojo— se quedaban a 0,13–0,18 mm pasada tras pasada, y con la fascia
// medida en rejilla uno quedó por encima: estaban entre las dos hojas de un pliegue de 0,11 mm, y ni acercar la cara
// de dentro ni dejarla en su mínimo por cercanía los apartaba. Se probaron las dos cosas.
{
  const objetivo = 2 * HOLGURA_BAJO_LA_CARA_DE_DENTRO
  const cercanos = []
  for (let i = 0; i < nPuntos; i++) if (deFuera[i] < ESPESOR_CON_LA_GRASA + 0.004 && cuentaParaDentro(i)) cercanos.push(i)
  for (let pasada = 1; pasada <= PASADAS; pasada++) {
    const b = crearBuscador(dentro, cuerpo.tri, { celda: 0.006, tambienEnterradas: medida.buscador.enterrada })
    const acercar = new Float64Array(cuerpo.vertices)
    let faltan = 0
    for (const i of cercanos) {
      const r = profundidadBajoLaPiel(b, puntos[i * 3], puntos[i * 3 + 1], puntos[i * 3 + 2], ALCANCE, objetivo)
      if (!r || r.triangulo < 0 || r.profundidad >= objetivo) continue
      faltan++
      for (let k = 0; k < 3; k++) {
        const v = cuerpo.tri[r.triangulo * 3 + k]
        acercar[v] = Math.max(acercar[v], objetivo - r.profundidad)
      }
    }
    if (faltan === 0) {
      dicho(`Cara de dentro, pasada ${pasada}: nada a menos de ${objetivo * 1000} mm por debajo.`)
      break
    }
    const reparto = relajarEmpuje(acercar, vecinos, { amortiguacion: 0.7, vueltas: 30 })
    for (let v = 0; v < cuerpo.vertices; v++) espesor[v] = Math.max(0.00005, espesor[v] - reparto[v])
    ponerLaCaraDeDentro()
    dicho(`Cara de dentro, pasada ${pasada}: ${faltan} puntos a menos de ${objetivo * 1000} mm; se acerca a la de fuera`)
  }
}
// Cuánta grasa quedó, sin la cabeza: el dueño eligió 2 mm sabiendo que no caben en todas partes (D-331).
{
  let cuerpoSinCabeza = 0
  let entera = 0
  let sinGrasa = 0
  for (let v = 0; v < cuerpo.vertices; v++) {
    if (posicion[v * 3 + 1] >= CUELLO.desde) continue
    cuerpoSinCabeza++
    if (espesor[v] >= ESPESOR_CON_LA_GRASA - 0.0001) entera++
    if (espesor[v] <= ESPESOR_DE_LA_DERMIS + 0.0001) sinGrasa++
  }
  const pct = (n) => ((100 * n) / cuerpoSinCabeza).toFixed(1).replace('.', ',')
  dicho(`La grasa, sin la cabeza: entera en el ${pct(entera)} % de los vértices; sin nada de grasa, en el ${pct(sinGrasa)} %`)
}
// Con las caras al revés: miran hacia el cuerpo, como la de BodyParts3D.
const triDentro = new Uint32Array(cuerpo.tri.length)
for (let t = 0; t < cuerpo.tri.length; t += 3) {
  triDentro[t] = cuerpo.tri[t]
  triDentro[t + 1] = cuerpo.tri[t + 2]
  triDentro[t + 2] = cuerpo.tri[t + 1]
}

// --- la pieza --------------------------------------------------------------------------------
const partes = [
  { nombre: 'cuerpo', pos: posicion, tri: cuerpo.tri },
  ...orejas.map((o, i) => ({ nombre: i ? 'oreja derecha' : 'oreja izquierda', pos: o.pos, tri: o.tri })),
  { nombre: 'cara de dentro', pos: dentro, tri: triDentro },
]
const verticesTotales = partes.reduce((n, p) => n + p.pos.length / 3, 0)
const indicesTotales = partes.reduce((n, p) => n + p.tri.length, 0)
const posPiel = new Float32Array(verticesTotales * 3)
const norPiel = new Int16Array(verticesTotales * 3)
const idxPiel = new Uint32Array(indicesTotales)
{
  let v0 = 0
  let t0 = 0
  for (const p of partes) {
    const n = p.pos.length / 3
    const id = Int32Array.from({ length: n }, (_, i) => i)
    const normales = normalesDeVertice(p.pos, p.tri, id, n)
    posPiel.set(p.pos, v0 * 3)
    for (let i = 0; i < n * 3; i++) norPiel[v0 * 3 + i] = Math.round(normales[i] * 32767)
    for (let i = 0; i < p.tri.length; i++) idxPiel[t0 + i] = p.tri[i] + v0
    v0 += n
    t0 += p.tri.length
  }
}
const minimo = [Infinity, Infinity, Infinity]
const maximo = [-Infinity, -Infinity, -Infinity]
for (let v = 0; v < verticesTotales; v++) {
  for (let k = 0; k < 3; k++) {
    minimo[k] = Math.min(minimo[k], posPiel[v * 3 + k])
    maximo[k] = Math.max(maximo[k], posPiel[v * 3 + k])
  }
}
dicho(`Piel nueva: ${verticesTotales.toLocaleString('es-CL')} vértices, ${(indicesTotales / 3).toLocaleString('es-CL')} triángulos (antes ${piel.vertices.toLocaleString('es-CL')} y ${(piel.indices / 3).toLocaleString('es-CL')})`)

// --- comprobar antes de escribir --------------------------------------------------------------
// Lo mismo que la prueba, con lo que se va a escribir y no con lo calculado: se vuelve a leer de los
// arreglos de la pieza.
// Sin la fascia superficial: la del atlas es todavía la de la piel anterior, y se rehace después, sobre esta.
const informe = comprobarLaPiel({
  pieza: { pos: posPiel, idx: idxPiel, vertices: verticesTotales },
  piezas: catalogo.piezas,
  leer,
  conLaFasciaSuperficial: false,
})
for (const linea of informe.lineas) dicho(linea)
if (!informe.cumple) {
  // Al atlas no va, pero se deja para mirarla: sin ella, saber por qué falló pedía otro cuarto de hora de cálculo.
  writeFileSync(join(SALIDA, 'rechazada.bin'), Buffer.concat([Buffer.from(posPiel.buffer), Buffer.from(idxPiel.buffer)]))
  writeFileSync(join(SALIDA, 'rechazada.json'), JSON.stringify({ vertices: verticesTotales, indices: indicesTotales }))
  console.error(`\nLa piel no cumple lo que exige la prueba. No se escribe nada en el atlas; queda en ${join(SALIDA, 'rechazada.bin')}.`)
  process.exit(1)
}

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}

// --- el paquete ------------------------------------------------------------------------------
// Se rehace entero, en el mismo orden, con la piel nueva en su sitio: las demás piezas cambian de
// desplazamiento pero no de bytes, y se comprueba al final.
const numero = piel.paquete
const viejo = paquete(numero)
const delPaquete = catalogo.piezas.filter((p) => p.paquete === numero).sort((a, b) => a.pos - b.pos)
const huellaDe = (p, b) =>
  createHash('sha256')
    .update(b.subarray(p.pos, p.pos + p.vertices * 12))
    .update(b.subarray(p.nor, p.nor + p.vertices * 6))
    .update(b.subarray(p.idx, p.idx + p.indices * 4))
    .digest('hex')
const huellasAntes = new Map(delPaquete.filter((p) => p.id !== piel.id).map((p) => [p.id, huellaDe(p, viejo)]))
const trozos = []
let cursor = 0
const poner = (bytes) => {
  const relleno = alinear(cursor) - cursor
  if (relleno) trozos.push(Buffer.alloc(relleno))
  cursor = alinear(cursor)
  const donde = cursor
  trozos.push(bytes)
  cursor += bytes.length
  return donde
}
const desplazamientos = new Map()
for (const p of delPaquete) {
  if (p.id === piel.id) {
    desplazamientos.set(p.id, {
      pos: poner(Buffer.from(posPiel.buffer)),
      nor: poner(Buffer.from(norPiel.buffer)),
      idx: poner(Buffer.from(idxPiel.buffer)),
    })
  } else {
    desplazamientos.set(p.id, {
      pos: poner(viejo.subarray(p.pos, p.pos + p.vertices * 12)),
      nor: poner(viejo.subarray(p.nor, p.nor + p.vertices * 6)),
      idx: poner(viejo.subarray(p.idx, p.idx + p.indices * 4)),
    })
  }
}
if (alinear(cursor) > cursor) trozos.push(Buffer.alloc(alinear(cursor) - cursor))
const nuevoPaquete = Buffer.concat(trozos)
const piezas = catalogo.piezas.map((p) => {
  if (p.paquete !== numero) return p
  const d = desplazamientos.get(p.id)
  if (p.id !== piel.id) return { ...p, ...d }
  const { ajustada: _ajustada, ...resto } = p
  return {
    ...resto,
    ...d,
    vertices: verticesTotales,
    indices: indicesTotales,
    caja: [minimo, maximo],
    recalculada: `D-224 y D-331, holgura ${HOLGURA * 1000} mm y ${ESPESOR_CON_LA_GRASA * 1000} mm de piel con la grasa`,
  }
})
for (const p of piezas.filter((q) => q.paquete === numero && q.id !== piel.id)) {
  if (huellaDe(p, nuevoPaquete) !== huellasAntes.get(p.id)) throw new Error(`La pieza ${p.id} cambió al rehacer el paquete. No se escribe nada.`)
}
const comprimido = gzipSync(nuevoPaquete, { level: 9 })
const paquetesNuevos = catalogo.paquetes.map((p, i) =>
  i === numero ? { ...p, bytes: nuevoPaquete.byteLength, bytesComprimido: comprimido.byteLength } : p,
)
const nuevo = {
  ...catalogo,
  triangulos: catalogo.triangulos - piel.indices / 3 + indicesTotales / 3,
  paquetes: paquetesNuevos,
  piezas,
  version: versionDelCatalogo(piezas, paquetesNuevos),
}
writeFileSync(join(ATLAS, catalogo.paquetes[numero].archivo), comprimido)
writeFileSync(join(ATLAS, 'catalogo.json'), JSON.stringify(nuevo), 'utf8')
writeFileSync(join(ATLAS, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')
dicho(
  `Escrito ${catalogo.paquetes[numero].archivo}: ${(viejo.byteLength / 1048576).toFixed(2)} → ${(nuevoPaquete.byteLength / 1048576).toFixed(2)} MB ` +
    `(${(comprimido.byteLength / 1048576).toFixed(2)} MB comprimido). Versión ${catalogo.version} → ${nuevo.version}`,
)
