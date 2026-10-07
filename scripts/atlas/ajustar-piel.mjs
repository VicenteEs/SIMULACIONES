/**
 * Ensancha la piel del atlas donde lo de dentro la atraviesa (D-159).
 *
 *   node scripts/atlas/ajustar-piel.mjs [--aplicar] [--holgura=2]
 *
 * Sin `--aplicar` solo mide y dice qué haría. Con él reescribe, en su sitio, las
 * posiciones y las normales de la piel (`FJ2810`) en su paquete, anota la caja
 * nueva en `public/atlas/catalogo.json` con una versión de catálogo nueva y
 * rehace `ATRIBUCION.md`.
 *
 * Por qué hace falta: la piel de BodyParts3D es la de un cuerpo promedio y las
 * demás estructuras, de otro: las venas safenas, el tracto iliotibial, el
 * platisma, la oreja y los cartílagos de la nariz asoman por fuera de ella. Con
 * la piel encendida se veía el músculo por fuera de la piel, que es justo al
 * revés de como se opera.
 *
 * Qué hace: para cada punto de lo que hay debajo (vértices y centro de cada
 * triángulo), mide a qué distancia queda de la cáscara exterior de la piel y si
 * está dentro o fuera. Donde no le sobran `--holgura` milímetros, la piel
 * necesita subir lo que falte. Ese empuje se reparte entre los vértices vecinos
 * (`relajarEmpuje`) para que quede un abultamiento suave y no un pico, y se
 * aplica a lo largo de la normal. La cáscara interior —la piel tiene espesor,
 * unos 3 mm— se mueve con la exterior para no quedar cruzada.
 *
 * Se repite hasta tres veces dentro de una misma ejecución porque empujar a lo
 * largo de la normal no es empujar hacia el punto: la segunda pasada recoge lo
 * que la primera dejó corto.
 *
 * No se repite entre ejecuciones: la pieza queda marcada con `ajustada` en el
 * catálogo y el guion se niega a volver sobre ella salvo con `--otra-vez`. Sin
 * la marca, cada ejecución volvería a empujar los puñados de puntos que ninguna
 * pasada resuelve —la piel del índice apretada contra la del pulgar— hasta el
 * tope, y la deformación crecería en silencio. Para rehacerla desde cero, se
 * restaura el paquete del historial y se vuelve a correr.
 *
 * Lo que se deja fuera a propósito: los ojos y sus músculos (la piel del atlas
 * no tiene párpados abiertos y el globo ocular tiene que asomar), los labios, las
 * uñas y todo lo que ya es piel. Subir la piel sobre la córnea la taparía.
 *
 * El original no se pierde: está en el historial de git (`git show 71192c0:public/atlas/cuerpo-10.bin.gz`).
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { atribucion } from './atribucion.mjs'
import {
  cascarasDeLaPiel,
  crearBuscador,
  empujeNecesario,
  normalesDeVertice,
  relajarEmpuje,
  vecinosDe,
  verticesSoldados,
} from './geometriaDePiel.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESTINO = join(RAIZ, 'public', 'atlas')

const aplicar = process.argv.includes('--aplicar')
const depurar = process.argv.includes('--depurar')
const argumento = process.argv.find((a) => a.startsWith('--holgura='))
/** Cuánto debe quedar por debajo de la piel lo más superficial, en metros. */
const HOLGURA = (argumento ? Number(argumento.split('=')[1]) : 2) / 1000
/** Hasta dónde se mira alrededor de la piel: lo que está más hondo no la toca. */
const ALCANCE = 0.03
/**
 * Lo máximo que se mueve un vértice: 12 mm. Lo más que pide la oreja son 16, y un
 * dedo mide 15 de ancho; más que esto sería una deformación y no un ajuste. Los
 * puntos que así queden sin holgura —un puñado de arterias digitales del índice,
 * donde la piel está apretada contra la del pulgar— se cuentan y se dicen.
 */
