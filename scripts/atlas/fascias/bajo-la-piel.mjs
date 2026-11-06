/**
 * Mete la fascia superficial bajo la piel donde `generar.py` la deja asomar (D-224), y desde D-332 bajo la piel
 * entera: bajo su cara de dentro, donde termina la grasa.
 *
 *   node scripts/atlas/fascias/bajo-la-piel.mjs              # dice qué haría
 *   node scripts/atlas/fascias/bajo-la-piel.mjs --aplicar    # reescribe las piezas en salida/
 *
 * Va entre `python scripts/atlas/fascias/generar.py fascia-superficial` y `node scripts/atlas/agregar-fascias.mjs`,
 * con la piel de D-224 ya en el atlas: la fascia se mide contra la piel que hay.
 *
 * Por qué hace falta. `capas.py` calcula la fascia superficial con el campo de distancias de la piel en una rejilla de
 * 3 mm, y para cerrar los agujeros de la piel (los ojos, la boca) la rellena engordada un vóxel. En lo cóncavo ese
 * campo puentea lo que la piel de verdad rodea, y con la piel de D-224, que ya no se deja empujar por la fascia,
 * asomaban 136 puntos de 35.000, hasta 3,7 mm por fuera: entre los dedos, en la entrepierna y en el ángulo de los
 * ojos. La comprobación de `capas.py` no lo ve: tolera lo que sobresale el relleno, 2,75 mm. Aquí se mide con el
 * mismo buscador que la prueba (`comprobarPiel.mjs`), que cuenta vueltas y no confunde un pliegue con un agujero.
 *
 * Desde D-332 la lámina va justo bajo la cara de dentro de la piel —`capas.py` la busca a medio milímetro, y sale a uno
 * de mediana—, y no a mitad de camino del músculo: lo que no puede es meterse en los 4 mm de la piel con su grasa. Se
 * mide con `profundidadDeLaFasciaSuperficial`, la misma función que la prueba, y con su mismo `seguro`.
 *
 * Qué hace, en dos pasos.
 *  1. **Hunde** lo que asoma poco: donde un vértice o un punto de un triángulo (los que mide la prueba) queda a menos
 *     de `OBJETIVO` bajo la cara de dentro de la piel o bajo la piel de una oreja, baja sus vértices por la normal de
 *     la fascia lo que falte, repartido entre los vecinos como `recalcular-piel.mjs` reparte el empuje de la piel, y
 *     nunca más de `TOPE` en total.
 *  2. **Recorta** lo que hundido no entra. Se intentó hundirlo todo, y divergía: la lámina que el campo tiende sobre la
 *     abertura de los ojos y entre los muslos no tiene piel por dentro a la que llegar —detrás está la cuenca del ojo,
 *     encima el hueco entre los muslos—, y bajarla la alejaba más, hasta 3 cm en doce pasadas. Esa lámina no existe en
 *     el cuerpo: la fascia superficial no cruza la hendidura de los párpados ni salta de un muslo al otro. Se quitan
 *     los triángulos con algún punto fuera, y los vértices que se quedan sin triángulo.
 *
 * Todas las piezas se tratan juntas y soldadas, para que el borde entre la mano y el antebrazo se hunda igual en las
 * dos. Y todo se hace igual en una pieza y en su espejo: las izquierdas son el reflejo exacto de las derechas, vértice
 * a vértice y triángulo a triángulo (`tests/unit/fascias.test.ts`), y la piel no es simétrica del todo; cada vértice
 * se hunde lo que pida él o su simétrico, y un triángulo se quita si falla él o el suyo.
 *
 * Lo hundido no se mide contra la fascia profunda: en esos milímetros puede quedar por debajo de ella. Desde D-332 es
 * menos probable que antes, porque la cara de dentro de la piel deja 0,8 mm sobre lo que tiene debajo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  HOLGURA_DE_LA_FASCIA_SUPERFICIAL,
  buscadoresDeLaPiel,
  cascarasDeLaPiel,
  profundidadDeLaFasciaSuperficial,
} from '../comprobarPiel.mjs'
import {
  NOMBRE_DE_LA_PIEL,
  PASO_DE_LAS_GENERADAS,
  SISTEMA_DE_LA_FASCIA_SUPERFICIAL,
  muestrasDelTriangulo,
  normalesDeVertice,
  relajarEmpuje,
  vecinosDe,
  verticesSoldados,
} from '../geometriaDePiel.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SALIDA = join(RAIZ, 'scripts', 'atlas', 'fascias', 'salida')
const ATLAS = join(RAIZ, 'public', 'atlas')
const aplicar = process.argv.includes('--aplicar')

/**
 * Lo que la fascia queda bajo la cara de dentro de la piel donde se la hunde: la mitad del medio milímetro que
 * `capas.py` busca. Lo que se recorta es lo que queda metido en la piel, que es lo que la prueba no admite
 * (`HOLGURA_DE_LA_FASCIA_SUPERFICIAL`).
 */
