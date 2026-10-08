import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CATEGORIAS_DE_INSTRUMENTAL,
  INSTRUMENTAL_BASE,
  slugDeArchivo,
  slugDeInstrumento,
} from '@/lib/instrumental'
import {
  ajustesValidos,
  cuaternionDeEje,
  hayRetoques,
  metaDeNodo,
  metaDeRaiz,
  movimientoDelNodo,
  multiplicarCuaterniones,
} from '@/instrumental/modelo'

describe('el catálogo base del instrumental', () => {
  it('no repite slugs ni nombres', () => {
    const slugs = INSTRUMENTAL_BASE.map((i) => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const nombres = INSTRUMENTAL_BASE.map((i) => i.nombre)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it('usa solo categorías que existen', () => {
    const validas = new Set(CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value))
    for (const i of INSTRUMENTAL_BASE) expect(validas.has(i.categoria), i.slug).toBe(true)
  })

  it('cada slug es lo que saldría de su propio nombre de archivo', () => {
    // El enlace automático de «Cargar varios modelos» casa por el slug del
    // nombre del archivo: si un slug no sobrevive a esa conversión, ese modelo
    // se cargaría como «sin instrumento» y no habría error que lo dijera.
    for (const i of INSTRUMENTAL_BASE) expect(slugDeArchivo(`${i.slug}.glb`), i.slug).toBe(i.slug)
  })

  it('cada entrada tiene su ficha completa', () => {
    for (const i of INSTRUMENTAL_BASE) {
      expect(i.nombre.length, i.slug).toBeGreaterThan(3)
      expect(i.descripcion.length, i.slug).toBeGreaterThan(5)
      expect(i.especificaciones.length, i.slug).toBeGreaterThan(5)
    }
  })

  it('cada modelo generado en ejemplos/ tiene su entrada, si la carpeta existe', () => {
    // `ejemplos/` no está en el repositorio (git la ignora): en la máquina que
    // genera los modelos esta prueba vigila que el catálogo no se quede atrás.
    const carpeta = join(process.cwd(), 'ejemplos', 'instrumental')
    if (!existsSync(carpeta)) return
    const base = new Set(INSTRUMENTAL_BASE.map((i) => i.slug))
    const sinEntrada = readdirSync(carpeta)
      .filter((f) => f.endsWith('.glb'))
      .map(slugDeArchivo)
      .filter((s) => !base.has(s))
    expect(sinEntrada).toEqual([])
  })
})

describe('slugDeInstrumento', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(slugDeInstrumento('Tijera de Mayo (recta)')).toBe('tijera-de-mayo-recta')
    expect(slugDeInstrumento('  Periostótomo — Lambotte ')).toBe('periostotomo-lambotte')
  })
})

describe('lo que el modelo lleva escrito dentro', () => {
  const extrasRaiz = {
    th: JSON.stringify({
      instrumento: 'tijera-mayo',
      nombre: 'Tijera de Mayo',
      medidas: '170 mm',
      articulaciones: [
        { nombre: 'Apertura', etiqueta: 'Abrir', min: 0, max: 42, unidad: '°', inicial: 0 },
        { sinNombre: true },
        'basura',
      ],
    }),
  }

  it('lee la raíz y descarta articulaciones mal formadas', () => {
    const meta = metaDeRaiz(extrasRaiz)
    expect(meta?.instrumento).toBe('tijera-mayo')
    expect(meta?.articulaciones).toHaveLength(1)
    expect(meta?.articulaciones[0]).toMatchObject({ nombre: 'Apertura', max: 42, unidad: '°' })
  })

  it('no se fía de extras ausentes, rotos o de otra forma', () => {
    expect(metaDeRaiz(undefined)).toBeNull()
    expect(metaDeRaiz({ th: 'no es json' })).toBeNull()
    expect(metaDeRaiz({ th: '[1,2]' })).toBeNull()
    expect(metaDeRaiz({ th: JSON.stringify({ nombre: 'sin instrumento' }) })).toBeNull()
    expect(metaDeNodo({ th: JSON.stringify({ mueve: 'A', eje: [0, 0, 0] }) })).toBeNull()
    expect(metaDeNodo({ th: JSON.stringify({ mueve: 'A', eje: [1, 0] }) })).toBeNull()
  })

  it('normaliza el eje del nodo', () => {
    const nodo = metaDeNodo({ th: JSON.stringify({ mueve: 'Apertura', tipo: 'giro', eje: [0, 0, 2], factor: 0.5 }) })
    expect(nodo?.eje).toEqual([0, 0, 1])
    expect(nodo?.factor).toBe(0.5)
  })
})