const TOPE = 0.012
/** La piel misma, y lo que ya es piel por clasificación: uñas, pelo. */
const SISTEMAS_APARTE = new Set(['integumentary'])
/**
 * Ojos y labios. No son «músculo por fuera»: el globo ocular asoma porque no hay
 * párpado, y el labio es el borde de la boca. Se nombran las estructuras del ojo
 * una a una porque una expresión suelta como `rectus` también cogería el recto
 * del abdomen, y `oblique` el oblicuo externo (se vio al medir).
 */
const APARTE_POR_NOMBRE =
  /eyeball|check ligament|\blens\b|\biris\b|sclera|cornea|choroid|retina|vitreous|ciliaris|anterior chamber|posterior chamber|tarsal plate|lacrimal|eyelid|levator palpebrae|optic (nerve|part|disc)|^(left |right )?(superior|inferior|medial|lateral) rectus|^(left |right )?(superior|inferior) oblique|orbital|trochlear|oculomotor|abducens|ophthalmic|nasociliary|frontal nerve|^lip$|^(left |right )?upper lip|^(left |right )?lower lip/i

const catalogo = JSON.parse(readFileSync(join(DESTINO, 'catalogo.json'), 'utf8'))
const piel = catalogo.piezas.find((p) => p.nombre === 'Skin')
if (!piel) throw new Error('El atlas no tiene piel. Primero scripts/atlas/devolver-piel.mjs.')
if (piel.ajustada && !process.argv.includes('--otra-vez')) {
  console.log(`La piel ya está ajustada (${piel.ajustada}). Con --otra-vez se vuelve a ajustar, pero empuja otra vez lo que quedó corto.`)
  process.exit(0)
}

const paquetes = catalogo.paquetes.map((p) => gunzipSync(readFileSync(join(DESTINO, p.archivo))))
const bufer = paquetes[piel.paquete]
const posOriginal = new Float32Array(
  bufer.buffer.slice(bufer.byteOffset + piel.pos, bufer.byteOffset + piel.pos + piel.vertices * 12),
)
const norOriginal = new Int16Array(
  bufer.buffer.slice(bufer.byteOffset + piel.nor, bufer.byteOffset + piel.nor + piel.vertices * 6),
)
const idx = new Uint32Array(
  bufer.buffer.slice(bufer.byteOffset + piel.idx, bufer.byteOffset + piel.idx + piel.indices * 4),
)

const { exterior, interior } = cascarasDeLaPiel(posOriginal, idx, piel.vertices)
const canon = verticesSoldados(posOriginal, piel.vertices)
console.log(
  `Piel ${piel.id}: ${piel.vertices} vértices · cáscara exterior ${exterior.length / 3} triángulos, interior ${interior.length / 3}`,
)

/** Los puntos de lo de dentro que pueden tocar la piel: se reúnen una sola vez. */
function reunirCandidatos() {
  // Una rejilla gruesa de lo que está a menos de ALCANCE de la piel descarta de un
  // vistazo los millones de puntos que están en el medio del cuerpo.
  const celda = 0.04
  const ocupadas = new Set()
  const clave = (i, j, l) => (i + 512) * 1048576 + (j + 512) * 1024 + (l + 512)
  for (let t = 0; t < exterior.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const v = exterior[t + k] * 3
      const ci = Math.floor(posOriginal[v] / celda), cj = Math.floor(posOriginal[v + 1] / celda), cl = Math.floor(posOriginal[v + 2] / celda)
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) ocupadas.add(clave(ci + i, cj + j, cl + l))
    }
  }
  const cerca = (x, y, z) => ocupadas.has(clave(Math.floor(x / celda), Math.floor(y / celda), Math.floor(z / celda)))

  const puntos = []
  const origen = []
  const apartadas = new Map()
  for (const p of catalogo.piezas) {
    if (p.nombre === 'Skin') continue
    if (SISTEMAS_APARTE.has(p.sistema) || APARTE_POR_NOMBRE.test(p.nombre)) {
      apartadas.set(p.nombre, p.vertices)
      continue
    }
    const b = paquetes[p.paquete]
    const pos = new Float32Array(b.buffer.slice(b.byteOffset + p.pos, b.byteOffset + p.pos + p.vertices * 12))
    const ind = new Uint32Array(b.buffer.slice(b.byteOffset + p.idx, b.byteOffset + p.idx + p.indices * 4))
    for (let i = 0; i < p.vertices; i++) {
      if (cerca(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) {
        puntos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
        origen.push(p.nombre)
      }
    }
    // Un triángulo grande asoma por el medio aunque sus tres vértices queden dentro.
    for (let t = 0; t < ind.length; t += 3) {
      const a = ind[t] * 3, bb = ind[t + 1] * 3, c = ind[t + 2] * 3
      const x = (pos[a] + pos[bb] + pos[c]) / 3, y = (pos[a + 1] + pos[bb + 1] + pos[c + 1]) / 3, z = (pos[a + 2] + pos[bb + 2] + pos[c + 2]) / 3
      if (cerca(x, y, z)) {
        puntos.push(x, y, z)
        origen.push(p.nombre)
      }
    }
  }
  return { puntos: Float32Array.from(puntos), origen, apartadas }
}

