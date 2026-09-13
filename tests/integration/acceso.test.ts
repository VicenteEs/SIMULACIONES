import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Payload } from 'payload'

/**
 * Pruebas de integración: exigen PostgreSQL en marcha.
 *
 * Comprueban lo que las unitarias no alcanzan: que la política de acceso llegue
 * hasta la consulta y no se quede en la interfaz. Un panel bien protegido sobre
 * una API abierta es el error clásico de este tipo de plataforma.
 *
 * La conexión se intenta al cargar el archivo y no en un `beforeAll`: las
 * condiciones de `describe` se evalúan durante la recolección, de modo que
 * decidir allí con una variable llenada más tarde dejaría el bloque omitido
 * para siempre, incluso con la base disponible.
 *
 * ## Por qué la omisión ya no es gratis
 *
 * Antes, cualquier fallo de conexión anulaba el archivo entero y `npx vitest
 * run` —el mandato de «Antes de subir» de AGENTS.md— salía en verde con las
 * seis pruebas desaparecidas y código de salida 0. Bastaba un `.env` sin
 * `PAYLOAD_SECRET`, el contenedor de Postgres apagado o un clon recién hecho
 * para que quien iba a desplegar creyera haber comprobado el control de acceso
 * sin haber comprobado nada. El `console.warn` que lo avisaba ni siquiera se
 * veía: Vitest no lo imprime cuando sale durante la recolección.
 *
 * Estas seis son las únicas pruebas que comprueban que la política de acceso
 * llega hasta la consulta, así que la omisión tiene que ser deliberada y nunca
 * ambiental. La política es de tres estados:
 *
 *   - sin nada puesto: si la base no responde, la guardia de más abajo falla
 *     en rojo con la causa. Es el caso que protege al que está por desplegar.
 *   - `OMITIR_INTEGRACION=1`: permiso explícito para trabajar sin base. Se
 *     omiten y el resultado queda verde, porque alguien lo escribió a mano.
 *   - `CI` o `EXIGIR_INTEGRACION=1`: obligatorias. Aquí el permiso anterior no
 *     vale, para que nadie lo cuele en el entorno del servidor de integración.
 *
 * No se convirtió el fallo en un `throw` durante la recolección porque eso
 * tumba el archivo completo sin nombre de prueba ni causa legible: la guardia
 * da una línea roja que se explica sola.
 */

type IntentoDeConexion = { payload: Payload; fallo: null } | { payload: null; fallo: string }

const intento: IntentoDeConexion = await (async (): Promise<IntentoDeConexion> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return { payload: await getPayload({ config }), fallo: null }
  } catch (error) {
    // Cuando Postgres no responde, el adaptador de Payload no se limita a
    // lanzar: antes rechaza su promesa interna `initializing`
    // (`@payloadcms/db-postgres/dist/connect.js`, `rejectInitializing`), que
    // nadie espera. Vitest la recoge como «Unhandled Rejection» y devuelve 1
    // aunque las seis pruebas queden omitidas con permiso, de modo que
    // `OMITIR_INTEGRACION=1` no servía de nada justo en el caso para el que se
    // escribió: el contenedor apagado. Con `PAYLOAD_SECRET` vacío no se nota,
    // porque ese fallo ocurre antes de conectar y no deja rechazo pendiente.
    //
    // El silenciador se instala solo en esta rama, y solo tapa lo que llegue
    // después de haber fallado la conexión: aquí ya se sabe que las seis
    // pruebas van a quedar omitidas, así que no hay rechazo legítimo que
    // esconder. Subirlo al ámbito del archivo, o a `vitest.config.ts` con
    // `dangerouslyIgnoreUnhandledErrors`, taparía también los de la suite que
    // sí corre.
    process.on('unhandledRejection', () => {})
    return { payload: null, fallo: error instanceof Error ? error.message : String(error) }
  }
})()

/**
 * `CI` lo pone solo cualquier servidor de integración; `EXIGIR_INTEGRACION` se
 * escribe a mano.
 *
 * Se descartan `'false'` y `'0'` en lugar de mirar si la variable tiene algo:
 * hay entornos que exportan `CI=false`, y como toda variable de entorno es una
 * cadena, `Boolean(process.env.CI)` daría verdadero y le quitaría el permiso de
 * omitir a alguien que ni siquiera está en un servidor de integración.
 */
const estaEnIntegracionContinua = !['', 'false', '0'].includes(process.env.CI ?? '')

const seExigenLasPruebas = estaEnIntegracionContinua || process.env.EXIGIR_INTEGRACION === '1'

const hayPermisoParaOmitir = process.env.OMITIR_INTEGRACION === '1' && !seExigenLasPruebas

/**
 * Guardia: es el único bloque del archivo que corre siempre, también sin base.
 * Sin él, un fallo de conexión se lleva por delante las seis pruebas de acceso
 * sin dejar una sola línea roja.
 */
