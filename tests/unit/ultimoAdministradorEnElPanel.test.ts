import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * El rechazo del último administrador, contado en español y sin mentir.
 *
 * Desde la migración `20260913_043401_ultimo_administrador_activo` la base se
 * niega a confirmar un cambio que deje la plataforma sin administradores
 * activos. El panel tenía que traducir ese rechazo, y al ir a hacerlo apareció
 * algo peor que un mensaje en crudo: con la transacción de Payload por medio
 * —que es como escriben las tres acciones— el rechazo **no llega**. El
 * disparador es diferido, salta en el `COMMIT`, y el adaptador de Payload se
 * traga el error de ese `COMMIT`. `payload.update` resuelve, el panel pinta
 * «Se retiró el acceso» en verde y la cuenta sigue activa.
 *
 * Lo primero de abajo fija ese hecho con el propio código del adaptador, porque
 * es lo que justifica releer la cuenta después de cada escritura. El resto
 * comprueba las dos vías por las que el rechazo puede aparecer.
 *
 * Contra un PostgreSQL 17 de verdad se comprobó lo mismo: una tabla temporal con
 * un disparador de restricción diferido que lanza 23514, un `UPDATE` dentro de
 * `beginTransaction` y un `commitTransaction` que resolvió sin lanzar, con la
 * fila todavía en su valor original. Y sin transacción, el mismo `UPDATE` lanzó
 * un `DrizzleQueryError` con el `code` en `cause` y no arriba.
 */