const { puntos, origen, apartadas } = reunirCandidatos()
console.log(`Puntos de lo de dentro cerca de la piel: ${(puntos.length / 3).toLocaleString('es-CL')}`)
console.log(`Apartados (ojos, labios, uñas): ${apartadas.size} piezas`)

const normales = normalesDeVertice(posOriginal, exterior, canon, piel.vertices)
const vecinos = vecinosDe(exterior, canon, piel.vertices)
const enLaExterior = new Uint8Array(piel.vertices)
for (const i of exterior) enLaExterior[canon[i]] = 1

// Lo acumulado: cuánto sube cada vértice (soldado) a lo largo de su normal.
const subida = new Float64Array(piel.vertices)
const causa = new Array(piel.vertices).fill(null)
const posicion = Float32Array.from(posOriginal)

let faltanAntes = Infinity
for (let vuelta = 1; vuelta <= 3; vuelta++) {
  const buscador = crearBuscador(posicion, exterior)
  const necesita = new Float64Array(piel.vertices)
  let faltan = 0
  const residuo = new Map()
  for (let i = 0; i < puntos.length / 3; i++) {
    const r = empujeNecesario(buscador, puntos[i * 3], puntos[i * 3 + 1], puntos[i * 3 + 2], HOLGURA, ALCANCE)
    if (!r || r.empuje <= 1e-4) continue
    faltan++
    if (depurar && vuelta > 1) {
      const e = residuo.get(origen[i]) ?? { n: 0, mayor: 0, donde: null }
      e.n++
      if (r.empuje > e.mayor) ((e.mayor = r.empuje), (e.donde = [puntos[i * 3], puntos[i * 3 + 1], puntos[i * 3 + 2]]))
      residuo.set(origen[i], e)
    }
    for (let k = 0; k < 3; k++) {
      const v = canon[exterior[r.triangulo * 3 + k]]
      if (r.empuje > necesita[v]) {
        necesita[v] = r.empuje
        causa[v] = origen[i]
      }
    }
  }
  if (faltan === 0) {
    console.log(`Pasada ${vuelta}: nada falta.`)
    break
  }
  // Si la pasada no mejora a la anterior, lo que queda no se arregla empujando
  // más: es piel contra piel, y repetir solo la deforma.
  if (vuelta > 1 && faltan > 0.95 * faltanAntes) {
    console.log(`Pasada ${vuelta}: ${faltan} puntos siguen sin holgura y empujar más no los resuelve. Se deja.`)
    break
  }
  faltanAntes = faltan
  if (depurar && vuelta > 1) {
    for (const [nombre, e] of [...residuo].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
      console.log(`    falta aún: ${nombre} ${e.n} puntos, hasta ${(e.mayor * 1000).toFixed(1)} mm en ${e.donde.map((v) => v.toFixed(3))}`)
    }
  }
  const extra = relajarEmpuje(necesita, vecinos)
  let movidos = 0
  let mayor = 0
  for (let v = 0; v < piel.vertices; v++) {
    if (canon[v] !== v) continue
    subida[v] = Math.min(TOPE, subida[v] + extra[v])
    if (extra[v] > 1e-4) movidos++
    mayor = Math.max(mayor, extra[v])
  }
  for (let v = 0; v < piel.vertices; v++) {
    const c = canon[v]
    if (!enLaExterior[c]) continue
    for (let k = 0; k < 3; k++) posicion[v * 3 + k] = posOriginal[v * 3 + k] + normales[c * 3 + k] * subida[c]
  }
  console.log(
    `Pasada ${vuelta}: ${faltan} puntos sin holgura · ${movidos} vértices suben, hasta ${(mayor * 1000).toFixed(1)} mm esta pasada`,
  )
}