const OBJETIVO = 0.00025
/**
 * Lo más que se hunde un vértice. Entre los dedos lo que asoma son dos milímetros, y se hunde; en el ojo y entre los
 * muslos asoma más y hundir no lo arregla (ver arriba).
 */
const TOPE = 0.0025
const PASADAS = 8
/** Menos que esto no es mover: no se le rehace la normal. */
const QUIETO = 1e-6

const alinear = (n) => (n + 3) & ~3
const inicio = Date.now()
const dicho = (texto) => console.log(`[${String(Math.round((Date.now() - inicio) / 1000)).padStart(4)} s] ${texto}`)
const fallar = (mensaje) => {
  console.error(`\n${mensaje}`)
  process.exit(1)
}

// --- la piel ---------------------------------------------------------------------------------
const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8'))
const piel = catalogo.piezas.find((p) => p.nombre === NOMBRE_DE_LA_PIEL)
if (!piel?.recalculada) fallar('La piel del atlas no es la de D-224.\nEjecute antes: node scripts/atlas/recalcular-piel.mjs --aplicar')
if (!piel.recalculada.includes('D-331')) fallar('La piel del atlas no trae la grasa de D-331.\nEjecute antes: node scripts/atlas/recalcular-piel.mjs --aplicar')
const paquete = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[piel.paquete].archivo)))
const posPiel = new Float32Array(paquete.buffer.slice(paquete.byteOffset + piel.pos, paquete.byteOffset + piel.pos + piel.vertices * 12))
const idxPiel = new Uint32Array(paquete.buffer.slice(paquete.byteOffset + piel.idx, paquete.byteOffset + piel.idx + piel.indices * 4))
const cascaras = cascarasDeLaPiel(posPiel, idxPiel, piel.vertices)
if (!cascaras.dentro) fallar('La piel del atlas no trae cara de dentro.\nEjecute antes: node scripts/atlas/recalcular-piel.mjs --aplicar')
const buscadores = buscadoresDeLaPiel(posPiel, cascaras)
/**
 * Lo que un punto queda bajo la piel entera, como lo mide `comprobarLaPiel`: con su mismo `seguro`, el de omisión
 * (`HOLGURA_MINIMA`). Con `OBJETIVO` de `seguro`, un punto a menos de un milímetro que caía detrás del triángulo más
 * cercano se daba por bueno sin contar vueltas, y la prueba, que sí las cuenta, encontró uno metido en la piel en un
 * pliegue: el guion lo había dejado y la prueba lo rechazaba (D-332).
 */
const profundidad = (x, y, z) => profundidadDeLaFasciaSuperficial(buscadores, x, y, z)

