import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { primerasPublicacionesDesde, repartirLecturas } from '@/app/(frontend)/admin-panel/resumen'
import { ultimosDias } from '@/lib/series'

/**
 * Las cifras del Resumen del panel que no son un `count` (D-238).
 *
 * Las dos se equivocaron la primera vez que se miraron en el navegador, con
 * datos de verdad: el chip de publicadas decía «+1.723» junto a diez fichas, y
 * la tarjeta de lecturas, «427 de residentes · 1 residente activo». Ninguno de
 * los dos errores se ve en una captura sin datos, y por eso están aquí.
 */

const HOY = new Date(2026, 10, 3, 16, 0)
const hace = (dias: number, hora = 10) => new Date(2026, 10, 3 - dias, hora).toISOString()

describe('fichas publicadas esta semana', () => {
  const desde = new Date(2026, 9, 27)
  const vigentes = new Set(['patologias/1', 'patologias/2', 'maniobras/7'])

  it('cuenta fichas, no eventos: volver a publicar una ficha no la suma otra vez', () => {
    const eventos = [
      { coleccion: 'patologias', documentoId: '1', fecha: hace(2) },
      { coleccion: 'patologias', documentoId: '1', fecha: hace(1) },
      { coleccion: 'patologias', documentoId: '1', fecha: hace(0) },
    ]
    expect(primerasPublicacionesDesde(eventos, vigentes, desde)).toBe(1)
  })

  it('una ficha publicada antes de la semana y corregida en ella no es nueva', () => {
    const eventos = [
      { coleccion: 'patologias', documentoId: '2', fecha: hace(40) },
      { coleccion: 'patologias', documentoId: '2', fecha: hace(1) },
      { coleccion: 'maniobras', documentoId: '7', fecha: hace(3) },
    ]
    expect(primerasPublicacionesDesde(eventos, vigentes, desde)).toBe(1)
  })

  it('una ficha que ya no está publicada no hace crecer el total', () => {
    const eventos = [{ coleccion: 'patologias', documentoId: '99', fecha: hace(1) }]
    expect(primerasPublicacionesDesde(eventos, vigentes, desde)).toBe(0)
  })
})

describe('lecturas por día', () => {
  const dias = ultimosDias(14, HOY)
  const etapaDe = new Map([['10', 'r1'], ['11', 'r3']])
  const aperturas = [
    { fecha: hace(0), rol: 'lector', usuario: 10 },
    { fecha: hace(0), rol: 'lector', usuario: 10 },
    { fecha: hace(2), rol: 'lector', usuario: { id: 11 } },
    { fecha: hace(2), rol: 'editor', usuario: 3 },
    { fecha: hace(10), rol: 'lector', usuario: 11 },
    { fecha: hace(30), rol: 'lector', usuario: 11 },
  ]

  it('separa a los residentes del equipo, día por día', () => {
    const r = repartirLecturas(aperturas, dias, etapaDe)
    expect(r.residentes.reduce((t, v) => t + v, 0)).toBe(4)
    expect(r.residentes[13]).toBe(2)
    expect(r.equipo[11]).toBe(1)
  })

  it('las personas activas salen de las mismas aperturas que las lecturas', () => {
    const r = repartirLecturas(aperturas, dias, etapaDe)
    expect(r.residentesActivos7dias).toBe(2)
    expect(r.primerAno7dias).toBe(2)
  })
})

describe('la consulta de lecturas', () => {
  const fuente = readFileSync(join(process.cwd(), 'src', 'app', '(frontend)', 'admin-panel', 'resumen.ts'), 'utf8')

  it('pide las aperturas por lo que son: con «la abrió» o sin detalle, no «distinto de marcada»', () => {
    // `not_equals` es un `!=` de SQL y deja fuera las filas sin detalle, que
    // son todas las aperturas anteriores a que se escribiera «la abrió».
    expect(fuente).toContain("{ or: [{ detalle: { equals: 'la abrió' } }, { detalle: { exists: false } }] }")
    expect(fuente).not.toMatch(/detalle: \{ not_equals/)
  })
})
