import { ErrorDeAcceso, exigirAdmin } from '@/lib/guardias'
import { datosDeUnaCuenta } from '@/lib/datosDeUnaCuentaServidor'
import { nombreDelArchivoDeDatos } from '@/lib/datosDeUnaCuenta'
import { registrarAccion } from '@/lib/registroServidor'
import { marcaDeTiempo } from '@/lib/respaldos'

export const dynamic = 'force-dynamic'

/**
 * Todos los datos de una cuenta en un archivo JSON (D-293), para responder a
 * quien pide acceso a sus datos o llevárselos a otro servicio. Lo descarga un
 * administrador desde «Usuarios» y se lo manda a la persona; qué hay dentro, y
 * qué se deja fuera, está en `src/lib/datosDeUnaCuenta.ts`.
 *
 * Una ruta y no una acción de servidor, como las planillas: es un archivo. Y
 * con el rol **real** de administrador (`exigirAdmin`), porque una ruta se
 * alcanza sin pasar por la pantalla que la ofrece, y lo que entrega es la
 * actividad entera de una persona.
 *
 * Cada descarga queda en el registro de acciones, a nombre de quien la hizo:
 * sacar de la plataforma los datos de alguien es exactamente lo que el
 * registro está para poder contar después.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  let contexto: Awaited<ReturnType<typeof exigirAdmin>>
  try {
    contexto = await exigirAdmin()
  } catch (error) {
    if (error instanceof ErrorDeAcceso) return new Response('No autorizado', { status: 403 })
    throw error
  }

  const { id } = await params
  // Solo números: los identificadores de las cuentas lo son, y así lo que
  // llega en la ruta no viaja a la consulta ni al nombre del archivo.
  if (!/^\d{1,12}$/.test(id)) return new Response('No encontrado', { status: 404 })

  const datos = await datosDeUnaCuenta(contexto.payload, Number(id))
  if (!datos) return new Response('No encontrado', { status: 404 })

  await registrarAccion(contexto.payload, {
    accion: 'exportacion-de-datos',
    usuario: contexto.usuario,
    coleccion: 'usuarios',
    documentoId: id,
    detalle: 'Descargó todos los datos de la cuenta.',
  })

  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreDelArchivoDeDatos(id, marcaDeTiempo())}"`,
      'Cache-Control': 'no-store',
    },
  })
}