// La cáscara interior acompaña a la exterior: cada vértice toma el desplazamiento
// de su vértice exterior más cercano, que está a unos 3 mm.
if (interior.length > 0) {
  const enInterior = new Uint8Array(piel.vertices)
  for (const i of interior) enInterior[i] = 1
  const exteriores = []
  for (let v = 0; v < piel.vertices; v++) if (canon[v] === v && enLaExterior[v]) exteriores.push(v)
  const celda = 0.03
  const clave = (i, j, l) => (i + 512) * 1048576 + (j + 512) * 1024 + (l + 512)
  const rej = new Map()
  for (const v of exteriores) {
    const k = clave(Math.floor(posOriginal[v * 3] / celda), Math.floor(posOriginal[v * 3 + 1] / celda), Math.floor(posOriginal[v * 3 + 2] / celda))
    ;(rej.get(k) ?? rej.set(k, []).get(k)).push(v)
  }
  let movidosAdentro = 0
  for (let v = 0; v < piel.vertices; v++) {
    if (!enInterior[v]) continue
    const ci = Math.floor(posOriginal[v * 3] / celda), cj = Math.floor(posOriginal[v * 3 + 1] / celda), cl = Math.floor(posOriginal[v * 3 + 2] / celda)
    let mejor = -1
    let md = Infinity
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let l = -1; l <= 1; l++)
          for (const w of rej.get(clave(ci + i, cj + j, cl + l)) ?? []) {
            const d = (posOriginal[w * 3] - posOriginal[v * 3]) ** 2 + (posOriginal[w * 3 + 1] - posOriginal[v * 3 + 1]) ** 2 + (posOriginal[w * 3 + 2] - posOriginal[v * 3 + 2]) ** 2
            if (d < md) {
              md = d
              mejor = w
            }
          }
    if (mejor < 0 || subida[mejor] < 1e-5) continue
    for (let k = 0; k < 3; k++) posicion[v * 3 + k] = posOriginal[v * 3 + k] + normales[mejor * 3 + k] * subida[mejor]
    movidosAdentro++
  }
  console.log(`Cáscara interior: ${movidosAdentro} vértices acompañan`)
}

// --- Lo que se mueve, contado ---
let tocados = 0
let maximo = 0
const porCausa = new Map()
for (let v = 0; v < piel.vertices; v++) {
  if (canon[v] !== v || subida[v] < 1e-4) continue
  tocados++
  maximo = Math.max(maximo, subida[v])
  const c = causa[v] ?? '(vecinos)'
  const e = porCausa.get(c) ?? { n: 0, mayor: 0 }
  e.n++
  e.mayor = Math.max(e.mayor, subida[v])
  porCausa.set(c, e)
}
console.log(`\nVértices de la piel que suben: ${tocados} de ${enLaExterior.reduce((a, b) => a + b, 0)} · el máximo, ${(maximo * 1000).toFixed(1)} mm`)
const escalones = [0.1, 1, 3, 6, 10].map((mm) => [mm, 0])
for (let v = 0; v < piel.vertices; v++) {
  if (canon[v] !== v) continue
  for (const e of escalones) if (subida[v] * 1000 >= e[0]) e[1]++
}
console.log('Vértices que suben al menos: ' + escalones.map(([mm, n]) => `${mm} mm → ${n}`).join(' · '))
console.log('Quién manda más (vértices · máximo):')
for (const [nombre, e] of [...porCausa].sort((a, b) => b[1].n - a[1].n).slice(0, 14)) {
  console.log(`  ${nombre.padEnd(40)} ${String(e.n).padStart(5)} · ${(e.mayor * 1000).toFixed(1)} mm`)
}

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}
if (tocados === 0) {
  console.log('\nLa piel ya cubre todo con esa holgura. No hay nada que escribir.')
  process.exit(0)
}

