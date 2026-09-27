import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { Patologias } from '@/admin/esquema'
import { depurarDocumento } from '@/admin/depurar'
import { textoLlanoALexical } from '@/lib/textoRico'

/**
 * La revisión del contenido contra una base de verdad (D-142).
 *
 * Las cuentas puras están en `tests/unit/revision.test.ts`; aquí se comprueba
 * que llegan a la base como se promete: que la versión original se toma al
 * registrar y no se vuelve a tocar, que el tiempo que manda el navegador se
 * recorta al que de verdad pasó, que una validación sin tiempo se para antes de
 * escribir, y que cada cambio de estado deja su línea en el historial.
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

describe('las pruebas de la revisión no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la revisión de una ficha, de punta a punta', async () => {
  const payload = intento.payload as Payload
  const servidor = await import('@/lib/revisionServidor')
  const { armarAuditoria } = await import('@/lib/auditoria')
  const { leerEntradaDeAuditoria } = await import('@/lib/auditoriaServidor')

  const marca = `revision-${randomBytes(4).toString('hex')}`
  let segmentoId = ''
  let editorId = ''
  let adminId = ''
  let fichaId = ''

  const documentoCon = (manejo: string) => ({
    nombre: `Fractura de prueba ${marca}`,
    segmento: Number(segmentoId),
    tipo: 'trauma',
    definicion: [{ blockType: 'texto', cuerpo: textoLlanoALexical('Una fractura de la diáfisis tibial en el adulto joven.') }],
    manejo: [{ blockType: 'texto', cuerpo: textoLlanoALexical(manejo) }],
  })

  beforeAll(async () => {
    const segmento = await payload.create({
      collection: 'segmentos',
      data: { nombre: `Segmento ${marca}`, orden: 999 },
      overrideAccess: true,
    })
    segmentoId = String(segmento.id)
    const cuentaDe = async (rol: string) =>
      String(
        (
          await payload.create({
            collection: 'usuarios',
            data: {
              nombre: `${rol} ${marca}`,
              email: `${rol}-${marca}@prueba.invalid`,
              password: randomBytes(18).toString('base64url'),
              rol,
              activo: true,
            } as never,
            overrideAccess: true,
          })
        ).id,
      )
    editorId = await cuentaDe('editor')
    adminId = await cuentaDe('admin')
    const ficha = await payload.create({
      collection: 'patologias',
      data: { ...documentoCon('Reducción cerrada y clavo endomedular fresado.'), _status: 'draft' } as never,
      draft: true,
      overrideAccess: true,
    })
    fichaId = String(ficha.id)
  })

  afterAll(async () => {
    await servidor.quitarDeRevision(payload, 'patologias', fichaId).catch(() => {})
    if (fichaId) await payload.delete({ collection: 'patologias', id: fichaId, overrideAccess: true }).catch(() => {})
    for (const id of [editorId, adminId]) {
      if (id) await payload.delete({ collection: 'usuarios', id, overrideAccess: true }).catch(() => {})
    }
    if (segmentoId) await payload.delete({ collection: 'segmentos', id: segmentoId, overrideAccess: true }).catch(() => {})
  })

  it('registrar toma la versión original y la deja pendiente; dos veces, no', async () => {
    await servidor.registrarParaRevision(payload, {
      coleccion: 'patologias',
      documentoId: fichaId,
      usuarioId: adminId,
      origen: 'ia',
      libro: 'Rockwood y Green',
      capitulo: '54',
      lote: marca,
      asignadaA: editorId,
    })
    const revision = (await servidor.revisionDe(payload, 'patologias', fichaId, { conOriginal: true }))!
    expect(revision).toMatchObject({ estado: 'pendiente', origen: 'ia', libro: 'Rockwood y Green', porcentajeEditado: 0 })
    expect(Number(revision.palabrasOriginales)).toBeGreaterThan(10)
    expect((revision.historial as { accion: string }[]).map((h) => h.accion)).toEqual(['registrada', 'asignada'])
    await expect(
      servidor.registrarParaRevision(payload, { coleccion: 'patologias', documentoId: fichaId, usuarioId: adminId }),
    ).rejects.toThrow(/ya está en revisión/)
  })

  it('el latido del editor suma tiempo, pero no más del que pasó', async () => {
    const latir = (abiertos: number, activos: number) =>
      servidor.anotarLatido(payload, {
        esquema: Patologias,
        documentoId: fichaId,
        usuarioId: editorId,
        sesion: `${marca}-sesion`,
        abiertos,
        activos,
        porSeccion: { Manejo: activos, 'Sección inventada': 99 },
        ediciones: 3,
      })
    expect(await latir(20, 15)).toBe(true)
    // Enseguida otro latido que dice llevar una hora: se recorta a lo que pasó.
    expect(await latir(3600, 3600)).toBe(true)
    const tiempo = await servidor.tiempoDe(payload, 'patologias', fichaId, editorId)
    expect(tiempo.segundosAbiertos).toBeGreaterThanOrEqual(20)
    expect(tiempo.segundosAbiertos).toBeLessThan(40)
    expect(tiempo.porSeccion).not.toHaveProperty('Sección inventada')
    // Y la ficha deja de estar pendiente: alguien la tiene delante.
    expect((await servidor.revisionDe(payload, 'patologias', fichaId))!.estado).toBe('en-revision')
    // La sesión es de esta cuenta y esta ficha: otra no la puede reutilizar.
    await expect(
      servidor.anotarLatido(payload, {
        esquema: Patologias,
        documentoId: fichaId,
        usuarioId: adminId,
        sesion: `${marca}-sesion`,
        abiertos: 5,
        activos: 5,
        porSeccion: {},
        ediciones: 0,
      }),
    ).rejects.toThrow(/otra ficha o de otra cuenta/)
  })

  it('cada guardado mide cuánto se editó contra el original', async () => {
    const editado = depurarDocumento(Patologias, documentoCon('Reducción abierta y placa bloqueada de compresión.'))
    await payload.update({
      collection: 'patologias',
      id: fichaId,
      data: editado as never,
      draft: true,
      overrideAccess: true,
    })
    await servidor.anotarGuardado(payload, {
      esquema: Patologias,
      documentoId: fichaId,
      documento: editado,
      usuarioId: editorId,
      esAdmin: false,
      publicada: false,
    })
    const revision = (await servidor.revisionDe(payload, 'patologias', fichaId))!
    expect(Number(revision.porcentajeEditado)).toBeGreaterThan(0)
    expect(Number(revision.porcentajeEditado)).toBeLessThan(50)
    const manejo = (revision.porSeccion as { seccion: string; porcentaje: number }[]).find((s) => s.seccion === 'Manejo')!
    expect(manejo.porcentaje).toBeGreaterThan(50)
    // La original no se toca al guardar.
    const conOriginal = (await servidor.revisionDe(payload, 'patologias', fichaId, { conOriginal: true }))!
    expect(JSON.stringify(conOriginal.original)).toContain('clavo endomedular')
  })

  it('validar con poco tiempo se para antes de escribir; confirmada, queda señalada', async () => {
    const sinConfirmar = await servidor.validarRevision(payload, {
      esquema: Patologias,
      documentoId: fichaId,
      usuarioId: editorId,
      confirmada: false,
    })
    expect(sinConfirmar.necesitaConfirmacion).toBe(true)
    expect(sinConfirmar.juicio.rapida).toBe(true)
    expect((await servidor.revisionDe(payload, 'patologias', fichaId))!.estado).toBe('en-revision')

    const confirmada = await servidor.validarRevision(payload, {
      esquema: Patologias,
      documentoId: fichaId,
      usuarioId: editorId,
      nota: 'Cotejado con el capítulo 54.',
      confirmada: true,
    })
    expect(confirmada.necesitaConfirmacion).toBe(false)
    const revision = (await servidor.revisionDe(payload, 'patologias', fichaId))!
    expect(revision).toMatchObject({
      estado: 'lista',
      validacionRapida: true,
      notaDeRevision: 'Cotejado con el capítulo 54.',
    })
    expect(String(revision.listaPor)).toBe(editorId)
    await expect(
      servidor.validarRevision(payload, { esquema: Patologias, documentoId: fichaId, usuarioId: editorId, confirmada: true }),
    ).rejects.toThrow(/ya está marcada/)
  })

  it('el administrador la devuelve, y publicarla sin validar queda anotado', async () => {
    await servidor.devolverRevision(payload, {
      coleccion: 'patologias',
      documentoId: fichaId,
      usuarioId: adminId,
      motivo: 'Falta la clasificación de Gustilo.',
    })
    expect((await servidor.revisionDe(payload, 'patologias', fichaId))!).toMatchObject({
      estado: 'devuelta',
      devoluciones: 1,
      motivoDeDevolucion: 'Falta la clasificación de Gustilo.',
    })
    await servidor.anotarPublicacion(payload, {
      coleccion: 'patologias',
      documentoId: fichaId,
      usuarioId: adminId,
      publicar: true,
    })
    const revision = (await servidor.revisionDe(payload, 'patologias', fichaId))!
    expect(revision).toMatchObject({ estado: 'publicada', publicadaSinValidar: true })
    expect((revision.historial as { accion: string }[]).map((h) => h.accion)).toEqual([
      'registrada',
      'asignada',
      'lista',
      'devuelta',
      'publicada',
    ])
  })

  it('la auditoría la cuenta con su revisor, su tiempo y su devolución', async () => {
    const entrada = await leerEntradaDeAuditoria(payload)
    const auditoria = armarAuditoria(entrada)
    const fila = auditoria.contenidos.find((c) => c.documentoId === fichaId)!
    expect(fila).toMatchObject({ estado: 'publicada', validador: `editor ${marca}`, publicadaSinValidar: true })
    const revisor = auditoria.revisores.find((r) => r.id === editorId)!
    expect(revisor).toMatchObject({ validadas: 1, senaladas: 1, devueltas: 1 })
    expect(revisor.minutosActivos).toBeGreaterThan(0)
  })

  it('sacarla de revisión borra su rastro, y borrar la cuenta del revisor no rompe la base', async () => {
    await payload.delete({ collection: 'usuarios', id: editorId, overrideAccess: true })
    editorId = ''
    await servidor.quitarDeRevision(payload, 'patologias', fichaId)
    expect(await servidor.revisionDe(payload, 'patologias', fichaId)).toBeNull()
    const { totalDocs } = await payload.count({
      collection: 'sesiones-de-revision',
      where: { documentoId: { equals: fichaId } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})