describe('las pruebas de control de acceso no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null) return

    if (hayPermisoParaOmitir) {
      // Cortesía, no garantía: el reportero por omisión de Vitest intercepta la
      // consola y se come esta línea; sale con `--reporter=verbose` o con
      // `--disableConsoleIntercept`. Vale la pena igual porque la causa real
      // rara vez es la que uno supone —muchas veces no es la base, es el
      // `.env`—, pero por eso mismo el aviso serio es la aserción de abajo y
      // no un mensaje de consola, que fue justo lo que falló antes.
      console.warn(
        'Se omiten las pruebas de integración por OMITIR_INTEGRACION=1. Causa: ' + intento.fallo,
      )
      return
    }

    expect(
      hayPermisoParaOmitir,
      [
        'Las pruebas de control de acceso no llegaron a ejecutarse.',
        `Causa: ${intento.fallo}`,
        'Levantar la base con «npm run db:up» y revisar DATABASE_URI y PAYLOAD_SECRET en .env.',
        seExigenLasPruebas
          ? 'Aquí no se pueden omitir: CI o EXIGIR_INTEGRACION=1 las declara obligatorias.'
          : 'Para omitirlas a sabiendas: OMITIR_INTEGRACION=1 npx vitest run.',
      ].join('\n'),
    ).toBe(true)
  })
})

const usuario = (rol: string, activo: boolean) =>
  ({ id: 1, rol, activo, collection: 'usuarios' }) as never

/**
 * Comprueba que la operación fue rechazada por falta de permiso.
 *
 * Se mira el código de estado y no el texto del error: el panel está en
 * español, de modo que el mensaje depende del idioma y una aserción sobre la
 * frase se rompería al cambiarlo. El 403 no cambia nunca.
 */
async function esperarRechazoPorPermiso(operacion: Promise<unknown>) {
  const error = await operacion.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operación debía ser rechazada y no lo fue').not.toBeNull()
  expect((error as { status?: number }).status).toBe(403)
}

describe.skipIf(intento.payload === null)('acceso a través de la API local', () => {
  const payload = intento.payload as Payload
  let segmentoId: number | string
  const creados: (number | string)[] = []

  beforeAll(async () => {
    const segmento = await payload.create({
      collection: 'segmentos',
      data: { nombre: 'Segmento de prueba', orden: 999 },
      overrideAccess: true,
    })
    segmentoId = segmento.id
  })

  afterAll(async () => {
    for (const id of creados) {
      await payload.delete({ collection: 'patologias', id, overrideAccess: true }).catch(() => {})
    }
    if (segmentoId) {
      await payload
        .delete({ collection: 'segmentos', id: segmentoId, overrideAccess: true })
        .catch(() => {})
    }
  })

  it('rechaza la consulta cuando no hay sesión', async () => {
    // Payload no devuelve una lista vacía: rechaza la operación entera, que es
    // el comportamiento más seguro de los dos.
    await esperarRechazoPorPermiso(
      payload.find({ collection: 'patologias', overrideAccess: false, user: null }),
    )
  })

  it('rechaza la consulta de una cuenta que el administrador no ha activado', async () => {
    await esperarRechazoPorPermiso(
      payload.find({
        collection: 'patologias',
        overrideAccess: false,
        user: usuario('lector', false),
      }),
    )
  })

  it('un lector activo sí puede consultar, pero no recibe borradores', async () => {
    const borrador = await payload.create({
      collection: 'patologias',
      data: { nombre: 'Borrador de prueba', segmento: segmentoId, _status: 'draft' } as never,
      overrideAccess: true,
      draft: true,
    })
    creados.push(borrador.id)

    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', true),
    })

    expect(resultado.docs.map((d) => d.id)).not.toContain(borrador.id)
  })

  it('un editor no puede crear cuentas de usuario', async () => {
    await expect(
      payload.create({
        collection: 'usuarios',
        data: {
          email: 'intruso@ejemplo.cl',
          password: 'una-clave-larga-de-prueba',
          nombre: 'Intruso',
          rol: 'admin',
          activo: true,
        } as never,
        overrideAccess: false,
        user: usuario('editor', true),
      }),
    ).rejects.toThrow()
  })

  it('un editor sí puede crear contenido', async () => {
    const ficha = await payload.create({
      collection: 'patologias',
      data: { nombre: 'Ficha del editor', segmento: segmentoId } as never,
      overrideAccess: false,
      user: usuario('editor', true),
    })
    creados.push(ficha.id)
    expect(ficha.id).toBeTruthy()
  })
  it('un lector activo recibe la ficha publicada con sus bloques', async () => {
    const publicada = await payload.create({
      collection: 'patologias',
      data: {
        nombre: 'Ficha publicada de prueba',
        segmento: segmentoId,
        _status: 'published',
        definicion: [{ blockType: 'advertencia', tono: 'perla', texto: 'Contenido visible.' }],
      } as never,
      overrideAccess: true,
    })
    creados.push(publicada.id)

    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', true),
      depth: 1,
    })

    const encontrada = resultado.docs.find((d) => d.id === publicada.id)
    expect(encontrada, 'la ficha publicada debía llegar al lector').toBeTruthy()
    // El contenido viaja completo: es lo que la página renderiza en bloques.
    expect(Array.isArray((encontrada as { definicion?: unknown }).definicion)).toBe(true)
  })
})
