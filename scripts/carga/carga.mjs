// Prueba de carga de TraumaHub (P-016 E4, D-376): de 50 a 300 personas a la vez.
//
// Corre dentro de Contabo, en un contenedor con la red del de la aplicación
// (`--network container:traumahub-app`), y le pide directo a Next en el 3000:
// por Cloudflare, 300 conexiones desde una sola IP parecerían un ataque, y lo que
// se quiere medir es el servidor.
//
// La cuenta de prueba la escribió el dueño en /carga/cuenta (correo y clave, una
// por línea). Se entra una sola vez y todas las personas simuladas comparten esa
// sesión: con una sesión por cuenta (D-388), entrar 300 veces se echaría a sí
// misma. Ni el correo ni la clave ni la sesión se imprimen.
//
// Se corta sola si la salud falla tres veces seguidas o si más de un cuarto de las
// peticiones de los últimos 20 s fallan.
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000'
const ETAPAS = (process.env.ETAPAS ?? '50:120,150:120,300:180').split(',').map((e) => {
  const [personas, segundos] = e.split(':').map(Number)
  return { personas, segundos }
})
const PAUSA_MIN = 1000
const PAUSA_MAX = 4000
const LIMITE_PETICION = 30_000

const ahora = () => performance.now()
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)]
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ la sesión
// La abre `abrir-sesion.ts` con la API local de Payload: los `POST` de la API
// por HTTP contestan 403 a propósito, entrar incluido.
const token = readFileSync('/carga/sesion', 'utf8').trim()
// `cookiePrefix: 'traumahub'` en payload.config.ts. Y `Sec-Fetch-Site`, porque
// Payload no le cree la cookie a una petición que no lo trae (`pdfServidor.ts`).
const CON_SESION = { cookie: `traumahub-token=${token}`, 'sec-fetch-site': 'same-origin' }
// La API por HTTP solo sirve archivos (`(payload)/api/[...slug]/route.ts`): lo
// que hay para pedir lo buscó `abrir-sesion.ts` con la API local.
const { fichas, casos, modelos } = JSON.parse(readFileSync('/carga/objetivos.json', 'utf8'))

