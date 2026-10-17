import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { initTransaction, killTransaction } from 'payload'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * El listado global de estructuras contra una base de verdad (D-179, P-003 E8).
 *
 * La política de acceso de la colección la prueba la matriz de
 * `roles.test.ts`. Aquí, lo que solo se ve con PostgreSQL delante: que la
 * siembra del atlas entero es idempotente, que el índice único de `atlasId` es
 * el que protege de un duplicado, y todo lo que el dueño pidió de la planilla para
 * no perder información (subir dos veces, celda vacía, lado opuesto, todo o nada).
 *
 * **Nada de esto deja una fila en la base de desarrollo.** La siembra de 2.231
 * fichas corre dentro de una transacción que se deshace siempre: no solo por
 * limpieza, sino porque `sincronizarConElAtlas` marca como «sin pieza» toda
 * ficha que no esté en el catálogo que se le da, y contra la base de alguien que
 * ya llenó fichas de verdad eso sería tocar su trabajo.
 *
 * Con la misma guardia que las demás de integración: sin base, falla en rojo
 * salvo que se pida omitirlas por escrito (ver `acceso.test.ts`).
 */

type IntentoDeConexion = { payload: Payload; fallo: null } | { payload: null; fallo: string }

const intento: IntentoDeConexion = await (async (): Promise<IntentoDeConexion> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return { payload: await getPayload({ config }), fallo: null }
  } catch (error) {
    process.on('unhandledRejection', () => {})
    return { payload: null, fallo: error instanceof Error ? error.message : String(error) }
  }
})()

const estaEnIntegracionContinua = !['', 'false', '0'].includes(process.env.CI ?? '')
const seExigen = estaEnIntegracionContinua || process.env.EXIGIR_INTEGRACION === '1'
const permisoParaOmitir = process.env.OMITIR_INTEGRACION === '1' && !seExigen

describe('las pruebas de las estructuras no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la siembra del atlas entero, contra PostgreSQL', async () => {
  const payload = intento.payload as Payload
  const { leerCatalogo } = await import('@/lib/catalogoDelAtlas')
  const { sincronizarConElAtlas, leerTodasLasEstructuras } = await import('@/lib/estructurasServidor')
  const { createLocalReq } = await import('payload')

  let req: PayloadRequest

  beforeAll(async () => {
    req = await createLocalReq({}, payload)
    await initTransaction(req)
  })

  afterAll(async () => {
    await killTransaction(req)
  })

  it('crea una ficha por pieza y la segunda pasada no cambia nada', async () => {
    const catalogo = await leerCatalogo()
    const antes = (await leerTodasLasEstructuras(payload, { atlasId: true }, req)).length

    const primera = await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba', req })
    expect(primera.creadas + primera.yaEstaban).toBe(catalogo.piezas.length)
    expect(primera.creadas).toBe(catalogo.piezas.length - antes)

    const filas = await leerTodasLasEstructuras(payload, undefined, req)
    expect(filas).toHaveLength(Math.max(antes, catalogo.piezas.length))
    expect(new Set(filas.map((f) => f.atlasId)).size).toBe(filas.length)

    const segunda = await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba', req })
    expect(segunda).toEqual({
      creadas: 0,
      yaEstaban: catalogo.piezas.length,
      actualizadas: 0,
      huerfanas: 0,
      recuperadas: 0,
      casadasPorNombre: 0,
    })
    expect(await leerTodasLasEstructuras(payload, { atlasId: true }, req)).toHaveLength(filas.length)
  }, 600_000)

  it('el índice único de atlasId rechaza una segunda ficha para la misma pieza', async () => {
    const [una] = await leerTodasLasEstructuras(payload, { atlasId: true }, req)
    expect(una).toBeDefined()
    // Dentro de la misma transacción: las fichas sembradas solo existen ahí. El error del
    // índice la deja abortada, y por eso esta es la última prueba del bloque.
    await expect(
      payload.create({
        collection: 'estructuras-anatomicas',
        data: { atlasId: una.atlasId, nombreOriginal: 'Duplicada' } as never,
        overrideAccess: true,
        context: { sinRegistro: true },
        req,
      }),
    ).rejects.toBeTruthy()
  }, 120_000)
})