const { estado, buscarPorId, actualizar, borrar, contar } = vi.hoisted(() => ({
  estado: { rolReal: 'admin' as string },
  buscarPorId: vi.fn(),
  actualizar: vi.fn(),
  borrar: vi.fn(),
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
    update: actualizar,
    delete: borrar,
    count: contar,
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  actualizarUsuario,
  cambiarActivoUsuario,
  eliminarUsuario,
} from '@/app/(frontend)/acciones/admin'

/** Lo que lanza Drizzle cuando la base rechaza la escritura sin transacción. */
function rechazoDeLaBase(codigo: string): Error {
  const dePg = Object.assign(
    new Error(
      'La plataforma quedaría sin ningún administrador activo: cree otro administrador antes de desactivar o eliminar el último.',
    ),
    { code: codigo },
  )
  return Object.assign(
    new Error('Failed query: update "usuarios" set "activo" = $1 where "usuarios"."id" = $2\nparams: false,9'),
    { cause: dePg },
  )
}

/** El `id` con el que el simulacro de sesión identifica a quien llama. */
const QUIEN_LLAMA = '1'

/**
 * Qué devuelve la base al leer cada cuenta.
 *
 * Por `id` y no con un único valor, porque desde que el rechazo se explica
 * según quien llama se leen dos cuentas distintas: con un solo valor para las
 * dos, la prueba no distinguiría leer la cuenta tocada de leer la propia, que es
 * justo el cableado que hay que fijar.
 */
function laBaseTiene(cuentas: {
  objetivo: Record<string, unknown> | null
  quienLlama: Record<string, unknown> | null
}) {
  buscarPorId.mockImplementation(async ({ id }: { id: string }) =>
    id === QUIEN_LLAMA ? cuentas.quienLlama : cuentas.objetivo,
  )
}

const OBJETIVO_INTACTO = { id: 9, email: 'otra@hospital.cl', rol: 'admin', activo: true }
const RETIRADO_POR_OTRA_SESION = { id: 1, email: 'yo@hospital.cl', rol: 'admin', activo: false }

/** Las tres acciones que pueden toparse con el disparador, con lo que intentan. */
const ACCIONES = [
  {
    nombre: 'desactivar',
    queSeIntenta: 'desactivar esta cuenta',
    llamar: () => cambiarActivoUsuario('9', false),
    escritura: actualizar,
  },
  {
    nombre: 'quitar el rol',
    queSeIntenta: 'cambiarle el rol',
    llamar: () => actualizarUsuario('9', { rol: 'lector' }),
    escritura: actualizar,
  },
  {
    nombre: 'eliminar',
    queSeIntenta: 'eliminar esta cuenta',
    llamar: () => eliminarUsuario('9'),
    escritura: borrar,
  },
] as const

beforeEach(() => {
  estado.rolReal = 'admin'
  for (const simulacro of [buscarPorId, actualizar, borrar, contar]) simulacro.mockReset()
  actualizar.mockResolvedValue({ id: 9 })
  borrar.mockResolvedValue({ id: 9 })
  contar.mockResolvedValue({ totalDocs: 1 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('por qué hay que releer la cuenta', () => {
  it('el adaptador de Payload se traga el error del COMMIT', async () => {
    // Si esto deja de pasar —Payload propaga el error—, el rechazo empezará a
    // salir de la propia llamada y lo recogerá la otra rama de
    // `escribirSinDejarSinAdministradores`. La relectura puede quedarse: cuesta
    // una consulta y cubre cualquier otro `COMMIT` que falle en silencio.
    const carpeta = join(process.cwd(), 'node_modules', '@payloadcms', 'drizzle', 'dist', 'transactions')
    const { beginTransaction } = await import(pathToFileURL(join(carpeta, 'beginTransaction.js')).href)
    const { commitTransaction } = await import(pathToFileURL(join(carpeta, 'commitTransaction.js')).href)

    // La forma de `transaction` en `drizzle-orm/node-postgres/session.js`:
    // espera al `BEGIN`, corre el cuerpo, confirma, y si la confirmación falla
    // deshace y lanza. La espera del `BEGIN` no es adorno: el adaptador enlaza
    // sus manejadores después de llamar a `transaction`, y un cuerpo que
    // corriera en el mismo tic los encontraría sin definir.
    const drizzle = {
      transaction: async (cuerpo: (tx: object) => Promise<void>) => {
        await new Promise((listo) => setTimeout(listo, 0))
        await cuerpo({})
        throw rechazoDeLaBase('23514')
      },
    }
    const adaptador = {
      drizzle,
      sessions: {} as Record<string, unknown>,
      initializing: Promise.resolve(),
      payload: { logger: { error: () => {} } },
    }

    const id = await beginTransaction.call(adaptador)
    await expect(commitTransaction.call(adaptador, id)).resolves.toBeUndefined()
  })
})

describe('la base deshace el cambio y la llamada dice que fue bien', () => {
  it.each(ACCIONES)('$nombre: se lee la cuenta, se ve intacta y se explica', async (caso) => {
    // Primer conteo: la comprobación previa, que todavía ve a otro
    // administrador activo. Segundo: el de después, cuando la otra sesión ya
    // confirmó y la cuenta tocada era la última. Esa otra sesión retiró a quien
    // llama: es la única forma de que la base rechace, porque nadie puede
    // retirarse a sí mismo y el disparador cuenta a todos.
    contar.mockResolvedValueOnce({ totalDocs: 1 }).mockResolvedValueOnce({ totalDocs: 0 })
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: RETIRADO_POR_OTRA_SESION })

    const respuesta = await caso.llamar()

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain(`No se pudo ${caso.queSeIntenta}`)
    expect(respuesta.mensaje).toContain('otra sesión le retiró a usted el acceso de administrador')
    expect(respuesta.mensaje).toContain('otra@hospital.cl sigue siendo administrador')
    expect(respuesta.mensaje).toContain('ya no puede gestionar cuentas desde aquí')
    // Lo que decía antes, y era falso para quien lo leía: ya no puede crear
    // cuentas, y el administrador retirado era él.
    expect(respuesta.mensaje).not.toMatch(/Cree otro administrador|retirado a otro administrador/)
    // Se leyó la cuenta de quien llama, y no se dedujo de la tocada.
    expect(buscarPorId).toHaveBeenCalledWith(expect.objectContaining({ id: QUIEN_LLAMA }))
    // Y no se repara nada: no hay nada que reparar, la base ya lo deshizo.
    expect(caso.escritura).toHaveBeenCalledTimes(1)
  })

  it('una cuenta propia que otra sesión borró cuenta igual como acceso perdido', async () => {
    contar.mockResolvedValueOnce({ totalDocs: 1 }).mockResolvedValueOnce({ totalDocs: 0 })
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: null })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.mensaje).toContain('le retiró a usted el acceso de administrador')
  })

  it('no afirma que la cuenta tocada sigue siendo administradora si no lo ve', async () => {
    // Caso del 23514 que sí llega: aquí la cuenta tocada se lee para el
    // mensaje, y una tercera sesión pudo cambiarla entre el COMMIT y la lectura.
    actualizar.mockRejectedValue(rechazoDeLaBase('23514'))
    laBaseTiene({
      objetivo: { ...OBJETIVO_INTACTO, activo: false },
      quienLlama: RETIRADO_POR_OTRA_SESION,
    })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.mensaje).not.toContain('sigue siendo administrador')
    expect(respuesta.mensaje).toMatch(/sin ninguno\. Ya no puede gestionar cuentas desde aquí\.$/)
  })

  it('si no era la última, no se le inventa esa causa', async () => {
    // El `COMMIT` puede fallar por otros motivos, y el adaptador se los traga
    // igual. Lo único cierto entonces es que la base no confirmó.
    contar.mockResolvedValue({ totalDocs: 2 })
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: { id: 1, rol: 'admin', activo: true } })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/la base no confirmó el cambio/)
    expect(respuesta.mensaje).not.toMatch(/Cree otro administrador|le retiró a usted/)
  })

  it('cuando el cambio sí quedó, contesta que sí', async () => {
    buscarPorId.mockResolvedValue({ id: 9, rol: 'admin', activo: false })
    expect((await cambiarActivoUsuario('9', false)).exito).toBe(true)

    buscarPorId.mockResolvedValue({ id: 9, rol: 'lector', activo: true })
    expect((await actualizarUsuario('9', { rol: 'lector' })).exito).toBe(true)

    buscarPorId.mockResolvedValue(null)
    expect((await eliminarUsuario('9')).exito).toBe(true)
  })

  it('lo que no puede tocar el disparador no paga la relectura', async () => {
    // Activar una cuenta o cambiarle el nombre no deja a nadie sin
    // administradores: releer ahí sería una consulta por clic para nada.
    await cambiarActivoUsuario('9', true)
    await actualizarUsuario('9', { nombre: 'Otro nombre' })
    await actualizarUsuario('9', { rol: 'admin' })
    expect(buscarPorId).not.toHaveBeenCalled()
  })
})