// --- la fascia superficial -------------------------------------------------------------------
if (!existsSync(join(SALIDA, 'manifiesto.json'))) {
  fallar(`No hay nada generado en ${SALIDA}.\nEjecute antes: python scripts/atlas/fascias/generar.py fascia-superficial`)
}
const manifiesto = JSON.parse(readFileSync(join(SALIDA, 'manifiesto.json'), 'utf8'))
const piezas = manifiesto.piezas
  .filter((r) => r.sistema === SISTEMA_DE_LA_FASCIA_SUPERFICIAL)
  .map((registro) => {
    const bin = readFileSync(join(SALIDA, 'piezas', `${registro.id}.bin`))
    const nPos = registro.vertices * 12
    const nNor = registro.vertices * 6
    const desdeIdx = alinear(nPos + nNor)
    return {
      registro,
      nor: new Int16Array(bin.buffer.slice(bin.byteOffset + nPos, bin.byteOffset + nPos + nNor)),
      idx: new Uint32Array(bin.buffer.slice(bin.byteOffset + desdeIdx, bin.byteOffset + desdeIdx + registro.indices * 4)),
      pos: new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + nPos)),
    }
  })
if (piezas.length === 0) fallar('El manifiesto no trae ninguna pieza de la fascia superficial.')
const porId = new Map(piezas.map((p) => [p.registro.id, p]))
for (const p of piezas) {
  const otra = porId.get(p.registro.id.endsWith('M') ? p.registro.id.slice(0, -1) : `${p.registro.id}M`)
  if (otra && otra.registro.indices !== p.registro.indices) fallar(`${p.registro.nombre} no es el espejo de ${otra.registro.nombre}.`)
  p.espejo = otra ?? null
}

// Todas juntas, con los índices corridos, para soldar los bordes entre piezas.
const total = piezas.reduce((s, p) => s + p.registro.vertices, 0)
const pos = new Float32Array(total * 3)
const triangulos = []
{
  let desde = 0
  let desdeTri = 0
  for (const p of piezas) {
    p.desde = desde
    p.desdeTri = desdeTri
    pos.set(p.pos, desde * 3)
    for (const i of p.idx) triangulos.push(i + desde)
    desde += p.registro.vertices
    desdeTri += p.registro.indices / 3
  }
}
const tri = Uint32Array.from(triangulos)
const nTri = tri.length / 3
const canon = verticesSoldados(pos, total)
const vecinos = vecinosDe(tri, canon, total)
// La dirección en que se hunde es la normal de partida: la de cada pasada gira con lo hundido, y en un pliegue
// acabaría mirando de lado.
const normales = normalesDeVertice(pos, tri, canon, total)
dicho(`Fascia superficial: ${piezas.length} piezas, ${total.toLocaleString('es-CL')} vértices, ${nTri.toLocaleString('es-CL')} triángulos`)

// El simétrico de cada vértice, si lo tiene: el de la x opuesta, a diez micras.
const clave = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
const espejo = new Int32Array(total).fill(-1)
{
  const porPosicion = new Map()
  for (let v = 0; v < total; v++) if (canon[v] === v) porPosicion.set(clave(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), v)
  for (let v = 0; v < total; v++) {
    if (canon[v] !== v) continue
    const w = porPosicion.get(clave(-pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]))
    if (w !== undefined) espejo[v] = w
  }
}
const simetrico = (d) => {
  for (let v = 0; v < total; v++) {
    const w = espejo[v]
    if (w < 0) continue
    const m = Math.max(d[v], d[w])
    d[v] = m
    d[w] = m
  }
}

/**
 * Lo que cada vértice (soldado) queda bajo la piel, y lo que queda lo más superficial de cada triángulo: medido en los
 * mismos puntos que mira la prueba (`muestrasDelTriangulo`, con el paso de las piezas generadas).
 */
const medir = () => {
  const enVertice = new Float64Array(total)
  for (let v = 0; v < total; v++) if (canon[v] === v) enVertice[v] = profundidad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
  const enCentro = new Float64Array(nTri).fill(Infinity)
  for (let t = 0; t < nTri; t++) {
    muestrasDelTriangulo(pos, tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2], PASO_DE_LAS_GENERADAS, (x, y, z) => {
      enCentro[t] = Math.min(enCentro[t], profundidad(x, y, z))
    })
  }
  return { enVertice, enCentro }
}
const resumen = ({ enVertice, enCentro }, umbral) => {
  let faltan = 0
  let peor = Infinity
  for (let v = 0; v < total; v++) {
    if (canon[v] !== v) continue
    peor = Math.min(peor, enVertice[v])
    if (enVertice[v] < umbral) faltan++
  }
  for (let t = 0; t < nTri; t++) {
    peor = Math.min(peor, enCentro[t])
    if (enCentro[t] < umbral) faltan++
  }
  return { faltan, peor }
}

