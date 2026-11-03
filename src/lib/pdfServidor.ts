import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { destinoDePeticion, leerCookies, origenInterno } from './pdf'
import { PREFIJO } from './rutas'

/**
 * El PDF de una ficha, impreso por un Chromium sin ventana (D-244).
 *
 * Imprime la misma página que ve la persona, con su sesión y con la hoja
 * `@media print` de `estilos.css`: el membrete, el pie con las firmas y la A4
 * salen de ahí y de ningún otro sitio. Rehacer el diseño con una biblioteca de
 * PDF habría dejado dos versiones del mismo papel, y la que no se mirara se
 * quedaría vieja; la de `html2canvas` sale como una foto, sin texto que se
 * pueda copiar ni buscar.
 */

/** No hay navegador con el que imprimir: la imagen se construyó sin él o falta la variable. */
export class SinNavegador extends Error {}
/** Hay demasiados PDF preparándose a la vez. */
export class Ocupado extends Error {}
/** La página no mostró la ficha: no existe, no se puede ver o está en mantención. */
export class FichaNoDisponible extends Error {}

/**
 * Dónde buscar el navegador, en orden.
 *
 * `NAVEGADOR_PDF` primero, para quien lo tenga en otro sitio. Después el
 * Chromium que instala el `Dockerfile` (Alpine lo deja con los dos nombres
 * según la versión) y, en Windows, el Chrome o el Edge del equipo, que es lo
 * que hay en el portátil y en el servidor de `docs/SERVIDOR-WINDOWS.md`. No se
 * descarga ninguno: `puppeteer-core` no trae navegador, y bajar uno al vuelo en
 * el servidor sería meter un binario que nadie revisó.
 */
const CANDIDATOS = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function buscarNavegador(): string {
  const elegido = process.env.NAVEGADOR_PDF?.trim()
  if (elegido) {
    // Puesta y equivocada es un error de configuración, y se dice con su
    // nombre: seguir buscando por otro lado escondería la errata.
    if (!existsSync(elegido)) throw new SinNavegador(`NAVEGADOR_PDF apunta a ${elegido}, que no existe.`)
    return elegido
  }
  const hallado = CANDIDATOS.find((camino) => existsSync(camino))
  if (!hallado) throw new SinNavegador('No hay Chromium, Chrome ni Edge instalado, y NAVEGADOR_PDF no está puesta.')
  return hallado
}

/**
 * Dos a la vez y seis en cola.
 *
 * Cada impresión abre un navegador entero, unos 150 MB mientras dura, y el
 * servidor de ved lo comparte con otras páginas. Con más de dos a la vez, una
 * clase entera pulsando «Guardar PDF» al mismo tiempo podría dejar a la
 * plataforma sin memoria; más allá de la cola se contesta «ocupado» en vez de
 * apilar peticiones que el navegador de la persona ya habrá abandonado.
 *
 * El turno pasa de mano en mano: quien termina se lo da al primero de la cola
 * sin soltarlo, para que una petición nueva no se cuele entre medias y deje
 * tres navegadores abiertos.
 */
const A_LA_VEZ = 2
const EN_COLA = 6
let enCurso = 0
const cola: (() => void)[] = []

async function pedirTurno(): Promise<() => void> {
  if (enCurso < A_LA_VEZ) enCurso++
  else {
    if (cola.length >= EN_COLA) throw new Ocupado('Hay demasiados PDF preparándose.')
    await new Promise<void>((despertar) => cola.push(despertar))
  }
  return () => {
    const siguiente = cola.shift()
    if (siguiente) siguiente()
    else enCurso--
  }
}

/** Una imagen de más de esto no es una figura de ficha, y no se carga en memoria para el PDF. */
const IMAGEN_MAXIMA_BYTES = 25 * 1024 * 1024

/**
 * Imprime `camino` (sin el prefijo, p. ej. `/biblioteca/12`) con las cookies
 * de quien lo pide y devuelve el PDF con el título de la ficha.
 *
 * `origenPublico` es el `serverURL` de Payload, el origen con el que escribe la
 * dirección de los archivos subidos (ver `destinoDePeticion`).
 */