describe('la base rechaza y el rechazo sí llega', () => {
  it.each(ACCIONES)('$nombre: el 23514 se cuenta en español', async (caso) => {
    caso.escritura.mockRejectedValue(rechazoDeLaBase('23514'))
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: RETIRADO_POR_OTRA_SESION })

    const respuesta = await caso.llamar()

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain(`No se pudo ${caso.queSeIntenta}`)
    expect(respuesta.mensaje).toContain('le retiró a usted el acceso de administrador')
    expect(respuesta.mensaje).toContain('otra@hospital.cl sigue siendo administrador')
    // Lo que llegaba antes: el SQL de Drizzle con sus parámetros.
    expect(respuesta.mensaje).not.toMatch(/Failed query|usuarios"|params/)
    expect(buscarPorId).toHaveBeenCalledWith(expect.objectContaining({ id: QUIEN_LLAMA }))
  })

  it('si quien llama volvió a ser administrador, no se le manda a crear a nadie', async () => {
    // Una tercera sesión lo reactivó entre el COMMIT y la lectura. En ese
    // momento hay al menos dos administradores —él y la cuenta que no se tocó—,
    // así que «cree otro administrador» sería un consejo falso: basta con
    // recargar y repetir.
    actualizar.mockRejectedValue(rechazoDeLaBase('23514'))
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: { id: 1, rol: 'admin', activo: true } })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('no se cambió nada')
    expect(respuesta.mensaje).toContain('recargue la lista')
    expect(respuesta.mensaje).not.toMatch(/Cree otro administrador|le retiró a usted/)
  })

  it('el error original no se pierde del registro', async () => {
    actualizar.mockRejectedValue(rechazoDeLaBase('23514'))
    laBaseTiene({ objetivo: OBJETIVO_INTACTO, quienLlama: RETIRADO_POR_OTRA_SESION })
    await cambiarActivoUsuario('9', false)

    // `accion()` anota lo que se lanza; el original tiene que ir en `cause`
    // para que quien lea el registro vea la consulta que rechazó la base.
    const anotado = vi.mocked(console.error).mock.calls.at(-1)?.[1] as Error
    expect(anotado.cause).toBeInstanceOf(Error)
    expect(String((anotado.cause as Error).message)).toMatch(/Failed query/)
  })

  it('otro fallo de la base sigue su camino sin disfrazarse', async () => {
    // Un 23505 (clave repetida) o un fallo de conexión no tienen nada que ver
    // con los administradores. Llamarlos así mandaría a crear una cuenta que no
    // arregla nada.
    const otro = rechazoDeLaBase('08006')
    actualizar.mockRejectedValue(otro)

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe(otro.message)
  })
})

