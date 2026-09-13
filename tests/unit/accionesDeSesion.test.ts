import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Dónde se escribe el testigo de sesión.
 *
 * En el servidor la plataforma no tiene origen propio: cuelga de `/traumahub`
 * detrás del mismo proxy que sirve otras tres páginas en `/`, `/equipo` y
 * `/senales`. Una cookie de sesión con `path: '/'` se la manda el navegador a
 * todas ellas, y ese testigo abre TraumaHub entero durante ocho horas sin pedir
 * contraseña. Es el fallo que no se ve: en desarrollo, sin prefijo, el path
 * correcto **es** `/`, así que las dos versiones se comportan igual y solo se
 * separan en el servidor.
 *
 * Y el borrado va atado al mismo path: `delete(nombre)` caduca una cookie de
 * path `/` —el que Next pone por omisión—, que bajo prefijo ya no es la
 * nuestra. Si alguien cambia uno de los dos y no el otro, «salir» deja de
 * cerrar la sesión y nada lo delata hasta que se prueba en el servidor.
 */

interface Escritura {
  operacion: 'set' | 'delete'
  nombre: string
  opciones?: Record<string, unknown>
}

// Todo dentro de `vi.hoisted`: las fábricas de `vi.mock` se elevan por encima
// del resto del archivo, y un `const` declarado abajo todavía no existe cuando
// alguna de ellas corre.
const { estado, entrada, almacenFalso } = vi.hoisted(() => {
  const estado = { escrituras: [] as Escritura[] }
  return {
    estado,
    entrada: vi.fn(),
    almacenFalso: {
      set: (nombre: string, _valor: string, opciones?: Record<string, unknown>) => {
        estado.escrituras.push({ operacion: 'set', nombre, opciones })
      },
      delete: (arg: string | { name: string; path?: string }) => {
        estado.escrituras.push(
          typeof arg === 'string'
            ? { operacion: 'delete', nombre: arg }
            : { operacion: 'delete', nombre: arg.name, opciones: arg },
        )
      },
    },
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => almacenFalso,
  headers: async () => new Headers(),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ login: entrada }),
  // `sesion.ts` la importa como valor para distinguir la cuenta bloqueada.
  LockedAuth: class LockedAuth extends Error {},
}))

vi.mock('@payload-config', () => ({ default: {} }))

const prefijoOriginal = process.env.NEXT_PUBLIC_BASE_PATH

/**
 * El prefijo se lee al cargar el módulo (`PREFIJO` en `src/lib/rutas.ts`), así
 * que cada caso tiene que fijarlo antes de importar y pedir una copia nueva.
 */
async function cargarAcciones(prefijo: string) {
  if (prefijo) process.env.NEXT_PUBLIC_BASE_PATH = prefijo
  else delete process.env.NEXT_PUBLIC_BASE_PATH
  vi.resetModules()
  return import('@/app/(frontend)/acciones/sesion')
}

beforeEach(() => {
  estado.escrituras = []
  entrada.mockReset()
  entrada.mockResolvedValue({ token: 'testigo-firmado', user: { activo: true, rol: 'admin' } })
})

afterEach(() => {
  if (prefijoOriginal === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
  else process.env.NEXT_PUBLIC_BASE_PATH = prefijoOriginal
})

// Cada caso vacía el registro de módulos y vuelve a importar la acción con su
// prefijo, así que arrastra consigo la carga del grafo entero (`@/collections`
// incluido). Con la máquina ocupada, eso pasa de los cinco segundos que Vitest
// da por omisión y el caso falla por tiempo sin que nada esté roto.
describe('la cookie de sesión se acota al prefijo', { timeout: 30_000 }, () => {
  it('no la escribe en la raíz del servidor compartido', async () => {
    const { entrar } = await cargarAcciones('/traumahub')
    const respuesta = await entrar('traumatologo@hospital.cl', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(true)
    const escrita = estado.escrituras.find((e) => e.operacion === 'set' && e.nombre === 'payload-token')
    expect(escrita?.opciones?.path).toBe('/traumahub')
  })

  it('la borra en ese mismo path, o «salir» no cierra nada', async () => {
    const { salir } = await cargarAcciones('/traumahub')
    await salir()

    const borrada = estado.escrituras.find(
      (e) => e.operacion === 'delete' && e.nombre === 'payload-token',
    )
    expect(borrada?.opciones?.path).toBe('/traumahub')
  })

  it('en desarrollo, sin prefijo, sigue siendo la raíz', async () => {
    const { entrar } = await cargarAcciones('')
    await entrar('traumatologo@hospital.cl', 'una-contrasena-larga')

    const escrita = estado.escrituras.find((e) => e.operacion === 'set' && e.nombre === 'payload-token')
    expect(escrita?.opciones?.path).toBe('/')
  })

  it('la de vista previa se sigue borrando en la raíz, que es donde la escribe su ruta', async () => {
    // `api/vista-previa/route.ts` la fija con `path: '/'`. Borrarla en otro path
    // la dejaría viva, y una sesión nueva empezaría simulando el rol anterior.
    const { salir } = await cargarAcciones('/traumahub')
    await salir()

    const borrada = estado.escrituras.find(
      (e) => e.operacion === 'delete' && e.nombre === 'vista-previa-rol',
    )
    expect(borrada).toBeDefined()
    expect(borrada?.opciones?.path).toBeUndefined()
  })
})