// --- 1. hundir ---------------------------------------------------------------------------------
const hundido = new Float64Array(total)
let medida = medir()
{
  const { faltan, peor } = resumen(medida, HOLGURA_DE_LA_FASCIA_SUPERFICIAL)
  dicho(`Metidos en la piel: ${faltan} puntos; el que más, ${(-peor * 1000).toFixed(2)} mm por encima de la cara de dentro`)
}
for (let pasada = 1; pasada <= PASADAS; pasada++) {
  const necesita = new Float64Array(total)
  const pedir = (v, d) => {
    if (d < OBJETIVO) necesita[canon[v]] = Math.max(necesita[canon[v]], OBJETIVO - d)
  }
  for (let v = 0; v < total; v++) if (canon[v] === v) pedir(v, medida.enVertice[v])
  for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) pedir(tri[t * 3 + k], medida.enCentro[t])
  simetrico(necesita)
  // Con menos amortiguación que la piel: la fascia está hecha de triángulos de un centímetro, y hundir el vecindario
  // de uno ya mueve un palmo.
  const reparto = relajarEmpuje(necesita, vecinos, { amortiguacion: 0.5, vueltas: 20 })
  for (let v = 0; v < total; v++) reparto[v] = Math.min(reparto[v], Math.max(0, TOPE - hundido[v]))
  simetrico(reparto)
  let mayor = 0
  for (let v = 0; v < total; v++) {
    const c = canon[v]
    if (reparto[c] <= 0) continue
    for (let k = 0; k < 3; k++) pos[v * 3 + k] -= normales[c * 3 + k] * reparto[c]
    if (c === v) {
      hundido[v] += reparto[v]
      mayor = Math.max(mayor, reparto[v])
    }
  }
  medida = medir()
  const { faltan, peor } = resumen(medida, OBJETIVO)
  dicho(`Hundir, pasada ${pasada}: se baja hasta ${(mayor * 1000).toFixed(2)} mm; quedan ${faltan} puntos a menos de ${OBJETIVO * 1000} mm, el peor a ${(peor * 1000).toFixed(2)} mm`)
  if (faltan === 0 || mayor < QUIETO) break
}
const movidos = []
let masHundido = 0
for (let v = 0; v < total; v++) {
  if (canon[v] !== v || hundido[v] <= QUIETO) continue
  movidos.push(v)
  masHundido = Math.max(masHundido, hundido[v])
}
dicho(`Se hunden ${movidos.length.toLocaleString('es-CL')} vértices, el que más ${(masHundido * 1000).toFixed(2)} mm`)

// --- 2. recortar -------------------------------------------------------------------------------
// Un triángulo se va si alguno de sus puntos o de sus vértices queda por fuera: son los que mira la prueba.
const fuera = new Uint8Array(nTri)
for (let t = 0; t < nTri; t++) {
  if (medida.enCentro[t] < HOLGURA_DE_LA_FASCIA_SUPERFICIAL) fuera[t] = 1
  for (let k = 0; k < 3; k++) if (medida.enVertice[canon[tri[t * 3 + k]]] < HOLGURA_DE_LA_FASCIA_SUPERFICIAL) fuera[t] = 1
}
for (const p of piezas) {
  if (!p.espejo) continue
  for (let t = 0; t < p.registro.indices / 3; t++) {
    if (fuera[p.desdeTri + t] || fuera[p.espejo.desdeTri + t]) {
      fuera[p.desdeTri + t] = 1
      fuera[p.espejo.desdeTri + t] = 1
    }
  }
}
let recortados = 0
for (let t = 0; t < nTri; t++) recortados += fuera[t]
dicho(`Se recortan ${recortados} triángulos que hundidos no entran`)
if (movidos.length === 0 && recortados === 0) {
  dicho('Nada que hacer: la fascia superficial ya está bajo la piel.')
  process.exit(0)
}

