/**
 * El arranque de la aplicación en el contenedor: varios procesos de Next que
 * comparten el puerto (D-393).
 *
 * La prueba de carga de D-392 mostró que un solo proceso de Node satura poco
 * más de uno de los seis núcleos de Contabo: Next pinta cada página en un solo
 * hilo, y con 150 personas a la vez la espera se disparaba mientras cinco
 * núcleos no hacían nada. Este guion es el proceso principal: no atiende
 * ninguna petición, solo lanza los procesos de la aplicación con `node:cluster`
 * —que reparte las conexiones entre ellos por turnos— y relanza al que se cae.
 *
 * ## El primero, solo
 *
 * Cada proceso, al recibir su primera petición, levanta Payload, y Payload en
 * producción aplica las migraciones pendientes (`prodMigrations`). Payload no
 * las protege con ningún candado: cuatro procesos a la vez aplicarían la misma
 * migración cuatro veces. Así que el primero arranca solo, se le pide la salud
 * —que levanta Payload y con él las migraciones— y los demás salen cuando
 * contesta bien. Es también lo que espera el `HEALTHCHECK` de la imagen.
 *
 * ## Lo que comparten
 *
 * Nada en memoria. Lo que vivía en la de un solo proceso pasó a la base en la
 * misma decisión: el freno de intentos, la presencia del editor, las
 * publicaciones, la difusión en curso y la fila de latidos de revisión. La
 * pasada diaria de conservación la programa solo el proceso 1
 * (`TRAUMAHUB_PROCESO`), y el instante del arranque lo da este guion a todos
 * (`TRAUMAHUB_ARRANQUE`), para que una pestaña que cae en otro proceso no crea
 * que el servidor se reinició.
 *
 * ## Cuántos
 *
 * `PROCESOS` en el entorno, o, sin ella, los núcleos menos dos y como mucho
 * cuatro: Contabo tiene 6 y le quedan dos para PostgreSQL y para el Chromium de
 * los PDF. Cada proceso abre su propio pool de 10 conexiones a la base, y
 * PostgreSQL acepta 100 por omisión. Con `PROCESOS=1` todo funciona como antes
 * de D-393, con un proceso principal de más.
 */
import cluster from 'node:cluster'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Los procesos que se lanzan si nadie dice cuántos. */
export const MAXIMO_POR_OMISION = 4

/** Un techo para lo que se escriba a mano: un cero de más no debe abrir cuarenta pools. */
export const MAXIMO_PERMITIDO = 16

/** Cuántos procesos: lo pedido en `PROCESOS`, o lo que dan los núcleos. */
export function cuantosProcesos(pedido, nucleos) {
  const numero = Number(String(pedido ?? '').trim())
  if (String(pedido ?? '').trim() !== '' && Number.isInteger(numero) && numero >= 1) {
    return Math.min(numero, MAXIMO_PERMITIDO)
  }
  return Math.max(1, Math.min(MAXIMO_POR_OMISION, nucleos - 2))
}

/**
 * Cuánto se espera para relanzar un proceso caído. Uno que se cae de vez en
 * cuando vuelve al segundo; uno que se cae en bucle —la base apagada, un error
 * al arrancar— espera medio minuto entre intentos, para no llenar el registro
 * de arranques que mueren al instante.
 */
export function esperaParaRelanzar(caidasRecientes) {
  return caidasRecientes >= 5 ? 30_000 : 1_000
}

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms))

async function esperarLaSalud(url) {
  const inicio = Date.now()
  let ultimoAviso = inicio
  for (;;) {
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (respuesta.ok) return
    } catch {
      // Todavía no escucha, o la base no contesta: se vuelve a preguntar.
    }
    if (Date.now() - ultimoAviso >= 60_000) {
      ultimoAviso = Date.now()
      console.log(`[arranque] el proceso 1 todavía no está sano tras ${Math.round((ultimoAviso - inicio) / 1000)} s`)
    }
    await dormir(2_000)
  }
}

async function principal() {
  const total = cuantosProcesos(process.env.PROCESOS, availableParallelism())
  const arranque = Date.now()
  const servidor = join(dirname(fileURLToPath(import.meta.url)), 'server.js')
  const salud = `http://127.0.0.1:${process.env.PORT || 3000}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/salud`

  cluster.schedulingPolicy = cluster.SCHED_RR
  cluster.setupPrimary({ exec: servidor })

  let cerrando = false
  /** Las caídas de cada número en el último minuto. */
  const caidas = new Map()

  const lanzar = (numero) => {
    const proceso = cluster.fork({ TRAUMAHUB_PROCESO: String(numero), TRAUMAHUB_ARRANQUE: String(arranque) })
    proceso.on('exit', (codigo, senal) => {
      if (cerrando) return
      const ahora = Date.now()
      const recientes = (caidas.get(numero) ?? []).filter((t) => ahora - t < 60_000)
      recientes.push(ahora)
      caidas.set(numero, recientes)
      const espera = esperaParaRelanzar(recientes.length)
      console.error(`[arranque] el proceso ${numero} terminó (${senal ?? `código ${codigo}`}); se relanza en ${espera / 1000} s`)
      setTimeout(() => {
        if (!cerrando) lanzar(numero)
      }, espera)
    })
  }

  const cerrar = (senal) => {
    if (cerrando) return
    cerrando = true
    console.log(`[arranque] ${senal}: se cierran los procesos`)
    for (const proceso of Object.values(cluster.workers ?? {})) proceso?.process.kill(senal)
    // `docker stop` espera diez segundos antes de matar: los que no hayan
    // terminado a los ocho se matan aquí, para salir limpio antes que eso.
    const plazo = setTimeout(() => {
      for (const proceso of Object.values(cluster.workers ?? {})) proceso?.process.kill('SIGKILL')
      process.exit(0)
    }, 8_000)
    plazo.unref()
    const mirar = setInterval(() => {
      if (Object.keys(cluster.workers ?? {}).length === 0) {
        clearInterval(mirar)
        process.exit(0)
      }
    }, 100)
  }
  process.on('SIGTERM', () => cerrar('SIGTERM'))
  process.on('SIGINT', () => cerrar('SIGINT'))

  console.log(`[arranque] ${total} proceso(s) de la aplicación; el 1 primero, para las migraciones`)
  lanzar(1)
  if (total === 1) return
  await esperarLaSalud(salud)
  if (cerrando) return
  for (let numero = 2; numero <= total; numero++) lanzar(numero)
  console.log(`[arranque] los ${total} procesos están lanzados`)
}

// Solo cuando se ejecuta, no cuando lo importa una prueba.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal()
}