describe('el cableado', () => {
  const sinComentarios = (ruta: string): string =>
    readFileSync(join(process.cwd(), ruta), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      .replace(/\s+/g, ' ')

  it('las tres acciones pasan por la escritura vigilada y nadie escribe usuarios por fuera', () => {
    const codigo = sinComentarios(join('src', 'app', '(frontend)', 'acciones', 'admin.ts'))
    expect(codigo.match(/escribirSinDejarSinAdministradores\(/g) ?? []).toHaveLength(4)
    for (const queSeIntenta of ['desactivar esta cuenta', 'cambiarle el rol', 'eliminar esta cuenta']) {
      // Con `usuarioId` delante: sin él, el rechazo no puede saber que la
      // cuenta retirada era la de quien llama y vuelve al mensaje falso.
      expect(codigo).toContain(
        `escribirSinDejarSinAdministradores( payload, objetivo, usuarioId, '${queSeIntenta}'`,
      )
    }
    // Un `payload.delete` de cuentas suelto, fuera de la envoltura, volvería a
    // pintar en verde un borrado que la base deshizo.
    expect(codigo.match(/payload\.delete\(\{ collection: 'usuarios'/g) ?? []).toHaveLength(1)
    expect(codigo).toMatch(/\(\) => payload\.delete\(\{ collection: 'usuarios'/)
  })

  it('la tabla de cuentas no recarga tras un rechazo y trae el aviso a la vista', () => {
    const tabla = sinComentarios(
      join('src', 'app', '(frontend)', 'admin-panel', 'usuarios', 'TablaUsuarios.tsx'),
    )
    // Quien recibe el rechazo del último administrador ya no lo es: recargar
    // pasa por `exigirPanel('admin')`, redirige al inicio y desmonta la tabla
    // con el aviso dentro. El único `router.refresh()` de `ejecutar` es el del
    // éxito, y la rama del rechazo termina en su `setAviso`.
    const cuerpo = tabla.slice(tabla.indexOf('const ejecutar ='), tabla.indexOf('const pedirEnlace ='))
    expect(cuerpo.match(/router\.refresh\(\)/g) ?? []).toHaveLength(1)
    expect(cuerpo).toMatch(/setAviso\(\{ tipo: 'ok', texto: exitoso \}\) router\.refresh\(\)/)
    expect(cuerpo).toMatch(
      /\} else \{ setAviso\(\{ tipo: 'error', texto: resultado\.mensaje \?\? '[^']*' \}\) \} \} catch/,
    )
    expect(tabla).toContain('<div role="status" ref={regionDeAvisos}>')
    expect(tabla).toContain("regionDeAvisos.current?.scrollIntoView({ block: 'nearest' })")
  })
})
