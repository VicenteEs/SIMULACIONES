import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { CABECERA_CAMPOS, CABECERA_NOMBRE } from '@/admin/subidas'
import { depurarDocumento } from '@/admin/depurar'
import { camposDe, esColeccionEditable, esquemaDe } from '@/admin/esquema'
import { ErrorDeAcceso, exigirEditor, type Respuesta } from '@/lib/guardias'
import { nombreSeguroDeArchivo } from '@/uploads/validarModelo3D'

export const dynamic = 'force-dynamic'

/**
 * La subida de archivos del panel, por una ruta y no por una acción.
 *
 * El porqué entero —qué corta Next, por qué una acción no sirve para un vídeo y
 * por qué el cuerpo viaja en crudo— está escrito una sola vez, en
 * `src/admin/subidas.ts`, que es el módulo que las dos puntas comparten. Aquí
 * va lo que solo pasa de este lado.
 *
 * Esta ruta **no** reemplaza la validación de nadie: el techo de peso sale del
 * esquema del panel, el contenido lo comprueba el gancho de la colección
 * —`validarModelo3D` mira la firma de un `.glb`— y los campos los reconstruye
 * `depurarDocumento` igual que en el editor. Lo único propio de aquí es recibir
 * el archivo sin reunirlo en memoria y cortar en el byte en que se pasa.
 */

/** Respuesta con la misma forma que devuelve `accion()`, para que el panel no distinga. */
const responder = (cuerpo: Respuesta<{ id: string }>, estado: number): Response =>
  Response.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })

/** Con coma, que es como se escribe un decimal aquí y como lo escribe el panel. */
const enMegas = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',')

/**
 * El rechazo por peso, con las dos cifras dentro.
 *
 * El peso **y** el máximo: «demasiado grande» a secas no dice si sobran dos
 * megas o doscientos, y de eso depende si quien sube recorta el vídeo o busca
 * otro. Es el mismo texto que compone el navegador antes de mandar nada, porque
 * son el mismo rechazo visto desde dos sitios.
 */
const pasadoDePeso = (nombre: string, pesa: number, techo: number): Respuesta<{ id: string }> => ({
  exito: false,
  mensaje:
    `«${nombre}» pesa ${enMegas(pesa)} MB y el máximo son ${Math.round(techo / (1024 * 1024))} MB. ` +
    'Comprímalo, o recorte el video, antes de subirlo.',
})

/**
 * ¿Viene de esta misma plataforma?
 *
 * Una acción de servidor trae esta comprobación puesta por Next; un manejador
 * de ruta, no. Sin ella, la cookie de sesión —acotada al prefijo, pero
 * compartida con los vecinos del mismo dominio (`acciones/sesion.ts`)— dejaría
 * que un guion inyectado en cualquiera de esas páginas subiera archivos con la
 * sesión del traumatólogo.
 *
 * Se comprueba **igual que lo comprueba Next** para sus acciones
 * (`next/dist/server/app-render/action-handler.js`), y eso es deliberado en los
 * dos sentidos. Más estricta, subir fallaría en un despliegue donde el resto
 * del panel funciona, y nadie relacionaría una cosa con la otra. Más laxa,
 * sería la puerta abierta al lado de la que las acciones ya cierran.
 *
 * De ahí las dos decisiones que de otro modo parecerían descuidos:
 *
 *  - Se compara el **anfitrión** y no el origen entero: detrás de un proxy la
 *    aplicación habla http mientras el navegador habla https, así que los
 *    esquemas no coinciden nunca y compararlos rechazaría todo.
 *  - Vale que case `x-forwarded-host` **o** `host`. Next prefiere la primera,
 *    pero en esta cadena —Funnel, nginx, contenedor— hay tramos que ponen una y
 *    no la otra, y exigir justo la que ese tramo no puso deja la subida muerta
 *    sin nada que mirar.
 *
 * Una petición **sin** `Origin` pasa, como pasa en Next: no la manda ningún
 * navegador al hacer POST, así que quien llega así es un cliente hecho a mano,
 * que no tiene la cookie de nadie salvo que su dueño se la haya dado.
 */