describe('movimientoDelNodo', () => {
  it('un giro de 90° alrededor de Z da el cuaternión esperado, con el factor aplicado', () => {
    const { girar, mover } = movimientoDelNodo({ mueve: 'A', tipo: 'giro', eje: [0, 0, 1], factor: 0.5 }, 180)
    expect(mover).toEqual([0, 0, 0])
    expect(girar[2]).toBeCloseTo(Math.SQRT1_2, 6)
    expect(girar[3]).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('un deslizador mueve en metros a lo largo de su eje y no gira', () => {
    const { girar, mover } = movimientoDelNodo({ mueve: 'Medición', tipo: 'desliza', eje: [0, 1, 0], factor: -1 }, 20)
    expect(girar).toEqual([0, 0, 0, 1])
    expect(mover[1]).toBeCloseTo(-0.02, 9)
  })

  it('componer un giro con su inverso devuelve la identidad', () => {
    const q = cuaternionDeEje([0, 1, 0], 0.7)
    const inv = cuaternionDeEje([0, 1, 0], -0.7)
    const r = multiplicarCuaterniones(inv, q)
    expect(r[0]).toBeCloseTo(0, 9)
    expect(r[1]).toBeCloseTo(0, 9)
    expect(r[2]).toBeCloseTo(0, 9)
    expect(r[3]).toBeCloseTo(1, 9)
  })
})

describe('ajustesValidos', () => {
  it('conserva lo bueno y descarta lo que no sirve', () => {
    const a = ajustesValidos({
      partes: {
        tornillo: { ocultar: true, color: '#AABBCC' },
        malo: { color: 'rojo', mover: [1, 0, 0], girar: [0, 0, 0, 0] },
        movida: { mover: [0.001, 0, 0], girar: [0, 0, 2, 2] },
        vacia: { ocultar: false },
        '': { ocultar: true },
      },
      articulaciones: { Apertura: 30, Rota: Number.NaN, Enorme: 1e9 },
    })
    expect(a.partes?.tornillo).toEqual({ ocultar: true, color: '#aabbcc' })
    expect(a.partes?.malo).toBeUndefined() // traslado de un metro y giro de largo cero
    expect(a.partes?.movida?.mover).toEqual([0.001, 0, 0])
    expect(a.partes?.movida?.girar?.[2]).toBeCloseTo(Math.SQRT1_2, 6)
    expect(a.partes?.vacia).toBeUndefined()
    expect(a.partes?.['']).toBeUndefined()
    expect(a.articulaciones).toEqual({ Apertura: 30 })
  })

  it('un valor de otra forma da un objeto vacío', () => {
    expect(ajustesValidos(null)).toEqual({})
    expect(ajustesValidos('x')).toEqual({})
    expect(ajustesValidos({ partes: [1], articulaciones: 3 })).toEqual({})
  })

  it('no admite más partes retocadas que el máximo', () => {
    const partes: Record<string, unknown> = {}
    for (let i = 0; i < 400; i++) partes[`p${i}`] = { ocultar: true }
    expect(Object.keys(ajustesValidos({ partes }).partes ?? {})).toHaveLength(200)
  })

  it('hayRetoques distingue lo vacío de lo retocado', () => {
    expect(hayRetoques(null)).toBe(false)
    expect(hayRetoques({})).toBe(false)
    expect(hayRetoques({ partes: {} })).toBe(false)
    expect(hayRetoques({ articulaciones: { A: 1 } })).toBe(true)
  })
})
