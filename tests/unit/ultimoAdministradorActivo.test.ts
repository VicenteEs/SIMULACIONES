import { describe, it, expect } from 'vitest'
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
 */

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

  it('el rechazo viaja con SQLSTATE 23514', () => {
    // PostgreSQL no lanza un `APIError` de Payload, así que el panel lo enseña
    // como un fallo de servidor sin traducir. El código es lo que permitirá
    // reconocerlo en `acciones/admin.ts` —pendiente, ese archivo no es de este
    // lote— sin comparar el texto del mensaje, que es lo que se rompe en
    // silencio en cuanto alguien reescribe una frase.
    expect(seguido).toContain(`USING ERRCODE = '23514'`)
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
    // último», ni decirlo en español. Quitar los ganchos porque «ya lo mira la
    // base» dejaría al administrador con un 500 sin explicación, y en
    // desarrollo sin ninguna comprobación.
    const antesDeCambiar = Usuarios.hooks?.beforeChange ?? []
    const antesDeBorrar = Usuarios.hooks?.beforeDelete ?? []
    expect(antesDeCambiar.length).toBeGreaterThanOrEqual(2)
    expect(antesDeBorrar.length).toBeGreaterThanOrEqual(1)
  })
})