// ---------------------------------------------------------------------------
// La planilla, de punta a punta contra PostgreSQL.
//
// Con un catálogo **inventado** de piezas de prueba y no con el del atlas: así lo que
// se escribe no toca ninguna ficha de verdad —la base de desarrollo de alguien puede
// tener fichas llenas—, y se borra al terminar. `aplicarPlanilla` solo mira las piezas
// de la planilla; no sincroniza ni marca «sin pieza» nada.
// ---------------------------------------------------------------------------

describe.skipIf(intento.payload === null)('la planilla de estructuras, contra PostgreSQL', async () => {
  const payload = intento.payload as Payload
  const { aplicarPlanilla, vistaPreviaDeLaPlanilla, PlanillaCambio } = await import('@/lib/subirPlanillaDeEstructuras')
  const { planillaDeEstructuras } = await import('@/lib/planillaDeEstructuras')
  const { leerTodasLasEstructuras, guardarFicha, leerVersiones } = await import('@/lib/estructurasServidor')
  const { armarListado } = await import('@/lib/listadoDeEstructuras')
  const { contarEstructuras } = await import('@/lib/estructuras')
  const { sql } = await import('@payloadcms/db-postgres')

  const marca = randomBytes(4).toString('hex').toUpperCase()
  const idDe = (n: string) => `FJ-T${marca}-${n}`

  /** Una pieza del catálogo inventado. La izquierda es la derecha reflejada: así tienen pareja. */
  const pieza = (n: string, nombre: string, x: number, region = 'miembro-inferior-derecho'): PiezaDelAtlas =>
    ({
      id: idDe(n),
      nombre,
      fma: '',
      sistema: 'skeletal',
      region,
      origenRegion: 'anatomia',
      paquete: 0,
      pos: 0,
      nor: 0,
      idx: 0,
      vertices: 0,
      indices: 0,
      caja: [
        [x, 0, 0],
        [x + 0.05, 0.1, 0.1],
      ],
    }) as PiezaDelAtlas
  const nombreDe = (parte: string) => `${parte} pieza-de-prueba-${marca}`
  const catalogo = {
    version: 'prueba',
    piezas: [
      pieza('D1', `Right ${nombreDe('uno')}`, -0.1),
      pieza('I1', `Left ${nombreDe('uno')}`, 0.05),
      pieza('D2', `Right ${nombreDe('dos')}`, -0.1),
      pieza('I2', `Left ${nombreDe('dos')}`, 0.05),
      // De la línea media: ni su nombre ni su región dicen lado, así que no hay pareja que buscar.
      pieza('M1', `Medial ${nombreDe('media')}`, 0, 'torax'),
    ],
    sistemas: [{ id: 'skeletal', nombre: 'Esqueleto', color: '#fff', orden: 1 }],
    regiones: [
      { id: 'miembro-inferior-derecho', nombre: 'Miembro inferior derecho', orden: 1 },
      { id: 'miembro-inferior-izquierdo', nombre: 'Miembro inferior izquierdo', orden: 2 },
    ],
    paquetes: [],
  } as unknown as CatalogoDelAtlas

  const editor = { id: 1, rol: 'editor', activo: true, nombre: `Editor ${marca}`, email: `editor-${marca}@prueba.invalid` }
  const archivo = `prueba-${marca}.xlsx`

  /** Una planilla con las filas dadas: id, original y textos. */
  const planilla = (filas: { n: string; textos?: Record<string, string>; oculta?: boolean }[]): Uint8Array =>
    planillaDeEstructuras(
      filas.map(({ n, textos, oculta }) => {
        const p = catalogo.piezas.find((x) => x.id === idDe(n)) as PiezaDelAtlas
        return {
          atlasId: p.id,
          nombre: p.nombre,
          original: p.nombre,
          lado: null,
          sistema: 'skeletal',
          faltan: [],
          ficha: textos ?? {},
          oculta: oculta ?? false,
        }
      }),
      () => 'Esqueleto',
      'Prueba',
    )

  const opciones = (extra: Partial<{ reemplazar: boolean; alLadoOpuesto: boolean }> = {}) => ({
    reemplazar: false,
    alLadoOpuesto: false,
    ...extra,
  })
  const filaDe = async (n: string) => (await leerTodasLasEstructuras(payload)).find((f) => f.atlasId === idDe(n))
  const versionesDe = async (n: string) => {
    const f = await filaDe(n)
    return f
      ? (
          await payload.findVersions({
            collection: 'estructuras-anatomicas',
            where: { parent: { equals: f.id } },
            limit: 100,
            depth: 0,
            overrideAccess: true,
          })
        ).totalDocs
      : 0
  }
  /** Ver y aplicar, como lo hace la pantalla: la huella de lo que se vio es la que se manda. */
  const subir = async (bytes: Uint8Array, o = opciones()) => {
    const vista = await vistaPreviaDeLaPlanilla(payload, catalogo, bytes, o)
    const resultado = await aplicarPlanilla(payload, catalogo, bytes, o, vista.huella, {
      usuario: editor,
      nombreDelArchivo: archivo,
    })
    return { vista, resultado }
  }

  afterAll(async () => {
    // Las fichas de prueba y sus versiones: `parent_id` se queda a nulo al borrar la ficha, así que se borran por el id del atlas.
    const drizzle = (payload.db as unknown as { drizzle: { execute: (c: unknown) => Promise<unknown> } }).drizzle
    await drizzle.execute(sql`DELETE FROM "_estructuras_anatomicas_v" WHERE "version_atlas_id" LIKE ${`FJ-T${marca}-%`}`)
    await drizzle.execute(sql`DELETE FROM "estructuras_anatomicas" WHERE "atlas_id" LIKE ${`FJ-T${marca}-%`}`)
    await drizzle.execute(sql`DELETE FROM "registro_de_acciones" WHERE "titulo" = ${`Planilla «${archivo}»`}`)
  }, 120_000)

  it('subir la planilla dos veces no duplica ni cambia nada: la segunda no escribe una fila ni una versión', async () => {
    const bytes = planilla([
      { n: 'D1', textos: { definicion: 'Hueso uno.', irrigacion: 'Arteria nutricia uno.' } },
      { n: 'D2', textos: { definicion: 'Hueso dos.' } },
    ])
    const primera = await subir(bytes)
    expect(primera.vista.conteo).toMatchObject({ llenas: 2, fichasAEscribir: 2, camposAEscribir: 3 })
    expect(primera.resultado).toEqual({ fichas: 2, campos: 3, creadas: 2 })
    const propias = async () => (await leerTodasLasEstructuras(payload)).filter((f) => f.atlasId.startsWith(`FJ-T${marca}-`))
    expect(await propias()).toHaveLength(2)
    const versiones = [await versionesDe('D1'), await versionesDe('D2')]

    const segunda = await subir(bytes)
    expect(segunda.vista.conteo).toMatchObject({ llenas: 0, fichasAEscribir: 0, iguales: 2 })
    expect(segunda.resultado).toEqual({ fichas: 0, campos: 0, creadas: 0 })
    expect(await propias()).toHaveLength(2)
    expect([await versionesDe('D1'), await versionesDe('D2')]).toEqual(versiones)
    expect((await filaDe('D1'))?.definicion).toBe('Hueso uno.')
  }, 120_000)

  it('una celda vacía no borra lo escrito, ni siquiera con «reemplazar»', async () => {
    await subir(planilla([{ n: 'D1', textos: { definicion: 'Hueso uno.', irrigacion: 'Arteria nutricia uno.' } }]))
    // Una planilla con la ficha de D1 sin nada en sus celdas.
    const { vista, resultado } = await subir(planilla([{ n: 'D1', textos: {} }]), opciones({ reemplazar: true }))
    expect(vista.conteo.fichasAEscribir).toBe(0)
    expect(resultado.fichas).toBe(0)
    expect(await filaDe('D1')).toMatchObject({ definicion: 'Hueso uno.', irrigacion: 'Arteria nutricia uno.' })
  }, 120_000)

  it('un texto distinto del escrito no se reemplaza por omisión, y con «reemplazar» el de antes queda en el historial', async () => {
    await subir(planilla([{ n: 'D2', textos: { definicion: 'Hueso dos.' } }]))
    const otra = planilla([{ n: 'D2', textos: { definicion: 'OTRO texto para el hueso dos.' } }])

    const sin = await subir(otra)
    expect(sin.vista.conteo).toMatchObject({ cambian: 1, fichasAEscribir: 0 })
    expect((await filaDe('D2'))?.definicion).toBe('Hueso dos.')

    const con = await subir(otra, opciones({ reemplazar: true }))
    expect(con.resultado.fichas).toBe(1)
    expect((await filaDe('D2'))?.definicion).toBe('OTRO texto para el hueso dos.')
    const anteriores = await leerVersiones(payload, idDe('D2'))
    expect(anteriores.map((v) => v.textos.definicion)).toContain('Hueso dos.')
  }, 120_000)

  it('aplicar al lado opuesto llena la pareja y no pisa lo que ya tiene escrito', async () => {
    // La izquierda de «uno» ya tiene su propia definición, escrita a mano.
    await guardarFicha(payload, catalogo, idDe('I1'), {
      campos: { definicion: 'Escrita a mano en la izquierda.' },
      base: { definicion: '' },
    })
    // Una pieza de la línea media no tiene pareja ni se copia a ninguna parte.
    const media = await subir(planilla([{ n: 'M1', textos: { definicion: 'Pieza media.' } }]), opciones({ alLadoOpuesto: true }))
    expect(media.vista.sinPareja).toEqual([])

    const derecha = planilla([
      { n: 'D1', textos: { definicion: 'De la derecha.', origen: 'Origen de la derecha.' } },
      { n: 'D2', textos: { origen: 'Origen dos.' } },
    ])
    const { vista } = await subir(derecha, opciones({ reemplazar: true, alLadoOpuesto: true }))
    expect(vista.conteo.delLadoOpuesto).toBeGreaterThanOrEqual(1)
    // I1: conserva lo suyo y recibe solo lo que le faltaba.
    expect(await filaDe('I1')).toMatchObject({ definicion: 'Escrita a mano en la izquierda.', origen: 'Origen de la derecha.' })
    // I2 estaba sin ficha: se crea con lo de su pareja y con los datos del atlas de su propia pieza.
    expect(await filaDe('I2')).toMatchObject({
      atlasId: idDe('I2'),
      origen: 'Origen dos.',
      lado: 'izquierdo',
      nombreOriginal: `Left ${nombreDe('dos')}`,
    })
  }, 120_000)

  it('si una ficha cambia entre la vista previa y el «Aplicar», no se escribe nada de lo que no se vio', async () => {
    const bytes = planilla([{ n: 'M1', textos: { notas: 'Nota de la planilla.' } }])
    const vista = await vistaPreviaDeLaPlanilla(payload, catalogo, bytes, opciones())
    expect(vista.conteo.fichasAEscribir).toBe(1)
    // Otra persona escribe, en el medio, justo ese campo de esa ficha.
    await guardarFicha(payload, catalogo, idDe('M1'), { campos: { notas: 'Nota de otra persona.' }, base: { notas: '' } })
    await expect(
      aplicarPlanilla(payload, catalogo, bytes, opciones(), vista.huella, { usuario: editor, nombreDelArchivo: archivo }),
    ).rejects.toThrow(PlanillaCambio)
    expect((await filaDe('M1'))?.notas).toBe('Nota de otra persona.')

    // En cambio, una ficha que la planilla no toca puede cambiar sin molestar: lo que se escribe es lo que se vio.
    const otra = await vistaPreviaDeLaPlanilla(payload, catalogo, planilla([{ n: 'M1', textos: { insercion: 'Inserción de la planilla.' } }]), opciones())
    await guardarFicha(payload, catalogo, idDe('M1'), { campos: { accion: 'Acción de otra persona.' }, base: { accion: '' } })
    const resultado = await aplicarPlanilla(payload, catalogo, planilla([{ n: 'M1', textos: { insercion: 'Inserción de la planilla.' } }]), opciones(), otra.huella, { usuario: editor, nombreDelArchivo: archivo })
    expect(resultado.fichas).toBe(1)
  }, 120_000)

  it('escribe todo o nada: si falla a mitad de la subida, ninguna ficha queda a medias y no hay línea de registro', async () => {
    const bytes = planilla([
      { n: 'D1', textos: { notas: 'Nota nueva uno.' } },
      { n: 'D2', textos: { notas: 'Nota nueva dos.' } },
    ])
    const o = opciones()
    const vista = await vistaPreviaDeLaPlanilla(payload, catalogo, bytes, o)
    expect(vista.conteo.fichasAEscribir).toBe(2)

    const verdadera = payload.update.bind(payload) as (...a: unknown[]) => Promise<unknown>
    let llamadas = 0
    const espiada = vi.spyOn(payload, 'update').mockImplementation((async (...argumentos: unknown[]) => {
      llamadas += 1
      if (llamadas === 2) throw new Error('fallo simulado a mitad de la subida')
      return verdadera(...argumentos)
    }) as never)
    const lineas = async () =>
      (
        await payload.find({
          collection: 'registro-de-acciones',
          where: { titulo: { equals: `Planilla «${archivo}»` } },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
      ).totalDocs
    const antes = await lineas()
    try {
      await expect(
        aplicarPlanilla(payload, catalogo, bytes, o, vista.huella, { usuario: editor, nombreDelArchivo: archivo }),
      ).rejects.toThrow(/fallo simulado/)
    } finally {
      espiada.mockRestore()
    }
    // La primera escritura se deshizo con la segunda.
    expect((await filaDe('D1'))?.notas ?? null).toBeNull()
    expect((await filaDe('D2'))?.notas ?? null).toBeNull()
    expect(await lineas()).toBe(antes)
  }, 120_000)

  it('cada subida deja una sola línea en el registro, a nombre de quien la hizo, sin copiar el contenido', async () => {
    const lineas = await payload.find({
      collection: 'registro-de-acciones',
      where: { and: [{ titulo: { equals: `Planilla «${archivo}»` } }, { accion: { equals: 'subida-de-planilla' } }] },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    expect(lineas.totalDocs).toBeGreaterThan(0)
    for (const linea of lineas.docs as unknown as { usuarioCorreo: string; detalle: string }[]) {
      expect(linea.usuarioCorreo).toBe(editor.email)
      expect(linea.detalle).toMatch(/fichas y \d+ campos escritos/)
      expect(linea.detalle).not.toMatch(/Hueso uno|Arteria nutricia/)
    }
    // Y las escrituras de la subida no dejaron además una línea «creó» o «modificó» por cada ficha.
    const sueltas = await payload.find({
      collection: 'registro-de-acciones',
      where: { and: [{ titulo: { contains: `pieza-de-prueba-${marca}` } }, { accion: { in: ['creo', 'modifico'] } }] },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    // Las que escribió `guardarFicha` a mano (sin `sinRegistro`) sí quedan: son actos sueltos; las de las subidas, no.
    const deSubidas = sueltas.docs.filter((l) => String((l as { detalle?: string }).detalle ?? '').includes('planilla'))
    expect(deSubidas).toHaveLength(0)
  }, 120_000)

  it('una pieza oculta sale del contador de pendientes', async () => {
    await subir(planilla([{ n: 'M1', oculta: true }]))
    const listado = armarListado(catalogo, await leerTodasLasEstructuras(payload))
    expect(listado.filas.find((f) => f.atlasId === idDe('M1'))?.estado).toBe('oculta')
    // El listado de este catálogo inventado son sus cinco piezas: las ocultas no cuentan como pendientes.
    const propias = armarListado(catalogo, (await leerTodasLasEstructuras(payload)).filter((f) => f.atlasId.startsWith(`FJ-T${marca}-`)))
    const conteo = contarEstructuras(propias.filas)
    expect(conteo.ocultas).toBe(1)
    expect(conteo.pendientes + conteo.completas + conteo.ocultas).toBe(conteo.total)
  }, 120_000)

  it('un archivo que no es una planilla se rechaza con su motivo, sin tocar nada', async () => {
    await expect(
      vistaPreviaDeLaPlanilla(payload, catalogo, new TextEncoder().encode('Id,Definición\nFJ1,Hueso'), opciones()),
    ).rejects.toThrow(/\.xlsx/)
  })
})

describe.skipIf(intento.payload === null)('las versiones de una ficha son de quien edita', async () => {
  const payload = intento.payload as Payload
  const marca = randomBytes(4).toString('hex')
  const creados: (number | string)[] = []
  const cuentas: Record<string, Record<string, unknown>> = {}
  let fichaId: number | string

  beforeAll(async () => {
    for (const rol of ['editor', 'lector']) {
      const cuenta = await payload.create({
        collection: 'usuarios',
        data: {
          nombre: `${rol} ${marca}`,
          email: `${rol}-versiones-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol,
          activo: true,
        } as never,
        overrideAccess: true,
      })
      creados.push(cuenta.id)
      cuentas[rol] = cuenta as unknown as Record<string, unknown>
    }
    const ficha = await payload.create({
      collection: 'estructuras-anatomicas',
      data: { atlasId: `FJ-V${marca}`, nombreOriginal: `Pieza de versiones ${marca}`, definicion: 'Una.' } as never,
      overrideAccess: true,
      context: { sinRegistro: true },
    })
    fichaId = ficha.id
    await payload.update({
      collection: 'estructuras-anatomicas',
      id: fichaId,
      data: { definicion: 'Dos.' } as never,
      overrideAccess: true,
      context: { sinRegistro: true },
    })
  }, 120_000)

  afterAll(async () => {
    const { sql } = await import('@payloadcms/db-postgres')
    const drizzle = (payload.db as unknown as { drizzle: { execute: (c: unknown) => Promise<unknown> } }).drizzle
    await drizzle.execute(sql`DELETE FROM "_estructuras_anatomicas_v" WHERE "version_atlas_id" = ${`FJ-V${marca}`}`)
    await payload
      .delete({ collection: 'estructuras-anatomicas', id: fichaId, overrideAccess: true, context: { sinRegistro: true } })
      .catch(() => {})
    for (const id of creados) await payload.delete({ collection: 'usuarios', id, overrideAccess: true }).catch(() => {})
  }, 120_000)

  const leer = (rol: string) =>
    payload.findVersions({
      collection: 'estructuras-anatomicas',
      where: { parent: { equals: fichaId } },
      overrideAccess: false,
      user: cuentas[rol] as never,
    })

  it('el editor ve el historial y el lector no puede leerlo', async () => {
    expect((await leer('editor')).totalDocs).toBeGreaterThanOrEqual(2)
    await expect(leer('lector')).rejects.toBeTruthy()
  }, 120_000)

  it('el lector sí lee la ficha, y no la escribe', async () => {
    const leida = await payload.findByID({
      collection: 'estructuras-anatomicas',
      id: fichaId,
      overrideAccess: false,
      user: cuentas.lector as never,
    })
    expect(leida.definicion).toBe('Dos.')
    await expect(
      payload.update({
        collection: 'estructuras-anatomicas',
        id: fichaId,
        data: { definicion: 'Lo cambió un lector' } as never,
        overrideAccess: false,
        user: cuentas.lector as never,
      }),
    ).rejects.toBeTruthy()
    expect((await payload.findByID({ collection: 'estructuras-anatomicas', id: fichaId, overrideAccess: true })).definicion).toBe('Dos.')
  }, 120_000)

  it('ni un editor reasigna una ficha a otra pieza por la API: el identificador del atlas no se reescribe', async () => {
    await payload.update({
      collection: 'estructuras-anatomicas',
      id: fichaId,
      data: { atlasId: 'FJ-OTRA', sistema: 'muscular' } as never,
      overrideAccess: false,
      user: cuentas.editor as never,
    })
    const despues = await payload.findByID({ collection: 'estructuras-anatomicas', id: fichaId, overrideAccess: true })
    expect(despues.atlasId).toBe(`FJ-V${marca}`)
    expect(despues.sistema ?? null).toBeNull()
  }, 120_000)
})
