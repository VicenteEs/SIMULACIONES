import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El nombre de la cookie de sesión lo pone la configuración, no `sesion.ts`.
 *
 * Payload firma y lee siempre `<cookiePrefix>-token`, y ese nombre es la salida
 * prevista al choque con la cookie que las sesiones antiguas dejaron en `/`:
 * renombrarla con `cookiePrefix: 'traumahub'` la vuelve invisible para Payload
 * y la mata sola. La trampa está en que hoy las dos cadenas coinciden —el valor
 * por omisión es `payload`—, así que un nombre escrito a mano en `sesion.ts`
 * pasa todas las demás pruebas y solo falla el día del cambio: la plataforma
 * guardaría una cookie que nadie lee, entrar contestaría «exito» y la sesión no
 * existiría, sin un error en ninguna parte. Esto vigila que se muevan juntos.
 */

interface Escritura {
  operacion: 'set' | 'delete'
  nombre: string
}

// Todo dentro de `vi.hoisted`: las fábricas de `vi.mock` se elevan por encima
// del resto del archivo, y un `const` declarado abajo todavía no existe cuando
// alguna de ellas corre.
const { estado, entrada, restablecer, almacenFalso, configuracion } = vi.hoisted(() => {
  const estado = { escrituras: [] as Escritura[] }
  return {
    estado,
    entrada: vi.fn(),
    restablecer: vi.fn(),
    // El prefijo que declara la configuración en cada caso.
    configuracion: { prefijo: undefined as string | undefined },
    almacenFalso: {
      set: (nombre: string) => {
        estado.escrituras.push({ operacion: 'set', nombre })
      },
      delete: (arg: string | { name: string }) => {
        estado.escrituras.push({
          operacion: 'delete',
          nombre: typeof arg === 'string' ? arg : arg.name,
        })
      },
    },
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => almacenFalso,
  headers: async () => new Headers(),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ login: entrada, resetPassword: restablecer }),
  // `sesion.ts` la importa como valor para distinguir la cuenta bloqueada.
  LockedAuth: class LockedAuth extends Error {},
}))

// El prefijo se lee con un captador y no como valor fijo. La fábrica de un
// `vi.mock` corre **una sola vez**: `vi.resetModules()` vacía el registro de
// módulos, pero no el de los simulacros, así que devolver aquí el objeto de
// turno dejaba a todos los casos con el del primero —y los tres últimos
// comprobaban, sin decirlo, el mismo `payload-token` de siempre—.
vi.mock('@payload-config', () => ({
  default: {
    get cookiePrefix() {
      return configuracion.prefijo
    },
  },
}))

/** Carga una copia nueva de las acciones con el prefijo indicado. */
async function cargarAcciones(prefijo?: string) {
  configuracion.prefijo = prefijo
  vi.resetModules()
  return import('@/app/(frontend)/acciones/sesion')
}

beforeEach(() => {
  estado.escrituras = []
  entrada.mockReset()
  entrada.mockResolvedValue({ token: 'testigo-firmado', user: { activo: true, rol: 'admin' } })
  restablecer.mockReset()
  restablecer.mockResolvedValue({ token: 'testigo-de-clave-nueva' })
})

// Cada caso vacía el registro de módulos y vuelve a importar la acción, así que
// arrastra consigo la carga del grafo entero (`@/collections` incluido). Con la
// máquina ocupada, eso pasa de los cinco segundos que Vitest da por omisión y
// el caso falla por tiempo sin que nada esté roto.
describe('la cookie de sesión se llama como diga la configuración', { timeout: 30_000 }, () => {
  it('sin prefijo declarado usa el nombre por omisión de Payload', async () => {
    const { entrar } = await cargarAcciones()
    const respuesta = await entrar('traumatologo@hospital.cl', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(true)
    expect(estado.escrituras).toContainEqual({ operacion: 'set', nombre: 'payload-token' })
  })

  it('con `cookiePrefix` escribe el testigo con ese nombre', async () => {
    const { entrar } = await cargarAcciones('traumahub')
    await entrar('traumatologo@hospital.cl', 'una-contrasena-larga')

    expect(estado.escrituras).toContainEqual({ operacion: 'set', nombre: 'traumahub-token' })
    expect(estado.escrituras.some((e) => e.nombre === 'payload-token')).toBe(false)
  })

  it('y «salir» borra ese mismo nombre, no el anterior', async () => {
    // Si el borrado se quedara con el nombre viejo, salir dejaría la sesión
    // abierta: la cookie que Payload lee seguiría en el navegador.
    const { salir } = await cargarAcciones('traumahub')
    await salir()

    expect(estado.escrituras).toContainEqual({ operacion: 'delete', nombre: 'traumahub-token' })
  })

  it('elegir contraseña nueva abre la sesión con ese mismo nombre', async () => {
    // Es el otro camino que deja al usuario dentro sin pasar por `entrar()`.
    // Si se quedara con el nombre anterior, quien acaba de elegir contraseña
    // aterrizaría en la plataforma sin sesión y sin saber por qué.
    const { fijarClaveNueva } = await cargarAcciones('traumahub')
    const respuesta = await fijarClaveNueva('un-testigo-de-recuperacion', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(true)
    expect(estado.escrituras).toContainEqual({ operacion: 'set', nombre: 'traumahub-token' })
  })
})