// --- Normales: se rehacen solo si las guardadas son las que saldrían de la malla ---
// Si lo fueran, rehacerlas deja el sombreado coherente con la forma nueva; si no
// lo fueran (alguien las suavizó a mano), no se pisan.
const todos = idx
const normalesViejas = normalesDeVertice(posOriginal, todos, canon, piel.vertices)
let coseno = 0
for (let v = 0; v < piel.vertices; v++) {
  coseno += (norOriginal[v * 3] * normalesViejas[canon[v] * 3] + norOriginal[v * 3 + 1] * normalesViejas[canon[v] * 3 + 1] + norOriginal[v * 3 + 2] * normalesViejas[canon[v] * 3 + 2]) / 32767
}
coseno /= piel.vertices
const coinciden = coseno > 0.97
console.log(`\nNormales guardadas contra las de la malla: coseno medio ${coseno.toFixed(3)} → ${coinciden ? 'se rehacen' : 'se dejan'}`)

const salida = Buffer.from(bufer)
const vistaPos = new Float32Array(salida.buffer, salida.byteOffset + piel.pos, piel.vertices * 3)
vistaPos.set(posicion)
if (coinciden) {
  const nuevas = normalesDeVertice(posicion, todos, canon, piel.vertices)
  const vistaNor = new Int16Array(salida.buffer, salida.byteOffset + piel.nor, piel.vertices * 3)
  for (let v = 0; v < piel.vertices; v++) {
    for (let k = 0; k < 3; k++) vistaNor[v * 3 + k] = Math.round(nuevas[canon[v] * 3 + k] * 32767)
  }
}

// La caja de la pieza, para el marco de selección y el encuadre.
const minimo = [Infinity, Infinity, Infinity]
const maximoCaja = [-Infinity, -Infinity, -Infinity]
for (let v = 0; v < piel.vertices; v++) {
  for (let k = 0; k < 3; k++) {
    minimo[k] = Math.min(minimo[k], posicion[v * 3 + k])
    maximoCaja[k] = Math.max(maximoCaja[k], posicion[v * 3 + k])
  }
}

const comprimido = gzipSync(salida, { level: 9 })
const archivo = catalogo.paquetes[piel.paquete].archivo
writeFileSync(join(DESTINO, archivo), comprimido)
const paquetesNuevos = catalogo.paquetes.map((p, i) =>
  i === piel.paquete ? { ...p, bytesComprimido: comprimido.byteLength } : p,
)
const piezas = catalogo.piezas.map((p) =>
  p.id === piel.id ? { ...p, caja: [minimo, maximoCaja], ajustada: `holgura ${HOLGURA * 1000} mm, D-159` } : p,
)

// La misma cuenta de versión que `devolver-piel.mjs`: cambia la URL de los
// paquetes, servidos «immutable» un año, y ningún navegador mezcla la piel
// vieja en su caché con el catálogo nuevo.
const nuevo = {
  ...catalogo,
  version: `bp3d-4.0-${createHash('sha1').update(JSON.stringify({ piezas, paquetes: paquetesNuevos })).digest('hex').slice(0, 8)}`,
  paquetes: paquetesNuevos,
  piezas,
}
writeFileSync(join(DESTINO, 'catalogo.json'), JSON.stringify(nuevo), 'utf8')
writeFileSync(join(DESTINO, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')
console.log(`\nEscrito ${archivo}. Versión ${nuevo.version}`)
