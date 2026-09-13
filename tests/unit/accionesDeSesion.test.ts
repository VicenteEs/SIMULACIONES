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
const { estado, entrada, restablecer, almacenFalso } = vi.hoisted(() => {
  const estado = { escrituras: [] as Escritura[] }
  return {
    estado,
    entrada: vi.fn(),
    restablecer: vi.fn(),
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
  getPayload: async () => ({ login: entrada, resetPassword: restablecer }),
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
  restablecer.mockReset()
  restablecer.mockResolvedValue({ token: 'testigo-firmado', user: { activo: true, rol: 'lector' } })
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

  it('la de vista previa se borra en el prefijo, que es donde la escribe su ruta', async () => {
    // Las dos cookies se mudaron al prefijo a la vez: `api/vista-previa/route.ts`
    // la fija con `path: PREFIJO || '/'`. Borrarla en otro path no caduca nada,
    // y la sesión siguiente empezaría simulando el rol de la anterior.
    const { salir } = await cargarAcciones('/traumahub')
    await salir()

    const borrada = estado.escrituras.find(
      (e) => e.operacion === 'delete' && e.nombre === 'vista-previa-rol',
    )
    expect(borrada?.opciones?.path).toBe('/traumahub')
  })

  it('al entrar también la borra en el prefijo: una sesión nueva no hereda la simulación', async () => {
    const { entrar } = await cargarAcciones('/traumahub')
    await entrar('traumatologo@hospital.cl', 'una-contrasena-larga')

    const borrada = estado.escrituras.find(
      (e) => e.operacion === 'delete' && e.nombre === 'vista-previa-rol',
    )
    expect(borrada?.opciones?.path).toBe('/traumahub')
  })

  it('en desarrollo, sin prefijo, la de vista previa sigue siendo la raíz', async () => {
    const { salir } = await cargarAcciones('')
    await salir()

    const borrada = estado.escrituras.find(
      (e) => e.operacion === 'delete' && e.nombre === 'vista-previa-rol',
    )
    expect(borrada?.opciones?.path).toBe('/')
  })
})

/**
 * Lo que lee quien tiene cuenta pero todavía no se la han activado.
 *
 * Desde que el gancho `beforeLogin` de la colección rechaza esa cuenta —para
 * cerrar también `POST /api/usuarios/login`—, `payload.login` ya no devuelve:
 * lanza. Sin esta traducción, ese rechazo caía en el `catch` genérico y la
 * pantalla contestaba «Correo o contraseña incorrectos», que es falso y manda al
 * residente a probar contraseñas en vez de a pedir que le activen la cuenta.
 */
describe('la cuenta sin activar', { timeout: 30_000 }, () => {
  it('se explica con su motivo y no como una contraseña mala', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { entrar } = await cargarAcciones('/traumahub')
    // La clase se pide DESPUÉS de cargar la acción, y no con un `import` de
    // arriba: `cargarAcciones` hace `vi.resetModules()`, así que `sesion.ts`
    // trabaja con una copia nueva del módulo de la colección y el `instanceof`
    // contra la copia vieja daría falso. El caso quedaría verde por el motivo
    // equivocado —el mensaje genérico también es un fallo— si no fuera por la
    // aserción del texto.
    const { CuentaDesactivada, MENSAJE_CUENTA_DESACTIVADA } = await import('@/collections/Usuarios')
    entrada.mockRejectedValue(new CuentaDesactivada())

    const respuesta = await entrar('residente@hospital.cl', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe(MENSAJE_CUENTA_DESACTIVADA)
    // Y no se escribe ninguna cookie: no hay sesión que abrir.
    expect(estado.escrituras.filter((e) => e.operacion === 'set')).toHaveLength(0)
    consola.mockRestore()
  })

  // `payload.resetPassword` corre el mismo gancho `beforeLogin`
  // (`auth/operations/resetPassword.js`), así que la pantalla de clave nueva
  // recibe el mismo rechazo que la de entrada. El `catch` que había allí se lo
  // tragaba y contestaba «el enlace caducó o ya se usó»: un mensaje falso, que
  // manda a pedir otro enlace que fallará igual —y sin SMTP ese enlace lo emite
  // un administrador a mano y dura una hora—.
  it('al fijar la clave nueva tampoco se disfraza de enlace caducado', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fijarClaveNueva } = await cargarAcciones('/traumahub')
    const { CuentaDesactivada, MENSAJE_CUENTA_DESACTIVADA } = await import('@/collections/Usuarios')
    restablecer.mockRejectedValue(new CuentaDesactivada())

    const respuesta = await fijarClaveNueva('un-testigo-largo-de-verdad', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe(MENSAJE_CUENTA_DESACTIVADA)
    expect(estado.escrituras.filter((e) => e.operacion === 'set')).toHaveLength(0)
    consola.mockRestore()
  })

  // El resto de fallos de `resetPassword` —el testigo gastado o vencido, que es
  // el caso corriente— sigue saliendo como antes: la traducción de arriba no
  // puede convertir cualquier tropiezo en «active la cuenta».
  it('el testigo gastado sigue diciendo que el enlace caducó', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fijarClaveNueva } = await cargarAcciones('/traumahub')
    restablecer.mockRejectedValue(new Error('Token is either invalid or has expired.'))

    const respuesta = await fijarClaveNueva('un-testigo-largo-de-verdad', 'una-contrasena-larga')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe('El enlace caducó o ya se usó. Pida uno nuevo.')
    consola.mockRestore()
  })
})