export async function imprimirFicha(
  camino: string,
  cabeceraDeCookies: string | null,
  origenPublico: string | null,
): Promise<{ bytes: Uint8Array; titulo: string | null }> {
  const ejecutable = buscarNavegador()
  const soltar = await pedirTurno()
  // Un navegador por PDF y no uno compartido: se cierra al terminar y no deja
  // memoria tomada entre una impresión y otra, que es lo normal en una
  // plataforma donde se guardan unos pocos PDF al día.
  const navegador = await puppeteer
    .launch({
      executablePath: ejecutable,
      headless: true,
      args: [
        // Dentro de Docker no hay espacios de nombres de usuario para la caja
        // de arena de Chromium, y sin esto no arranca. La página solo puede
        // pedir a la propia plataforma (`destinoDePeticion`), así que no queda
        // nada de fuera que contener.
        ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        // El `/dev/shm` de un contenedor trae 64 MB, y una ficha larga con
        // imágenes los pasa: Chromium se cae a media impresión.
        '--disable-dev-shm-usage',
        // Sin el ajuste fino de la fuente, el espaciado del PDF es el del
        // diseño y no el que le quede mejor a la pantalla del servidor.
        '--font-render-hinting=none',
      ],
    })
    .catch((fallo) => {
      soltar()
      throw fallo
    })

  try {
    const origen = origenInterno(process.env.PORT)
    const cookies = leerCookies(cabeceraDeCookies)
    if (cookies.length) {
      const { hostname } = new URL(origen)
      await navegador.setCookie(...cookies.map((c) => ({ ...c, domain: hostname, path: '/' })))
    }

    const pagina = await navegador.newPage()
    await pagina.setRequestInterception(true)
    pagina.on('request', (peticion) => {
      if (peticion.isInterceptResolutionHandled()) return
      const destino = destinoDePeticion(
        { direccion: peticion.url(), metodo: peticion.method(), tipo: peticion.resourceType() },
        { interno: origen, publico: origenPublico },
        PREFIJO,
      )
      if (destino === 'seguir') void peticion.continue()
      else if (destino === 'cortar') void peticion.abort()
      else {
        // El mismo camino, pedido al origen interno con la cookie de quien
        // imprime. `Sec-Fetch-Site` porque Payload descarta la cookie de una
        // petición que no la trae (`extractJWT`): a un cliente que no es un
        // navegador no le cree la sesión.
        const { pathname, search } = new URL(peticion.url())
        void fetch(`${origen}${pathname}${search}`, {
          headers: { cookie: cabeceraDeCookies ?? '', 'sec-fetch-site': 'same-origin' },
        })
          .then(async (r) => {
            if (Number(r.headers.get('content-length') ?? 0) > IMAGEN_MAXIMA_BYTES) return peticion.abort()
            return peticion.respond({
              status: r.status,
              contentType: r.headers.get('content-type') ?? undefined,
              body: Buffer.from(await r.arrayBuffer()),
            })
          })
          .catch(() => peticion.abort().catch(() => undefined))
      }
    })
    // Antes de cargar y no al final: las secciones que solo se ven en papel
    // (las pestañas ocultas, los pasos de la técnica) tienen que estar a la
    // vista cuando se esperan sus imágenes.
    await pagina.emulateMediaType('print')

    // `load` y no «sin red»: el latido y el aviso de cambios están cortados,
    // pero cualquier otra conexión abierta dejaría «sin red» esperando hasta el
    // límite. Lo que de verdad hace falta esperar se espera abajo, a mano.
    const respuesta = await pagina.goto(`${origen}${PREFIJO}${camino}`, { waitUntil: 'load', timeout: 30_000 })
    // El membrete solo se pinta cuando se pinta la ficha. Sin él, lo que hay es
    // una pantalla de «sin acceso» o de mantención, y eso no se imprime.
    if (!respuesta?.ok() || !(await pagina.$('.membrete-impreso'))) throw new FichaNoDisponible()

    await pagina.evaluate(async () => {
      // Las imágenes diferidas no se piden hasta que se acercan a la vista, y
      // en un navegador sin ventana nadie baja por la página: saldrían en
      // blanco. Diez segundos como mucho, para que una imagen rota no deje la
      // impresión colgada.
      const imagenes = Array.from(document.images)
      for (const imagen of imagenes) imagen.loading = 'eager'
      await Promise.race([
        Promise.all(
          imagenes
            .filter((imagen) => !imagen.complete)
            .map(
              (imagen) =>
                new Promise((listo) => {
                  imagen.addEventListener('load', listo, { once: true })
                  imagen.addEventListener('error', listo, { once: true })
                }),
            ),
        ),
        new Promise((listo) => setTimeout(listo, 10_000)),
      ])
      await document.fonts.ready
    })

    const titulo = await pagina.$eval('h1', (h1) => h1.textContent?.trim() || null).catch(() => null)
    // `preferCSSPageSize`: la hoja la decide el `@page { size: A4 }` de la
    // hoja de estilos, no el papel por omisión de la máquina.
    const bytes = await pagina.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 30_000 })
    return { bytes, titulo }
  } finally {
    await navegador.close().catch(() => undefined)
    soltar()
  }
}
