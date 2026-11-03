/**
 * Lo que decide el PDF de una ficha antes de abrir ningún navegador (D-244).
 *
 * «Guardar PDF» era la impresión del navegador, y el dueño pidió que no lo
 * fuera: cada navegador encaja la hoja a su manera —en el teléfono y en algunos
 * diálogos la A4 salía encogida, como una hoja más chica dentro de otra— y el
 * resultado dependía de lo que la persona marcara en el diálogo. Ahora el PDF lo
 * imprime el servidor con un Chromium sin ventana (`pdfServidor.ts`) sobre la
 * misma página y con la misma hoja `@media print`, así que el diseño sigue
 * viviendo en un solo sitio y sale igual para todos.
 *
 * Aquí está la parte que no necesita el navegador, para poder probarla sin él:
 * qué páginas tienen PDF, cómo se llama el archivo y qué peticiones puede hacer
 * la página mientras se imprime.
 */

/**
 * Las páginas que tienen «Guardar PDF», por el nombre de su carpeta.
 *
 * Es una lista cerrada y no un camino que llegue en la petición: el servidor
 * abre con la sesión de quien pide una dirección que arma él, y aceptar
 * cualquier ruta sería prestarle un navegador con esa sesión para que mire lo
 * que quiera.
 */
export const PAGINAS_CON_PDF = ['biblioteca', 'imagenes', 'tecnica-ao'] as const
export type PaginaConPdf = (typeof PAGINAS_CON_PDF)[number]

export const esPaginaConPdf = (valor: string): valor is PaginaConPdf =>
  (PAGINAS_CON_PDF as readonly string[]).includes(valor)

/** Las claves de PostgreSQL son enteros: lo demás no es una ficha. */
export const esIdDeFicha = (valor: string): boolean => /^[1-9]\d{0,9}$/.test(valor)

/**
 * Desde dónde abre el servidor su propia página.
 *
 * Desde dentro y no por la dirección pública: por fuera la petición daría la
 * vuelta por el proxy y el túnel para volver a la misma máquina, y dependería
 * de que el proxy esté vivo (D-243 lo estuvo una mañana entera). `next dev`,
 * `next start` y el `server.js` de la imagen dejan en `PORT` el puerto donde
 * escuchan, y todos atienden en `127.0.0.1`: la imagen escucha en `0.0.0.0` y
 * el servidor de Windows en `127.0.0.1` a propósito.
 */
export const origenInterno = (puerto: string | undefined): string =>
  `http://127.0.0.1:${/^\d{1,5}$/.test(puerto ?? '') ? puerto : '3000'}`

/**
 * Qué hacer con cada petición de la página mientras se imprime: dejarla seguir,
 * traerla por dentro o cortarla.
 *
 * Solo lecturas, y solo de la propia plataforma:
 * - **Lo que no es `GET` se corta.** Son acciones de servidor, y las que
 *   dispara una ficha al abrirse escriben: la visita (`registrarVisita`), que
 *   movería «Continúa leyendo», y el latido del tiempo activo (D-145), que
 *   sumaría a la cuenta minutos que nadie pasó leyendo. Un PDF no es una
 *   lectura.
 * - **El vídeo y los flujos abiertos se cortan.** El vídeo no sale en papel y
 *   pesa decenas de megas; `/api/cambios`, el aviso de contenido nuevo, queda
 *   abierto mientras dure la página.
 * - **Las imágenes de la dirección pública se traen por dentro.** Payload
 *   escribe la dirección de cada archivo subido con `serverURL`, la pública
 *   (`https://…ts.net/traumahub/api/medios/file/…`). Desde el contenedor esa
 *   dirección da la vuelta por el proxy, si es que se alcanza, y además no
 *   lleva la cookie, que es de `127.0.0.1`. Se pide el mismo camino al origen
 *   interno y se le entrega a la página. La primera versión las cortaba, y la
 *   figura de la ficha salía como un recuadro roto.
 * - **Lo de cualquier otro origen se corta.** Ninguna ficha lo pide, y si un
 *   día lo pidiera, no debería salir con la sesión de nadie.
 */
export type DestinoDePeticion = 'seguir' | 'traer' | 'cortar'

export function destinoDePeticion(
  peticion: { direccion: string; metodo: string; tipo: string },
  origenes: { interno: string; publico: string | null },
  prefijo: string,
): DestinoDePeticion {
  const { direccion, metodo, tipo } = peticion
  if (direccion.startsWith('data:') || direccion.startsWith('blob:')) return 'seguir'
  let url: URL
  try {
    url = new URL(direccion)
  } catch {
    return 'cortar'
  }
  if (metodo.toUpperCase() !== 'GET') return 'cortar'
  if (tipo === 'media' || tipo === 'eventsource' || tipo === 'websocket') return 'cortar'
  if (url.pathname.startsWith(`${prefijo}/api/cambios`)) return 'cortar'
  if (url.origin === origenes.interno) return 'seguir'
  if (origenes.publico && url.origin === origenes.publico && tipo === 'image') return 'traer'
  return 'cortar'
}

/** El origen (`https://host:puerto`) de una dirección, o `null` si no es una. */
export function origenDe(direccion: string | null | undefined): string | null {
  try {
    return direccion ? new URL(direccion).origin : null
  } catch {
    return null
  }
}

/**
 * Las cookies de la petición, para dárselas al navegador que imprime.
 *
 * Todas y no solo la de la sesión: la página que sale en el PDF tiene que ser
 * la que ve quien lo pide, y alguna preferencia de vista también viaja en una
 * cookie. Los valores se pasan tal como llegaron, sin decodificar, porque así
 * los volverá a mandar el navegador.
 */
export function leerCookies(cabecera: string | null | undefined): { name: string; value: string }[] {
  if (!cabecera) return []
  return cabecera
    .split(';')
    .map((trozo) => {
      const igual = trozo.indexOf('=')
      return igual < 0 ? null : { name: trozo.slice(0, igual).trim(), value: trozo.slice(igual + 1).trim() }
    })
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie?.name))
}

/**
 * El nombre del archivo, a partir del título de la ficha.
 *
 * Sin tildes ni signos: el nombre viaja en una cabecera, y un nombre con «ñ»
 * escrito a pelo lo trunca o lo cambia por guiones bajos cada navegador a su
 * manera. Con el título y no con el número, porque una carpeta de descargas
 * llena de `ficha-37.pdf` no se distingue.
 */
export function nombreDelPdf(titulo: string | null | undefined, pagina: PaginaConPdf, id: string): string {
  const base = (titulo ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
  return `traumahub-${base || `${pagina}-${id}`}.pdf`
}
