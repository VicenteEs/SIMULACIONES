import { describe, expect, it } from 'vitest'
import { armarAuditoria, filtrarEntrada, lunesDe, porSemana, reparto } from '@/lib/auditoria'

/**
 * La auditoría de la revisión (D-142), armada desde filas crudas como las que
 * devuelve la base. Es la misma cuenta para la pantalla y para la planilla:
 * aquí se fija qué dice de cada ficha y de cada revisor.
 */

const cuentas = [
  { id: '1', nombre: 'Administradora', correo: 'admin@x.cl', rol: 'admin', activo: true },
  { id: '2', nombre: 'Dra. Pérez', correo: 'perez@x.cl', rol: 'editor', activo: true },
  { id: '3', nombre: 'Dr. Soto', correo: 'soto@x.cl', rol: 'editor', activo: true },
]

const revisiones = [
  {
    coleccion: 'patologias',
    documentoId: '10',
    titulo: 'Fractura de tibia',
    origen: 'ia',
    libro: 'Rockwood',
    lote: 'lote-1',
    estado: 'lista',
    asignadaA: 2,
    listaPor: 2,
    listaEn: '2026-09-20T15:00:00.000Z',
    porcentajeEditado: 12.5,
    segundosActivosAlValidar: 600,
    ritmoAlValidar: 150,
    seccionesVistasAlValidar: 6,
    seccionesConContenido: 6,
    validacionRapida: false,
    historial: [
      { accion: 'registrada', usuario: 1, fecha: '2026-09-18T10:00:00.000Z' },
      { accion: 'lista', usuario: 3, fecha: '2026-09-19T10:00:00.000Z' },
      { accion: 'devuelta', usuario: 1, fecha: '2026-09-19T12:00:00.000Z', detalle: 'Falta la clasificación' },
      { accion: 'lista', usuario: 2, fecha: '2026-09-20T15:00:00.000Z', porcentaje: 12.5, segundosActivos: 600 },
    ],
    devoluciones: 1,
    porSeccion: [{ seccion: 'Manejo', original: 100, actual: 110, porcentaje: 9.1 }],
    createdAt: '2026-09-18T10:00:00.000Z',
  },
  {
    coleccion: 'maniobras',
    documentoId: '20',
    titulo: 'Lachman',
    origen: 'ia',
    lote: 'lote-2',
    estado: 'lista',
    asignadaA: 3,
    listaPor: 3,
    listaEn: '2026-09-21T15:00:00.000Z',
    porcentajeEditado: 0,
    segundosActivosAlValidar: 20,
    ritmoAlValidar: 1800,
    validacionRapida: true,
    motivosDeAlerta: 'a 1800 palabras por minuto',
    historial: [],
  },
  {
    coleccion: 'patologias',
    documentoId: '30',
    titulo: 'Luxación de hombro',
    origen: 'ia',
    lote: 'lote-1',
    estado: 'pendiente',
    asignadaA: 3,
    historial: [],
  },
  {
    coleccion: 'patologias',
    documentoId: '40',
    titulo: 'Sin nadie',
    origen: 'manual',
    estado: 'publicada',
    publicadaSinValidar: true,
    asignadaA: 99,
    historial: [],
  },
]

const sesiones = [
  { usuario: 2, coleccion: 'patologias', documentoId: '10', segundosActivos: 600, segundosAbiertos: 900, ultimoLatido: '2026-09-20T15:00:00.000Z', porSeccion: { Manejo: 300 } },
  { usuario: 3, coleccion: 'patologias', documentoId: '10', segundosActivos: 60, segundosAbiertos: 60, ultimoLatido: '2026-09-19T10:00:00.000Z' },
  { usuario: 3, coleccion: 'maniobras', documentoId: '20', segundosActivos: 20, segundosAbiertos: 30, ultimoLatido: '2026-09-21T15:00:00.000Z' },
  { usuario: null, coleccion: 'patologias', documentoId: '30', segundosActivos: 5, segundosAbiertos: 5 },
]

