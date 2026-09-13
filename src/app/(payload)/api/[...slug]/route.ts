import config from '@payload-config'
import { REST_GET, REST_OPTIONS } from '@payloadcms/next/routes'

/**
 * De la API REST de Payload solo queda lo que el navegador pide de verdad:
 * `/api/<coleccion>/file/<nombre>`.
 *
 * D-038 retiró la interfaz de Payload, pero no su API, y eso dejó una segunda
 * administración de los mismos datos por la que nadie miraba. Dos
 * administraciones sobre los mismos datos pueden mostrar y guardar cosas
 * distintas, que es exactamente la razón de haber quitado una.
 *
 * Qué se cerró y por qué:
 *
 *  - **Las escrituras.** Las colecciones conceden `create`/`update` a cualquier
 *    editor con sesión, así que un `PATCH /api/patologias/<id>` guardaba texto
 *    rico sin pasar por `depurarDocumento` ni por `faltantes()`, que son las dos
 *    comprobaciones del panel. Lo que entraba por aquí no lo revisaba nadie.
 *  - **Los listados.** `GET /api/medios?limit=500` devolvía nombre, tipo y
 *    dirección de todos los archivos a cualquier cuenta activa, borradores
 *    incluidos. Apretar el `access.read` de Medios NO era la salida: las
 *    páginas leen con `overrideAccess: false` y Payload propaga ese valor al
 *    poblar relaciones, de modo que negarle la lectura al residente le dejaría
 *    sin las imágenes de las fichas publicadas. Lo que sobraba era el listado.
 *  - **La autenticación.** `POST /api/usuarios/login` y `/refresh-token`
 *    escriben la cookie con `path: '/'` a fuego —`generatePayloadCookie` no
 *    mira la configuración de la colección— y eso reabre el choque de cookies
 *    que describe `acciones/sesion.ts`: la de la raíz gana sobre la del
 *    prefijo, y quien entra después con otra cuenta queda autenticado como el
 *    anterior. La plataforma entra por las acciones de servidor y solo por
 *    ellas.
 *
 * Qué NO se puede cerrar: `<coleccion>/file/<nombre>`. Es la ruta con la que
 * Payload sirve cada imagen, vídeo y modelo 3D, y es la que llevan los `<img>`,
 * los `<video>` y el cargador de glTF de toda la plataforma, porque el campo
 * `url` que arma Payload apunta ahí. Cerrarla dejaría toda ficha sin
 * ilustraciones. Ejecuta `checkFileAccess`, así que sigue pidiendo sesión.
 *
 * Se comprobó antes de cerrar que el repositorio no usa nada más de esta API:
 * las únicas direcciones `/api/…` escritas a mano —`/api/salud`,
 * `/api/cambios`, `/api/vista-previa`, `/api/respaldos/<archivo>`— son rutas
 * propias que viven bajo `(frontend)` y Next resuelve antes que este comodín.
 *
 * Se responde 403 y no 404 a propósito: un 404 diría que la dirección no
 * existe, y existe; lo que pasa es que esta plataforma no la ofrece. Además
 * mantiene lo que ya estaba documentado y probado —`GET /api/patologias`
 * contesta 403 (`tests/e2e/sin-sesion.spec.ts`, `docs/DESPLIEGUE.md`)—, con la
 * diferencia de que ahora contesta lo mismo **con** sesión.
 *
 * Si alguna vez hace falta volver a abrir algo de aquí, que sea un extremo
 * concreto y con su motivo escrito, no los seis métodos de golpe.
 */

/** Lo que Next entrega a un manejador de ruta con comodín. */
type Contexto = { params: Promise<{ slug?: string[] }> }

const listaDeArchivos = REST_GET(config)
const preflightDeArchivos = REST_OPTIONS(config)

/**
 * `/api/<coleccion>/file/<nombre>`, tres segmentos exactos.
 *
 * Es la forma que declara Payload para servir un archivo subido
 * (`uploads/endpoints/index.js`: `path: '/file/:filename'`). Los tamaños
 * derivados —la miniatura, el ancho— son otro nombre de archivo en esa misma
 * ruta, y el `?prefix=` viaja en la consulta, no en el camino: por eso la
 * comprobación es por longitud y no por prefijo.
 */
const esArchivoSubido = (slug: string[] | undefined): boolean =>
  Array.isArray(slug) && slug.length === 3 && slug[1] === 'file'

/** Con la forma de error de Payload, para que un cliente suyo la entienda. */
const cerrada = (): Response =>
  Response.json(
    {
      errors: [
        {
          message:
            'Esta API no está disponible. El contenido se administra desde el panel de TraumaHub.',
        },
      ],
    },
    { status: 403 },
  )

export async function GET(peticion: Request, contexto: Contexto): Promise<Response> {
  const { slug } = await contexto.params
  return esArchivoSubido(slug) ? listaDeArchivos(peticion, contexto) : cerrada()
}

export async function OPTIONS(peticion: Request, contexto: Contexto): Promise<Response> {
  const { slug } = await contexto.params
  return esArchivoSubido(slug) ? preflightDeArchivos(peticion, contexto) : cerrada()
}

// Ninguna escritura. Se declaran en lugar de no exportarlas para que la
// respuesta explique el motivo: sin ellas Next contestaría un 405 pelado y el
// siguiente que escriba un guion contra esta API creería que se equivocó de
// método y probaría con otro.
export const POST = cerrada
export const PATCH = cerrada
export const PUT = cerrada
export const DELETE = cerrada