// ------------------------------------------------------- qué hay para pedir
const portada = await (await fetch(`${BASE}/`)).text()
const estaticos = [...new Set([...portada.matchAll(/\/_next\/static\/[^"'\s)]+\.(?:js|css)/g)].map((m) => m[0]))].slice(0, 12)
// Con la sesión, la biblioteca tiene que salir: sin ella, `/biblioteca` manda a
// «Entrar», y con el aviso por aceptar pinta el aviso en lugar de la página.
const prueba = await fetch(`${BASE}/biblioteca`, { headers: CON_SESION, redirect: 'manual' })
const biblioteca = await prueba.text()
if (prueba.status !== 200) {
  console.log(`Con la sesión, /biblioteca contesta ${prueba.status}: la sesión no vale. Se para.`)
  process.exit(2)
}
if (biblioteca.includes('aviso-por-aceptar')) {
  console.log('La cuenta de prueba todavía no aceptó el aviso de privacidad: la prueba mediría esa pantalla. Se para.')
  process.exit(2)
}
console.log(`Para pedir: ${fichas.length} fichas, ${casos.length} casos, ${modelos.length} modelos, ${estaticos.length} archivos estáticos.`)

// Quien llega sin cuenta y quien estudia con la suya. Los pesos dicen cuántas
// veces sale cada página frente a las demás.
const VISITANTE = [
  [4, 'portada', () => '/'],
  [1, 'planes', () => '/planes'],
  [1, 'entrar', () => '/entrar'],
  [1, 'creditos', () => '/creditos'],
  [4, 'estatico', () => azar(estaticos)],
]
const RESIDENTE = [
  [2, 'inicio', () => '/'],
  [3, 'biblioteca', () => '/biblioteca'],
  ...(fichas.length ? [[6, 'ficha', () => `/biblioteca/${azar(fichas)}`]] : []),
  [2, 'simulador', () => '/simulador'],
  ...(casos.length ? [[3, 'caso', () => `/simulador/${azar(casos)}`]] : []),
  // El navegador guarda el modelo; se baja mucho menos que la página del caso.
  ...(modelos.length ? [[1, 'modelo', () => azar(modelos)]] : []),
  [1, 'imagenes', () => '/imagenes'],
  [1, 'tecnica-ao', () => '/tecnica-ao'],
  [3, 'estatico', () => azar(estaticos)],
]
function elegir(menu) {
  const total = menu.reduce((s, [p]) => s + p, 0)
  let x = Math.random() * total
  for (const [p, nombre, camino] of menu) if ((x -= p) < 0) return [nombre, camino()]
  return [menu[0][1], menu[0][2]()]
}

// ------------------------------------------------------------- la medición
const medidas = [] // { etapa, ruta, ms, ok, estado, t }
let etapaActual = 'calentar'
let parar = false
let motivo = null

async function pedir(ruta, camino, conSesion) {
  const t0 = ahora()
  let estado = 0
  try {
    const r = await fetch(`${BASE}${camino}`, {
      headers: conSesion ? CON_SESION : { 'sec-fetch-site': 'none' },
      signal: AbortSignal.timeout(LIMITE_PETICION),
      redirect: 'manual',
    })
    estado = r.status
    // Leerla entera, como un navegador; sin guardarla.
    if (r.body) for await (const _ of r.body) void _
  } catch {
    estado = -1
  }
  const ms = ahora() - t0
  medidas.push({ etapa: etapaActual, ruta, ms, ok: estado >= 200 && estado < 400, estado, t: ahora() })
}

async function persona(fin, residente) {
  await dormir(Math.random() * PAUSA_MAX)
  while (!parar && ahora() < fin()) {
    const [ruta, camino] = elegir(residente ? RESIDENTE : VISITANTE)
    await pedir(ruta, camino, residente)
    await dormir(PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN))
  }
}

// El vigilante: la salud cada 5 s y la tasa de errores de los últimos 20 s.
const salud = []
let fallosSeguidos = 0
const vigilante = setInterval(async () => {
  const t0 = ahora()
  let ok = false
  try {
    const r = await fetch(`${BASE}/api/salud`, { signal: AbortSignal.timeout(5000) })
    ok = r.ok
  } catch {}
  salud.push({ etapa: etapaActual, ms: Math.round(ahora() - t0), ok })
  fallosSeguidos = ok ? 0 : fallosSeguidos + 1
  if (fallosSeguidos >= 3 && !parar) {
    parar = true
    motivo = 'la salud falló tres veces seguidas'
  }
  const recientes = medidas.filter((m) => m.t > ahora() - 20_000)
  if (recientes.length >= 40 && recientes.filter((m) => !m.ok).length / recientes.length > 0.25 && !parar) {
    parar = true
    motivo = 'más de un cuarto de las peticiones de los últimos 20 s fallaron'
  }
}, 5000)

// El PDF de una ficha: uno en reposo y otro en lo más alto de la carga.
const pdfs = []
async function medirPdf(cuando) {
  if (!fichas.length) return
  const t0 = ahora()
  let estado = -1
  let bytes = 0
  try {
    const r = await fetch(`${BASE}/api/pdf/biblioteca/${fichas[0]}`, { headers: CON_SESION, signal: AbortSignal.timeout(90_000) })
    estado = r.status
    bytes = (await r.arrayBuffer()).byteLength
  } catch {}
  pdfs.push({ cuando, estado, bytes, s: +((ahora() - t0) / 1000).toFixed(1) })
}

await medirPdf('en reposo')

// Las personas no se van entre etapas: a cada etapa se suman las que faltan, y
// todas siguen hasta el final de la prueba.
const finDeLaPrueba = { t: Infinity }
const enMarcha = []
let presentes = 0
for (const [n, etapa] of ETAPAS.entries()) {
  if (parar) break
  etapaActual = `${etapa.personas} personas`
  const nuevas = etapa.personas - presentes
  for (let i = 0; i < nuevas; i++) enMarcha.push(persona(() => finDeLaPrueba.t, Math.random() < 0.7))
  presentes = etapa.personas
  console.log(`Etapa ${n + 1}: ${etapa.personas} personas durante ${etapa.segundos} s.`)
  const finEtapa = ahora() + etapa.segundos * 1000
  if (n === ETAPAS.length - 1) setTimeout(() => void medirPdf(`con ${etapa.personas} personas`), (etapa.segundos * 1000) / 2)
  while (!parar && ahora() < finEtapa) await dormir(1000)
}
finDeLaPrueba.t = 0
await Promise.all(enMarcha)
clearInterval(vigilante)

// ------------------------------------------------------------------ el informe
const percentil = (xs, p) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  return Math.round(o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))])
}
const informe = { motivoDelCorte: motivo, etapas: [], pdfs, salud: {} }
for (const etapa of [...new Set(medidas.map((m) => m.etapa))]) {
  const de = medidas.filter((m) => m.etapa === etapa)
  const duracion = (Math.max(...de.map((m) => m.t)) - Math.min(...de.map((m) => m.t))) / 1000 || 1
  const rutas = {}
  for (const ruta of [...new Set(de.map((m) => m.ruta))].sort()) {
    const r = de.filter((m) => m.ruta === ruta)
    const ms = r.map((m) => m.ms)
    const errores = r.filter((m) => !m.ok)
    rutas[ruta] = {
      n: r.length,
      errores: errores.length,
      estados: [...new Set(errores.map((m) => m.estado))],
      p50: percentil(ms, 50),
      p95: percentil(ms, 95),
      p99: percentil(ms, 99),
      max: Math.round(Math.max(...ms)),
    }
  }
  const ms = de.map((m) => m.ms)
  informe.etapas.push({
    etapa,
    peticiones: de.length,
    porSegundo: +(de.length / duracion).toFixed(1),
    errores: de.filter((m) => !m.ok).length,
    p50: percentil(ms, 50),
    p95: percentil(ms, 95),
    p99: percentil(ms, 99),
    rutas,
  })
  const s = salud.filter((x) => x.etapa === etapa)
  informe.salud[etapa] = { pruebas: s.length, fallos: s.filter((x) => !x.ok).length, maxMs: Math.max(0, ...s.map((x) => x.ms)) }
}
writeFileSync('/carga/informe.json', JSON.stringify(informe, null, 1))
console.log(motivo ? `CORTADA: ${motivo}.` : 'Terminada sin cortes.')
for (const e of informe.etapas) {
  console.log(`\n${e.etapa}: ${e.peticiones} peticiones (${e.porSegundo}/s), ${e.errores} errores, p50 ${e.p50} ms, p95 ${e.p95} ms, p99 ${e.p99} ms`)
  for (const [ruta, r] of Object.entries(e.rutas)) {
    console.log(`  ${ruta.padEnd(11)} n ${String(r.n).padStart(5)}  err ${String(r.errores).padStart(4)}${r.estados.length ? ' ' + JSON.stringify(r.estados) : ''}  p50 ${r.p50}  p95 ${r.p95}  p99 ${r.p99}  max ${r.max}`)
  }
}
console.log('\nPDF:', JSON.stringify(pdfs))
console.log('Salud:', JSON.stringify(informe.salud))
process.exit(0)
