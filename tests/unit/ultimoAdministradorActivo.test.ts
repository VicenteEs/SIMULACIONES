import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrations } from '@/migrations'
import { Usuarios } from '@/collections/Usuarios'

/**
 * El disparador que impide que la plataforma se quede sin administrador activo.
 *
 * Aquí no hay PostgreSQL, así que no se comprueba el comportamiento sino la
 * forma del SQL, y eso pide una justificación. Esta migración es de las que
 * nadie ve funcionar antes de desplegarla: en desarrollo manda el `push` de
 * Drizzle (`payload.config.ts`), que no aplica migraciones y no sabe de
 * disparadores, así que el archivo solo se ejecuta en el servidor. Y las tres
 * piezas que lo hacen correcto —el aplazamiento, el cerrojo de aviso y la
 * condición del `WHEN`— tienen todas la misma pinta cuando se quitan: el
 * disparador sigue creándose, sigue rechazando el caso evidente de un solo
 * administrador, y lo único que se pierde es justo lo que esta migración existe
 * para arreglar. Un borrado «de limpieza» en cualquiera de las tres no rompe
 * nada visible, y por eso quedan atadas aquí.
 *
 * El comportamiento sí se comprobó a mano, contra una base desechable de
 * PostgreSQL 17: dos sesiones desactivando cada una a un administrador distinto
 * a la vez, la primera en confirmar pasa y la segunda se deshace con el error.
 * Ver la cabecera de la migración.
 *
 * El último bloque es la excepción, y por eso lleva simulacros: no mira el SQL
 * sino lo que el panel le dice a quien pierde esa carrera cuando la ven antes
 * que la base la comprobación de la acción o el gancho de la colección.
 */