describe('armarAuditoria', () => {
  const auditoria = armarAuditoria({ revisiones, sesiones, cuentas })

  it('una fila por ficha, con el tiempo de todos y el del validador', () => {
    const tibia = auditoria.contenidos.find((c) => c.documentoId === '10')!
    expect(tibia).toMatchObject({
      titulo: 'Fractura de tibia',
      origen: 'Generado por IA',
      estado: 'lista',
      asignada: 'Dra. Pérez',
      validador: 'Dra. Pérez',
      porcentaje: 12.5,
      minutosActivos: 11,
      minutosAbiertos: 16,
      minutosActivosDelValidador: 10,
      ritmoDelValidador: 150,
      devoluciones: 1,
    })
    expect(tibia.porSeccion).toEqual([{ seccion: 'Manejo', original: 100, actual: 110, porcentaje: 9.1 }])
  })

  it('lo que no se ha validado no tiene cifras de validación, ni ceros de relleno', () => {
    const hombro = auditoria.contenidos.find((c) => c.documentoId === '30')!
    expect(hombro.minutosActivosDelValidador).toBeNull()
    expect(hombro.ritmoDelValidador).toBeNull()
    expect(hombro.seccionesRevisadas).toBeNull()
  })

  it('una cuenta que ya no está se nombra así, no se deja el hueco', () => {
    expect(auditoria.contenidos.find((c) => c.documentoId === '40')!.asignada).toBe('cuenta borrada')
    expect(auditoria.sesiones.find((s) => s.documentoId === '30')!.revisor).toBe('cuenta borrada')
  })

  it('cada revisor, con lo asignado, lo validado, lo señalado y lo devuelto', () => {
    const perez = auditoria.revisores.find((r) => r.id === '2')!
    const soto = auditoria.revisores.find((r) => r.id === '3')!
    expect(perez).toMatchObject({
      asignadas: 1,
      pendientes: 0,
      validadas: 1,
      senaladas: 0,
      devueltas: 0,
      fichasAbiertas: 1,
      minutosActivos: 10,
      minutosPorValidada: 10,
      ritmoMedio: 150,
      porcentajeMedio: 12.5,
    })
    // La devolución de la tibia se le cuenta a Soto, que la había validado
    // antes: su validación es la que no convenció.
    expect(soto).toMatchObject({
      asignadas: 2,
      pendientes: 1,
      validadas: 1,
      senaladas: 1,
      devueltas: 1,
      fichasAbiertas: 2,
      ritmoMedio: 1800,
    })
    // Primero quien más tiempo le dedicó.
    expect(auditoria.revisores[0].id).toBe('2')
  })

  it('los totales por estado y las medias de lo validado', () => {
    expect(auditoria.totales).toMatchObject({
      fichas: 4,
      porEstado: { pendiente: 1, 'en-revision': 0, lista: 2, publicada: 1, devuelta: 0 },
      porcentajeMedioDeLasValidadas: 6.3,
      senaladas: 1,
      publicadasSinValidar: 1,
    })
  })

  it('el historial va del más reciente al más antiguo, con las acciones en palabras', () => {
    expect(auditoria.historial[0]).toMatchObject({ accion: 'Validada', usuario: 'Dra. Pérez', minutosActivos: 10 })
    expect(auditoria.historial.map((h) => h.accion)).toContain('Devuelta al revisor')
  })
})

describe('filtrarEntrada', () => {
  const entrada = { revisiones, sesiones, cuentas }

  it('sin filtros devuelve lo mismo', () => {
    expect(filtrarEntrada(entrada, {})).toBe(entrada)
  })

  it('por módulo, lote y estado', () => {
    expect(filtrarEntrada(entrada, { modulo: 'maniobras' }).revisiones.map((r) => r.documentoId)).toEqual(['20'])
    expect(filtrarEntrada(entrada, { lote: 'lote-1' }).revisiones.map((r) => r.documentoId)).toEqual(['10', '30'])
    expect(filtrarEntrada(entrada, { estado: 'publicada' }).revisiones.map((r) => r.documentoId)).toEqual(['40'])
  })

  it('por revisor: lo que tiene asignado, lo que validó y lo que abrió; con todas sus sesiones', () => {
    const soto = filtrarEntrada(entrada, { revisor: '3' })
    expect(soto.revisiones.map((r) => r.documentoId)).toEqual(['10', '20', '30'])
    // Las sesiones de las fichas que quedan, de quien sea.
    expect(soto.sesiones).toHaveLength(4)
    const perez = filtrarEntrada(entrada, { revisor: '2' })
    expect(perez.revisiones.map((r) => r.documentoId)).toEqual(['10'])
    expect(perez.sesiones).toHaveLength(2)
  })
})

describe('los tramos de edición y las semanas', () => {
  it('reparte los porcentajes en seis tramos, con el cero aparte', () => {
    expect(reparto([0, 0, 3, 5, 5.1, 15, 29, 45, 50, 51, 100])).toEqual([2, 2, 2, 1, 2, 2])
  })

  it('cuenta por semana, de lunes a domingo, las últimas n', () => {
    // El jueves 24 de septiembre de 2026: su lunes es el 21.
    const hoy = new Date(2026, 8, 24, 12)
    expect(lunesDe(hoy)).toBe('2026-09-21')
    const semanas = porSemana(
      ['2026-09-21T14:00:00.000Z', '2026-09-24T14:00:00.000Z', '2026-09-15T14:00:00.000Z', '2025-01-01T00:00:00.000Z', 'no es fecha'],
      3,
      hoy,
    )
    expect(semanas).toEqual([
      { lunes: '2026-09-07', total: 0 },
      { lunes: '2026-09-14', total: 1 },
      { lunes: '2026-09-21', total: 2 },
    ])
  })
})