function vieneDeAqui(peticion: Request): boolean {
  const origen = peticion.headers.get('origin')
  if (!origen) return true

  let anfitrionDelOrigen: string
  try {
    anfitrionDelOrigen = new URL(origen).host
  } catch {
    return false
  }

  // El reenviado puede venir con la cadena entera de proxies separada por
  // comas; el que vale es el primero, que es el que habló con el navegador.
  const cabeceraReenviada = peticion.headers.get('x-forwarded-host')
  const reenviado = cabeceraReenviada ? cabeceraReenviada.split(',')[0].trim() : null
  const propio = peticion.headers.get('host')
  return (
    (reenviado !== null && anfitrionDelOrigen === reenviado) ||
    (propio !== null && anfitrionDelOrigen === propio.trim())
  )
}

/** Los campos que acompañan al archivo, tal como los mandó la pantalla. */
function camposDeLaCabecera(peticion: Request): Record<string, unknown> {
  const crudos = peticion.headers.get(CABECERA_CAMPOS)
  if (!crudos) return {}
  const analizado: unknown = JSON.parse(decodeURIComponent(crudos))
  if (!analizado || typeof analizado !== 'object' || Array.isArray(analizado)) return {}
  return analizado as Record<string, unknown>
}

export async function POST(
  peticion: Request,
  { params }: { params: Promise<{ coleccion: string }> },
) {
  /**
   * El archivo se escribe en un directorio temporal propio y no suelto en el
   * del sistema.
   *
   * Dentro va con su nombre real, porque es ese nombre el que Payload toma del
   * camino (`uploads/getFileByPath.js` hace `path.basename`). Un directorio por
   * subida evita lo que ocurriría si dos personas subieran a la vez un archivo
   * llamado igual: el segundo pisaría al primero a mitad de escritura y el
   * registro quedaría apuntando a un vídeo que es mitad de cada uno.
   */
  let temporal: string | null = null

  try {
    if (!vieneDeAqui(peticion)) {
      return responder(
        { exito: false, mensaje: 'La petición no viene de esta plataforma.' },
        403,
      )
    }

    const { coleccion } = await params
    if (!esColeccionEditable(coleccion)) {
      return responder({ exito: false, mensaje: 'Esa colección no existe en el panel.' }, 404)
    }
    const esquema = esquemaDe(coleccion)
    const subida = esquema.subida
    if (!subida) {
      return responder({ exito: false, mensaje: 'Esa colección no recibe archivos.' }, 400)
    }

    // La misma guardia que usaba la acción, y por el mismo motivo: una ruta es
    // otro extremo HTTP y se alcanza sin pasar por la pantalla que la ofrece.
    // `exigirEditor` y no `exigirEdicionDe`: medios y modelos 3D son material
    // de apoyo, que `puedeEditar` no restringe por módulo porque lo usan los
    // cinco a la vez.
    const { payload, usuario } = await exigirEditor()

    const declarado = peticion.headers.get(CABECERA_NOMBRE)
    let nombre: string
    try {
      // `decodeURIComponent` lanza ante un `%` suelto, y una cabecera la
      // escribe quien llama: sin este `try` ese caso saldría por el 500 de
      // abajo, registrado como avería del servidor, cuando es un cliente mal
      // hecho.
      nombre = nombreSeguroDeArchivo(decodeURIComponent(declarado ?? ''))
    } catch {
      nombre = ''
    }
    // Se reutiliza el saneador de los modelos 3D en vez de escribir un segundo:
    // aquí el nombre no va a parar solo a la base, se convierte en un camino
    // del disco, y un «../../.env» tiene que quedarse en «.env» antes de tocar
    // nada. Que además deje «fémur.glb» en «f-mur.glb» no se ve en ninguna
    // pantalla: lo que el panel enseña es `alt` o `nombre`, no el archivo.
    if (!/\.[a-zA-Z0-9]+$/.test(nombre)) {
      return responder(
        {
          exito: false,
          mensaje:
            'El archivo llegó sin un nombre con extensión utilizable. Renómbrelo y vuelva a subirlo.',
        },
        400,
      )
    }

    // El techo, dos veces y no por duplicado. Esta primera es la que de verdad
    // corta: el navegador anuncia el peso en `Content-Length` antes de mandar
    // un solo byte, así que quien se pasa recibe el motivo sin haber gastado la
    // subida entera.
    const anunciado = Number(peticion.headers.get('content-length'))
    if (Number.isFinite(anunciado) && anunciado > subida.maximoBytes) {
      return responder(pasadoDePeso(nombre, anunciado, subida.maximoBytes), 413)
    }

    let campos: Record<string, unknown>
    try {
      campos = camposDeLaCabecera(peticion)
    } catch {
      return responder(
        { exito: false, mensaje: 'Los datos que acompañan al archivo llegaron ilegibles.' },
        400,
      )
    }
    const datos: Record<string, unknown> = {}
    for (const campo of camposDe(esquema)) {
      const valor = campos[campo.nombre]
      if (valor !== undefined && valor !== null) datos[campo.nombre] = valor
    }

    const flujo = peticion.body
    if (!flujo) {
      return responder({ exito: false, mensaje: 'No llegó ningún archivo.' }, 400)
    }

    temporal = await mkdtemp(join(tmpdir(), 'traumahub-subida-'))
    const destino = join(temporal, nombre)

    let bytes = 0
    const manejador = await open(destino, 'w')
    try {
      const lector = flujo.getReader()
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        bytes += value.byteLength
        // La segunda comprobación, para el cliente que no anunció el peso o
        // que mintió. Aquí ya no se puede ser amable: se corta la lectura en
        // el byte que se pasa en vez de acabar de recibir un archivo que se va
        // a rechazar igual.
        if (bytes > subida.maximoBytes) {
          await lector.cancel()
          return responder(pasadoDePeso(nombre, bytes, subida.maximoBytes), 413)
        }
        // `write` del manejador y no un `WriteStream`: se espera a cada
        // escritura, de modo que el flujo de entrada avanza al ritmo del disco
        // y no se acumula en memoria mientras el disco se queda atrás.
        await manejador.write(value)
      }
    } finally {
      await manejador.close()
    }

    if (bytes === 0) {
      return responder({ exito: false, mensaje: 'El archivo llegó vacío.' }, 400)
    }

    // `filePath` y no `file`. Los dos acaban en un `Buffer` —`payload.create`
    // no admite otra cosa—, pero con `filePath` es Payload quien lee el archivo
    // del disco, y de paso deduce el tipo de su contenido con `file-type` en
    // lugar de creerse el `Content-Type` que declaró el navegador. Aquí eso
    // importa: la lista de `mimeTypes` de la colección se comprueba contra ese
    // valor, y un tipo que lo pone quien sube no comprueba nada.
    const creado = await payload.create({
      collection: esquema.slug as never,
      data: depurarDocumento(esquema, datos) as never,
      filePath: destino,
      user: usuario as never,
    })

    revalidatePath(`/admin-panel/contenido/${esquema.slug}`)
    return responder(
      { exito: true, datos: { id: String((creado as { id: unknown }).id) } },
      200,
    )
  } catch (fallo) {
    // Mismo reparto que `accion()`: el rechazo de acceso no se registra porque
    // no es una avería, y todo lo demás sí, para que el motivo quede en el
    // registro del servidor aunque la pantalla enseñe la versión corta.
    if (fallo instanceof ErrorDeAcceso) {
      return responder({ exito: false, mensaje: fallo.message }, 401)
    }
    console.error('[subida]', fallo)
    return responder(
      {
        exito: false,
        mensaje:
          fallo instanceof Error && fallo.message ? fallo.message : 'No se pudo subir el archivo.',
      },
      500,
    )
  } finally {
    // Pase lo que pase. Sin esto, cada subida rechazada a mitad dejaría un
    // vídeo de decenas de megas en el temporal del servidor, y en el Windows de
    // casa eso no lo limpia nadie. El `catch` vacío es a propósito: no llegar a
    // borrar un temporal no puede convertir una subida buena en un error.
    if (temporal) await rm(temporal, { recursive: true, force: true }).catch(() => {})
  }
}