// Los simulacros solo sirven al último bloque, el de lo que el panel le dice a
// quien pierde la carrera antes de llegar a la base. No tocan a los de arriba:
// `@/migrations` trae `sql` de `@payloadcms/db-postgres`, que vive en
// `node_modules` y no pasa por estos simulacros, y `Usuarios` solo importa
// tipos de `payload`.
const { buscarPorId, actualizar, borrar, contar } = vi.hoisted(() => ({
  buscarPorId: vi.fn(),
  actualizar: vi.fn(),
  borrar: vi.fn(),
  contar: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: 'admin', activo: true },
    activo: true,
    rolReal: 'admin',
    rol: 'admin',
    simulando: false,
    usuarioEfectivo: { id: 1, rol: 'admin', activo: true },
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


const NOMBRE = '20260913_043401_ultimo_administrador_activo'

const fuente = readFileSync(join(process.cwd(), 'src', 'migrations', `${NOMBRE}.ts`), 'utf8')

/**
 * El SQL del archivo, sin la cabecera y sin saltos de línea.
 *
 * Sin el recorte, la propia explicación de por qué el disparador va aplazado
 * cuenta como una aparición más de `DEFERRABLE INITIALLY DEFERRED` y las cuentas
 * de abajo dejan de decir lo que creen decir. El aplanado de espacios es para
 * poder buscar una cláusula que en el archivo ocupa cuatro líneas.
 */
const seguido = fuente.slice(fuente.indexOf('export async function up')).replace(/\s+/g, ' ')

describe('la migración del último administrador activo está donde se aplica', () => {
  it('está registrada en el índice', () => {
    // `prodMigrations` recibe esa lista y es lo único que corre en el servidor.
    // Un archivo suelto que nadie importa no se aplica nunca y no avisa.
    expect(migrations.map((m) => m.name)).toContain(NOMBRE)
  })

  it('va después de la que crea el índice único de actividad', () => {
    // No porque dependa de ella, sino porque el orden de la lista es el de
    // aplicación y el nombre lleva la fecha: una migración fuera de sitio rompe
    // a la siguiente que sí dependa de la anterior.
    const nombres = migrations.map((m) => m.name)
    expect(nombres.indexOf(NOMBRE)).toBeGreaterThan(
      nombres.indexOf('20260913_033442_actividad_una_fila_por_ficha'),
    )
  })
})

describe('las tres piezas que cierran la carrera', () => {
  it('los dos disparadores son de restricción y están aplazados', () => {
    // Sin `DEFERRABLE INITIALLY DEFERRED` la comprobación se hace al escribir la
    // fila y no al confirmar, y entonces pasan dos cosas: vuelve la carrera de
    // dos administradores que se desactivan a la vez —ninguno ve el cambio del
    // otro—, y deja de poder relevarse a un administrador en una sola
    // transacción, porque el estado intermedio de «ninguno activo» sería ya un
    // rechazo.
    const aplazados = seguido.match(/DEFERRABLE INITIALLY DEFERRED/g) ?? []
    expect(aplazados).toHaveLength(2)
    expect(seguido.match(/CREATE CONSTRAINT TRIGGER/g) ?? []).toHaveLength(2)
  })

  it('la comprobación toma el cerrojo de aviso antes de contar', () => {
    // Aplazar sola no basta: dos transacciones pueden confirmar a la vez y
    // contar las dos antes de que ninguna se haya hecho visible. El cerrojo las
    // pone en fila, así que la segunda cuenta cuando la primera ya está
    // confirmada. Se suelta solo al terminar la transacción.
    expect(seguido).toContain('PERFORM pg_advisory_xact_lock(')
    expect(seguido.indexOf('pg_advisory_xact_lock')).toBeLessThan(
      seguido.indexOf('SELECT count(*) INTO quedan'),
    )
  })

  it('solo mira cuando la fila dejaba de ser administrador activo', () => {
    // Lo que se impide es el paso de «hay al menos uno» a «no hay ninguno», no
    // el estado en sí. Un disparador que mirara el estado a secas dejaría sin
    // reparación posible una instalación que ya estuviera sin administradores
    // activos: cualquier escritura sobre la tabla fallaría, incluida la que
    // viniera a arreglarlo.
    //
    // De paso, es lo que evita que cada inicio de sesión de un administrador
    // —`afterLogin` escribe `ultimoAcceso`— pague el recuento y el cerrojo.
    expect(seguido).toContain(
      `WHEN ( OLD."rol" = 'admin' AND OLD."activo" = true AND (NEW."rol" IS DISTINCT FROM 'admin' OR NEW."activo" IS DISTINCT FROM true) )`,
    )
    expect(seguido).toContain(`WHEN (OLD."rol" = 'admin' AND OLD."activo" = true) EXECUTE FUNCTION`)
  })

  it('el rechazo viaja con el SQLSTATE que el panel reconoce', () => {
    // PostgreSQL no lanza un `APIError` de Payload, y su texto —el del
    // `RAISE`, que manda a «crear otro administrador»— no es verdad para quien
    // lo recibe desde el panel. `acciones/admin.ts` reconoce el rechazo por
    // este código y lo cambia por su propia explicación, sin comparar frases,
    // que es lo que se rompe en silencio en cuanto alguien reescribe una.
    //
    // Por eso se comprueba contra la constante del panel y no contra un número
    // escrito aquí: cambiar el `ERRCODE` sin tocar `SIN_ADMINISTRADORES_ACTIVOS`
    // devolvería al panel el SQL en crudo, y ninguna de las dos pruebas por
    // separado lo vería.
    const codigo = /USING ERRCODE = '(\d{5})'/.exec(seguido)?.[1]
    expect(codigo).toBe('23514')
    const panel = readFileSync(
      join(process.cwd(), 'src', 'app', '(frontend)', 'acciones', 'admin.ts'),
      'utf8',
    )
    expect(/const SIN_ADMINISTRADORES_ACTIVOS = '(\d{5})'/.exec(panel)?.[1]).toBe(codigo)
  })
})

describe('deshacerla no deja la base a medias', () => {
  it('suelta los disparadores antes que la función', () => {
    // Al revés no se puede: PostgreSQL no deja soltar una función mientras un
    // disparador la use, y la migración moriría a la mitad dejando puesto lo
    // que venía a quitar.
    const funcion = seguido.indexOf('DROP FUNCTION')
    expect(funcion).toBeGreaterThan(-1)
    expect(seguido.indexOf('DROP TRIGGER')).toBeLessThan(funcion)
    expect(seguido.match(/DROP TRIGGER IF EXISTS/g) ?? []).toHaveLength(2)
  })
})

describe('los guardias de la aplicación siguen puestos', () => {
  it('la colección conserva sus dos ganchos de autobloqueo', () => {
    // El disparador es la red de la carrera, no la puerta de todos los días:
    // solo existe en el servidor y no sabe distinguir «a sí mismo» de «al
    // último», ni decirlo en español. Y lo que rechaza no siempre se entera
    // nadie: el adaptador de Payload se traga el error del `COMMIT`, así que
    // un guion de mantenimiento que desactivara al último administrador vería
    // su `payload.update` resolver sin fallo. Quitar los ganchos porque «ya lo
    // mira la base» dejaría ese guion creyendo que hizo lo que no hizo, y en
    // desarrollo sin ninguna comprobación.
    const antesDeCambiar = Usuarios.hooks?.beforeChange ?? []
    const antesDeBorrar = Usuarios.hooks?.beforeDelete ?? []
    expect(antesDeCambiar.length).toBeGreaterThanOrEqual(2)
    expect(antesDeBorrar.length).toBeGreaterThanOrEqual(1)
  })
})

/**
 * La misma carrera, cuando la ven antes que la base.
 *
 * El disparador no es la única puerta por la que llega. `exigirQueQuedeUnAdmin`
 * cuenta antes de escribir y el gancho de la colección vuelve a contar dentro de
 * la escritura, y los dos pueden ser los primeros en ver que la otra sesión ya
 * confirmó. Desde el panel, ninguno de los dos frena nunca el caso evidente
 * —quien llama no puede ser la cuenta tocada y `exigirAdmin` lo acaba de leer
 * administrador, así que el conteo lo incluye—: si dan cero, es que a quien
 * llama le acaban de retirar el acceso. Sus mensajes decían «es el único
 * administrador activo» y «Cree otro administrador», y eso es exactamente lo
 * falso que el disparador dejó de decir.
 */
describe('la carrera que ven los guardias de la aplicación', () => {
  const QUIEN_LLAMA = '1'
  const OBJETIVO = { id: 9, email: 'otra@hospital.cl', rol: 'admin', activo: true }
  const RETIRADO = { id: 1, email: 'yo@hospital.cl', rol: 'admin', activo: false }

  const laBaseTiene = (quienLlama: Record<string, unknown> | null) =>
    buscarPorId.mockImplementation(async ({ id }: { id: string }) =>
      id === QUIEN_LLAMA ? quienLlama : OBJETIVO,
    )

  /** Lo que lanza `impedirAutobloqueo` cuando cuenta cero: un `Error` sin código. */
  const delGancho = () =>
    new Error(
      'Es el único administrador activo: la plataforma quedaría sin nadie que pueda ' +
        'gestionar cuentas. Cree otro administrador antes de hacer este cambio.',
    )

  const ACCIONES = [
    { nombre: 'desactivar', llamar: () => cambiarActivoUsuario('9', false), escritura: actualizar },
    {
      nombre: 'quitar el rol',
      llamar: () => actualizarUsuario('9', { rol: 'lector' }),
      escritura: actualizar,
    },
    { nombre: 'eliminar', llamar: () => eliminarUsuario('9'), escritura: borrar },
  ] as const

  beforeEach(() => {
    for (const simulacro of [buscarPorId, actualizar, borrar, contar]) simulacro.mockReset()
    actualizar.mockResolvedValue({ id: 9 })
    borrar.mockResolvedValue({ id: 9 })
    contar.mockResolvedValue({ totalDocs: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(ACCIONES)('$nombre: la comprobación previa le dice a quién retiraron', async (caso) => {
    contar.mockResolvedValue({ totalDocs: 0 })
    laBaseTiene(RETIRADO)

    const respuesta = await caso.llamar()

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('otra sesión le retiró a usted el acceso de administrador')
    expect(respuesta.mensaje).toContain('no se cambió nada')
    expect(respuesta.mensaje).toMatch(/Ya no puede gestionar cuentas desde aquí\.$/)
    expect(respuesta.mensaje).not.toMatch(/único administrador|Cree otro administrador|recargue/i)
    // Leído, no deducido: la cuenta que se mira es la de quien llama.
    expect(buscarPorId).toHaveBeenCalledWith(expect.objectContaining({ id: QUIEN_LLAMA }))
    // Y se para antes de escribir, que es para lo que está.
    expect(caso.escritura).not.toHaveBeenCalled()
  })

  it('si quien llama se lee otra vez administrador, no se le atribuye nada', async () => {
    // El conteo y la lectura se contradicen: alguien lo cambió entre medias, y
    // no se sabe quién. Se dice lo que dio el conteo y se manda a la lista.
    contar.mockResolvedValue({ totalDocs: 0 })
    laBaseTiene({ id: 1, rol: 'admin', activo: true })

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('no se cambió nada')
    expect(respuesta.mensaje).toContain('Recargue la lista')
    expect(respuesta.mensaje).not.toMatch(/le retiró a usted|Cree otro administrador/)
    expect(actualizar).not.toHaveBeenCalled()
  })

  it.each(ACCIONES)('$nombre: el corte del gancho se explica igual', async (caso) => {
    // La comprobación previa todavía ve a quien llama; dentro de la escritura,
    // el gancho ya no. Después, la cuenta tocada sigue siendo la última.
    contar.mockResolvedValueOnce({ totalDocs: 1 }).mockResolvedValue({ totalDocs: 0 })
    caso.escritura.mockRejectedValue(delGancho())
    laBaseTiene(RETIRADO)

    const respuesta = await caso.llamar()

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('otra sesión le retiró a usted el acceso de administrador')
    expect(respuesta.mensaje).toContain('otra@hospital.cl sigue siendo administrador')
    expect(respuesta.mensaje).not.toMatch(/Cree otro administrador|único administrador/)
    // El del gancho no se pierde: `accion()` lo anota entero con su causa.
    const anotado = vi.mocked(console.error).mock.calls.at(-1)?.[1] as Error
    expect((anotado.cause as Error).message).toMatch(/Cree otro administrador/)
  })

  it('un fallo con la cuenta tocada fuera de peligro no se disfraza de carrera', async () => {
    // Quedan otros administradores: sea lo que sea, no es esto.
    const otro = new Error('duplicate key value violates unique constraint')
    actualizar.mockRejectedValue(otro)
    laBaseTiene(RETIRADO)

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.mensaje).toBe(otro.message)
  })

  it('si la lectura que tendría que explicarlo falla, sale el fallo original', async () => {
    // Una base que no contesta rompe la escritura y rompe también la relectura:
    // cambiar un error por el de la lectura, o por una carrera que nadie vio,
    // sería esconder lo único que se sabe.
    const caida = new Error('Connection terminated unexpectedly')
    actualizar.mockRejectedValue(caida)
    buscarPorId.mockRejectedValue(new Error('otra conexión caída'))

    const respuesta = await cambiarActivoUsuario('9', false)

    expect(respuesta.mensaje).toBe(caida.message)
  })
})
