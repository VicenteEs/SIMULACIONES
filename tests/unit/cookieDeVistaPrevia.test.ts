import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIE_VISTA_PREVIA } from '@/lib/vistaPrevia'

/**
 * El path de la cookie de vista previa está escrito en dos archivos, y esto los
 * ata mientras sigan siendo dos.
 *
 * La escribe `api/vista-previa/route.ts` (`PATH_COOKIE`) y la borran `entrar()`
 * y `salir()` de `acciones/sesion.ts` (`PATH_VISTA_PREVIA`). El valor está
 * repetido porque esa acción lleva `'use server'` y no puede exportar una
 * constante: su sitio natural es `src/lib/vistaPrevia.ts`, junto al nombre de la
 * cookie, y hasta que esté allá lo único que impide que se separen es esta
 * prueba.
 *
 * Qué se rompe si se separan, que es lo que no se ve mirando cualquiera de los
 * dos archivos: un `delete` con un path distinto del que se usó al escribir **no
 * caduca nada**. La simulación de rol sobreviviría a cerrar la sesión, y la
 * sesión siguiente —otra persona, en la estación compartida— empezaría viendo la
 * plataforma como el rol que eligió la anterior. Nada falla, nada avisa, y en
 * desarrollo ni se nota: sin prefijo los dos valores son `/` y coinciden por
 * casualidad. Por eso el caso que importa es el del prefijo.
 */

interface Escritura {
  operacion: 'set' | 'delete'
  nombre: string
  path?: string
}

const { estado, almacenFalso, autenticar } = vi.hoisted(() => {
  const estado = { escrituras: [] as Escritura[] }
  return {
    estado,
    autenticar: vi.fn(),
    almacenFalso: {
      set: (nombre: string, _valor: string, opciones?: { path?: string }) => {
        estado.escrituras.push({ operacion: 'set', nombre, path: opciones?.path })
      },
      delete: (arg: string | { name: string; path?: string }) => {
        estado.escrituras.push({
          operacion: 'delete',
          nombre: typeof arg === 'string' ? arg : arg.name,
          path: typeof arg === 'string' ? undefined : arg.path,
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
  getPayload: async () => ({ auth: autenticar }),
  // `sesion.ts` la importa como valor para reconocer la cuenta bloqueada.
  LockedAuth: class LockedAuth extends Error {},
}))

// Sin esto, el alias `@payload-config` carga la configuración de verdad, que
// abre el adaptador de Postgres. Aquí no hace falta nada de eso: `salir()` solo
// le pregunta el prefijo de la cookie de sesión.
vi.mock('@payload-config', () => ({ default: {} }))

const prefijoOriginal = process.env.NEXT_PUBLIC_BASE_PATH

/** El `Path=` de la cabecera `Set-Cookie` que devuelve la ruta. */
function pathDeLaCabecera(respuesta: Response): string | undefined {
  const cabecera = respuesta.headers.get('set-cookie') ?? ''
  return /;\s*Path=([^;]*)/i.exec(cabecera)?.[1]
}

/**
 * Los tres paths con los que se toca la cookie, con el prefijo indicado.
 *
 * Cada llamada vacía el registro de módulos y vuelve a importar, porque
 * `PREFIJO` se lee una sola vez al cargar `src/lib/rutas.ts`.
 */
async function pathsConPrefijo(prefijo: string) {
  process.env.NEXT_PUBLIC_BASE_PATH = prefijo
  vi.resetModules()

  const { salir } = await import('@/app/(frontend)/acciones/sesion')
  const { POST } = await import('@/app/(frontend)/api/vista-previa/route')

  estado.escrituras = []
  await salir()
  const alCerrarSesion = estado.escrituras.find(
    (e) => e.operacion === 'delete' && e.nombre === COOKIE_VISTA_PREVIA,
  )?.path

  const peticion = (rol: string | null) =>
    new Request('https://hospital.example.cl/api/vista-previa', {
      method: 'POST',
      body: JSON.stringify({ rol }),
      headers: { 'content-type': 'application/json' },
    })

  // El usuario real es administrador, así que puede simular «lector»; con
  // `rol: null` la ruta se limita a borrar la simulación.
  const alSimular = pathDeLaCabecera(await POST(peticion('lector')))
  const alDejarDeSimular = pathDeLaCabecera(await POST(peticion(null)))

  return { alCerrarSesion, alSimular, alDejarDeSimular }
}

beforeEach(() => {
  estado.escrituras = []
  autenticar.mockReset()
  autenticar.mockResolvedValue({ user: { activo: true, rol: 'admin' } })
})

afterAll(() => {
  if (prefijoOriginal === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
  else process.env.NEXT_PUBLIC_BASE_PATH = prefijoOriginal
})

// Cada caso recarga el grafo entero de la acción (`@/collections` incluido), y
// con la máquina ocupada eso pasa de los cinco segundos que Vitest da por
// omisión: el caso fallaría por tiempo sin que nada esté roto.
describe(
  'la cookie de vista previa se escribe y se borra en el mismo path',
  { timeout: 30_000 },
  () => {
    it('bajo un prefijo, los tres sitios dicen el prefijo', async () => {
      const paths = await pathsConPrefijo('/traumahub')

      expect(paths.alSimular).toBe('/traumahub')
      expect(paths.alDejarDeSimular).toBe('/traumahub')
      expect(paths.alCerrarSesion).toBe('/traumahub')
    })

    it('sin prefijo, los tres dicen la raíz', async () => {
      // El caso de desarrollo. Va aparte porque es donde los dos valores
      // coinciden aunque uno de los dos esté mal: si alguien escribiera `'/'` a
      // secas en un lado, esta prueba pasaría y la de arriba fallaría, que es
      // justo el reparto que se quiere.
      const paths = await pathsConPrefijo('')

      expect(paths.alSimular).toBe('/')
      expect(paths.alDejarDeSimular).toBe('/')
      expect(paths.alCerrarSesion).toBe('/')
    })

    it('y nunca se queda sin path, que es lo mismo que escribirlo en la raíz', async () => {
      // `cookies().delete('nombre')` —sin objeto— usa el path de la petición, no
      // el de la escritura. Es la forma en que esto se rompió la primera vez.
      const paths = await pathsConPrefijo('/traumahub')

      for (const path of Object.values(paths)) {
        expect(path).toBeDefined()
      }
    })
  },
)
