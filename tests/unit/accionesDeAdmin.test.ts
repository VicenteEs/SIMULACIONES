import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Dos acciones del panel que fallaban callando.
 *
 * El enlace de contraseña es hoy el **único** camino para que alguien elija
 * clave: esta instalación no tiene servidor de correo, así que el administrador
 * copia lo que le da el panel y lo entrega a mano. Su gemelo, el del correo,
 * recorta la barra final de la dirección y tiene su prueba desde entonces
 * (`duplicarYClave.test.ts`); esta copia no la recortaba, y con
 * `NEXT_PUBLIC_SERVER_URL` terminada en barra devolvía `…//clave/<testigo>`,
 * que en el servidor compartido contesta un 404 de otra página. El testigo dura
 * una hora, de modo que para cuando el residente avisa hay que generar otro.
 *
 * «Resolver todos» es una escritura masiva de Payload, y esas no lanzan:
 * acumulan un error por documento en `errors` y siguen. Sin mirar ese array, un
 * éxito parcial sale en verde y los que quedaron no aparecen en ningún sitio.
 */

const { estado, buscarPorId, pedirClave, actualizar, contar } = vi.hoisted(() => ({
  estado: { rolReal: 'admin' as string },
  buscarPorId: vi.fn(),
  pedirClave: vi.fn(),
  actualizar: vi.fn(),
  contar: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: estado.rolReal, activo: true },
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: { id: 1, rol: estado.rolReal, activo: true },
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({
    findByID: buscarPorId,
    forgotPassword: pedirClave,
    update: actualizar,
    count: contar,
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  cambiarActivoUsuario,
  generarEnlaceDeClave,
  resolverTodosLosComentarios,
} from '@/app/(frontend)/acciones/admin'

const direccionOriginal = process.env.NEXT_PUBLIC_SERVER_URL

beforeEach(() => {
  estado.rolReal = 'admin'
  buscarPorId.mockReset()
  buscarPorId.mockResolvedValue({ id: 7, email: 'residente@hospital.cl' })
  pedirClave.mockReset()
  pedirClave.mockResolvedValue('testigo-de-una-hora')
  actualizar.mockReset()
  contar.mockReset()
  contar.mockResolvedValue({ totalDocs: 1 })
  // `accion()` anota en consola todo fallo que no sea de acceso. Aquí los fallos
  // son el caso que se prueba, y su registro solo ensucia la salida.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (direccionOriginal === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = direccionOriginal
})

describe('el enlace de contraseña que entrega el panel', () => {
  it('no deja una barra doble si la dirección trae barra final', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub/'
    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos?.enlace).toBe(
      'https://ved.example.net:10000/traumahub/clave/testigo-de-una-hora',
    )
  })

  it('conserva el prefijo del servidor compartido', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub'
    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta.datos?.enlace).toBe(
      'https://ved.example.net:10000/traumahub/clave/testigo-de-una-hora',
    )
  })

  it('avisa de la variable que falta en vez de devolver una ruta relativa', async () => {
    delete process.env.NEXT_PUBLIC_SERVER_URL
    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/NEXT_PUBLIC_SERVER_URL/)
    // Y sin quemar el testigo: cada `forgotPassword` invalida el anterior, así
    // que fallar después dejaría sin efecto un enlace ya entregado.
    expect(pedirClave).not.toHaveBeenCalled()
  })
})

describe('dos administradores desactivándose a la vez', () => {
  it('reactiva la cuenta de quien llama si el cambio deja la plataforma sin ninguno', async () => {
    // Primer conteo: la comprobación previa, que todavía ve activo al otro
    // administrador. Segundo: el de después de escribir, cuando la otra sesión
    // ya confirmó la suya y no queda ninguno.
    contar.mockResolvedValueOnce({ totalDocs: 1 }).mockResolvedValueOnce({ totalDocs: 0 })
    actualizar.mockResolvedValue({ id: 9 })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/sin ningún administrador/)

    // La reparación va sobre la cuenta de quien llama —que `exigirAdmin` acaba
    // de comprobar que era administradora activa— y no sobre la editada, que
    // puede no haber sido nunca administradora.
    const reparacion = actualizar.mock.calls.at(-1)?.[0] as {
      id: string
      data: Record<string, unknown>
    }
    expect(reparacion.id).toBe('1')
    expect(reparacion.data).toEqual({ rol: 'admin', activo: true })
  })

  it('no repara nada mientras quede un administrador activo', async () => {
    contar.mockResolvedValue({ totalDocs: 1 })
    actualizar.mockResolvedValue({ id: 9 })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(true)
    expect(actualizar).toHaveBeenCalledTimes(1)
  })
})

describe('resolver todos los comentarios pendientes', () => {
  it('cuenta los que resolvió cuando no falla ninguno', async () => {
    actualizar.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }], errors: [] })
    const respuesta = await resolverTodosLosComentarios()

    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos?.resueltos).toBe(2)
  })

  it('no informa de un éxito parcial como si fuera total', async () => {
    actualizar.mockResolvedValue({
      docs: [{ id: 1 }, { id: 2 }],
      errors: [{ id: 3, isPublic: false, message: 'El usuario ya no existe' }],
    })
    const respuesta = await resolverTodosLosComentarios()

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('2')
    expect(respuesta.mensaje).toContain('1')
    expect(respuesta.mensaje).toContain('El usuario ya no existe')
  })

  it('deja resolver al editor, que es quien arregla lo que se le señala', async () => {
    estado.rolReal = 'editor'
    actualizar.mockResolvedValue({ docs: [{ id: 1 }], errors: [] })
    const respuesta = await resolverTodosLosComentarios()

    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos?.resueltos).toBe(1)
  })
})
