/**
 * Siembra el listado global de estructuras anatómicas con las piezas del atlas
 * instalado (D-179, P-003 E8).
 *
 *   npx tsx scripts/sembrar-estructuras.ts             # simula: dice qué haría
 *   npx tsx scripts/sembrar-estructuras.ts --aplicar   # lo escribe
 *
 * Crea una ficha vacía por cada pieza de `public/atlas/catalogo.json` que no
 * tenga la suya (2.231 en una base nueva). **No pisa nada**: una ficha que ya
 * existe conserva todo lo escrito, y solo se le refrescan los datos que vienen
 * del atlas (sistema, región, lado). Una ficha cuya pieza ya no está en el atlas
 * no se borra: queda marcada «sin pieza» para casarla a mano. Se puede ejecutar
 * las veces que haga falta, y dos veces seguidas la segunda no cambia nada.
 *
 * Lo mismo hace el botón «Cargar las piezas del atlas» de
 * `/admin-panel/estructuras`, que es lo que se usa en el servidor tras
 * desplegar la etapa: ahí no hay que entrar a una terminal. Este guion es para
 * quien prefiere verlo correr, o para una base nueva sin panel todavía.
 *
 * **Por omisión simula.** Y simular no es un `if` delante de cada escritura: la
 * simulación cuenta lo que haría con las mismas reglas, sin abrir ninguna
 * escritura, leyendo la base tal como está.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// tsx no carga el .env, y todo lo que necesita sus variables se importa dentro
// de `principal()` (ver `scripts/cargar-modelos.ts`).
const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

async function principal() {
  const aplicar = process.argv.slice(2).includes('--aplicar')

  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const { leerCatalogo } = await import('../src/lib/exportarPreparacion')
  const { sincronizarConElAtlas, resumenDeLaSiembra, leerTodasLasEstructuras } = await import(
    '../src/lib/estructurasServidor'
  )

  const payload = await getPayload({ config })
  const catalogo = await leerCatalogo()

  if (!aplicar) {
    const filas = await leerTodasLasEstructuras(payload, { atlasId: true })
    const conFicha = new Set(filas.map((f) => f.atlasId))
    const idsDelAtlas = new Set(catalogo.piezas.map((p) => p.id))
    const porCrear = catalogo.piezas.filter((p) => !conFicha.has(p.id)).length
    const sinPieza = filas.filter((f) => !idsDelAtlas.has(f.atlasId)).length
    console.log(
      `Atlas ${catalogo.version}: ${catalogo.piezas.length} piezas. Hoy hay ${filas.length} fichas.\n` +
        `  se crearían ${porCrear} fichas vacías\n` +
        `  ${sinPieza} fichas no tienen pieza en el atlas (se marcarían, no se borrarían)\n` +
        'Es una simulación. Con --aplicar se escribe.',
    )
    process.exit(0)
  }

  const resultado = await sincronizarConElAtlas(payload, catalogo, { origen: 'siembra de estructuras' })
  console.log(`Listo: ${resumenDeLaSiembra(resultado)}.`)
  process.exit(0)
}

principal().catch((error) => {
  console.error(error)
  process.exit(1)
})