// --- las piezas nuevas ---------------------------------------------------------------------------
// Las normales se rehacen solo donde la forma cambió: lo hundido y su primer anillo. Las demás son las de `generar.py`.
const nuevas = normalesDeVertice(pos, tri, canon, total)
const rehacer = new Uint8Array(total)
for (const v of movidos) {
  rehacer[v] = 1
  for (const w of vecinos[v]) rehacer[w] = 1
}
const cambiadas = []
for (const p of piezas) {
  const r = p.registro
  const nT = r.indices / 3
  let cambia = false
  for (let i = 0; i < r.vertices && !cambia; i++) cambia = rehacer[canon[p.desde + i]] === 1
  for (let t = 0; t < nT && !cambia; t++) cambia = fuera[p.desdeTri + t] === 1
  if (!cambia) continue
  // Los vértices que se quedan: los de algún triángulo que se queda. En una pieza y su espejo son los mismos, porque
  // sus triángulos lo son y se quitaron a la vez.
  const usado = new Uint8Array(r.vertices)
  const quedan = []
  for (let t = 0; t < nT; t++) {
    if (fuera[p.desdeTri + t]) continue
    quedan.push(t)
    for (let k = 0; k < 3; k++) usado[p.idx[t * 3 + k]] = 1
  }
  const nuevo = new Int32Array(r.vertices).fill(-1)
  let n = 0
  for (let i = 0; i < r.vertices; i++) if (usado[i]) nuevo[i] = n++
  const posNueva = new Float32Array(n * 3)
  const norNueva = new Int16Array(n * 3)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < r.vertices; i++) {
    const j = nuevo[i]
    if (j < 0) continue
    const g = p.desde + i
    const c = canon[g]
    for (let k = 0; k < 3; k++) {
      posNueva[j * 3 + k] = pos[g * 3 + k]
      norNueva[j * 3 + k] = rehacer[c] ? Math.max(-32767, Math.min(32767, Math.round(nuevas[c * 3 + k] * 32767))) : p.nor[i * 3 + k]
      min[k] = Math.min(min[k], posNueva[j * 3 + k])
      max[k] = Math.max(max[k], posNueva[j * 3 + k])
    }
  }
  const idxNuevo = new Uint32Array(quedan.length * 3)
  quedan.forEach((t, q) => {
    for (let k = 0; k < 3; k++) idxNuevo[q * 3 + k] = nuevo[p.idx[t * 3 + k]]
  })
  const nPos = n * 12
  const desdeIdx = alinear(nPos + n * 6)
  const bin = Buffer.alloc(desdeIdx + idxNuevo.length * 4)
  Buffer.from(posNueva.buffer).copy(bin, 0)
  Buffer.from(norNueva.buffer).copy(bin, nPos)
  Buffer.from(idxNuevo.buffer).copy(bin, desdeIdx)
  const antes = { vertices: r.vertices, triangulos: nT }
  r.vertices = n
  r.indices = idxNuevo.length
  r.caja = [min, max]
  if (r.medidas) {
    r.medidas.vertices = n
    r.medidas.triangulos = quedan.length
  }
  cambiadas.push({ registro: r, bin, antes })
}
for (const { registro: r, antes } of cambiadas) {
  const menos = antes.triangulos - r.indices / 3
  dicho(`  ${r.nombre}: ${menos ? `${menos} triángulos recortados, ` : ''}${antes.vertices - r.vertices ? `${antes.vertices - r.vertices} vértices menos` : 'mismos vértices'}`)
}
if (!aplicar) {
  console.log('\nNo se escribió nada. Para escribirlo: node scripts/atlas/fascias/bajo-la-piel.mjs --aplicar')
  process.exit(0)
}
for (const { registro, bin } of cambiadas) writeFileSync(join(SALIDA, 'piezas', `${registro.id}.bin`), bin)
// Con el mismo formato que escribe `generar.py` (`indent=1`, sin escapar las tildes).
writeFileSync(join(SALIDA, 'manifiesto.json'), JSON.stringify(manifiesto, null, 1))
dicho('Escrito. Ahora: node scripts/atlas/agregar-fascias.mjs --aplicar')
