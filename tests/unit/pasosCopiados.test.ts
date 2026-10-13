import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_DE_FILA } from '@/admin/identidadDeBloques'
import { empaquetarPasos, esPasosCopiados, nombreDeArchivoDePasos, pegarPasos } from '@/lib/pasosCopiados'
import { muestrasEntre, esRectaValida, LARGO_MINIMO_DE_LA_RECTA_PX, TIPOS_DE_TRAZO } from '@/lib/trazoRecto'
import { copiarAlPortapapeles, leerDelPortapapeles, vaciarElPortapapeles } from '@/lib/portapapelesDePasos'

const pasoDe = (titulo: string, extra: Record<string, unknown> = {}) => ({
  id: `fila-${titulo}`,
  [CLAVE_DE_FILA]: `clave-${titulo}`,
  titulo,
  objetivo: 'instrumento',
  instrumento: { id: 12, nombre: 'Bisturí' },
  fase: 3,
  muestra: [
    { id: 'm1', nodo: 'piel', [CLAVE_DE_FILA]: 'x' },
    { id: 'm2', nodo: 'tibia', [CLAVE_DE_FILA]: 'y' },
  ],
  ...extra,
})

describe('copiar pasos', () => {
  it('copia solo los pasos elegidos, en su orden, sin los identificadores de fila', () => {
    const pasos = [pasoDe('A'), pasoDe('B'), pasoDe('C')]
    const copia = empaquetarPasos(pasos, [2, 0, 0, 7, -1], 'Caso de origen', new Date('2026-10-12T10:00:00Z'))
    expect(copia.version).toBe(1)
    expect(copia.desdeElCaso).toBe('Caso de origen')
    expect(copia.pasos.map((p) => p.titulo)).toEqual(['A', 'C'])
    for (const p of copia.pasos) {
      expect(p).not.toHaveProperty('id')
      expect(p).not.toHaveProperty(CLAVE_DE_FILA)
      for (const m of p.muestra as Record<string, unknown>[]) {
        expect(m).not.toHaveProperty('id')
        expect(m).not.toHaveProperty(CLAVE_DE_FILA)
      }
    }
  })

  it('el instrumento y la fase viajan como identificador, no como documento poblado', () => {
    const copia = empaquetarPasos([pasoDe('A')], [0], 'x')
    expect(copia.pasos[0].instrumento).toBe(12)
    expect(copia.pasos[0].fase).toBe(3)
  })

  it('no toca los pasos de origen', () => {
    const pasos = [pasoDe('A')]
    empaquetarPasos(pasos, [0], 'x')
    expect(pasos[0]).toHaveProperty('id')
    expect(pasos[0].instrumento).toEqual({ id: 12, nombre: 'Bisturí' })
  })

  it('reconoce lo que es una copia y lo que no', () => {
    expect(esPasosCopiados(empaquetarPasos([pasoDe('A')], [0], 'x'))).toBe(true)
    expect(esPasosCopiados(null)).toBe(false)
    expect(esPasosCopiados({ version: 2, pasos: [] })).toBe(false)
    expect(esPasosCopiados({ version: 1, pasos: ['no es un paso'] })).toBe(false)
  })
})

describe('pegar pasos', () => {
  const copia = empaquetarPasos([pasoDe('Posicionamiento'), pasoDe('Abordaje')], [0, 1], 'Origen')

  it('inserta después del paso indicado y deja el resto en su sitio', () => {
    const destino = [pasoDe('Uno'), pasoDe('Dos'), pasoDe('Tres')]
    const r = pegarPasos(destino, copia, 0, null)
    expect(r.pasos.map((p) => p.titulo)).toEqual(['Uno', 'Posicionamiento', 'Abordaje', 'Dos', 'Tres'])
    expect(r.pegados).toBe(2)
    expect(r.primero).toBe(1)
  })

  it('con −1 pega al principio y con un índice pasado del final, al final', () => {
    const destino = [pasoDe('Uno')]
    expect(pegarPasos(destino, copia, -1, null).pasos.map((p) => p.titulo)).toEqual(['Posicionamiento', 'Abordaje', 'Uno'])
    expect(pegarPasos(destino, copia, 99, null).pasos.map((p) => p.titulo)).toEqual(['Uno', 'Posicionamiento', 'Abordaje'])
  })

  it('cada paso pegado lleva una clave nueva y distinta: dos pegados no se confunden', () => {
    const r1 = pegarPasos([], copia, -1, null)
    const r2 = pegarPasos(r1.pasos, copia, 1, null)
    const claves = r2.pasos.map((p) => p[CLAVE_DE_FILA])
    expect(new Set(claves).size).toBe(claves.length)
    for (const p of r2.pasos) expect(p).not.toHaveProperty('id')
  })

  it('pegar el mismo paso dos veces no comparte filas internas entre las copias', () => {
    const r = pegarPasos(pegarPasos([], copia, -1, null).pasos, copia, 1, null)
    const a = r.pasos[0].muestra as Record<string, unknown>[]
    const b = r.pasos[2].muestra as Record<string, unknown>[]
    expect(a).not.toBe(b)
    expect(a[0][CLAVE_DE_FILA]).not.toBe(b[0][CLAVE_DE_FILA])
  })

  it('quita de «piezas que se ven» las que el modelo de destino no trae, y lo dice', () => {
    const r = pegarPasos([], copia, -1, ['piel', 'peroné'])
    const muestra = r.pasos[0].muestra as { nodo: string }[]
    expect(muestra.map((m) => m.nodo)).toEqual(['piel'])
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toMatch(/2 pasos/)
  })

  it('mientras el modelo no ha cargado no borra nada: preguntar antes de saber sería quitar lo que quizá sí estaba', () => {
    const r = pegarPasos([], copia, -1, null)
    expect((r.pasos[0].muestra as unknown[]).length).toBe(2)
    expect(r.avisos).toEqual([])
  })

  it('un paso sin lista de piezas queda sin ella: «lo mismo que el anterior»', () => {
    const sin = empaquetarPasos([pasoDe('A', { muestra: [] })], [0], 'x')
    const r = pegarPasos([], sin, -1, ['piel'])
    expect(r.pasos[0].muestra).toEqual([])
    expect(r.avisos).toEqual([])
  })

  it('el nombre del archivo es seguro: sin tildes, sin símbolos y con la fecha', () => {
    expect(nombreDeArchivoDePasos('Tibia diáfisis · 42-A2 (ejemplo)', new Date('2026-10-12T10:00:00Z'))).toBe(
      'pasos-tibia-diafisis-42-a2-ejemplo-2026-10-12.json',
    )
    expect(nombreDeArchivoDePasos('', new Date('2026-10-12T10:00:00Z'))).toBe('pasos-caso-2026-10-12.json')
  })
})

describe('el portapapeles de pasos en el navegador', () => {
  const almacen = new Map<string, string>()
  beforeEach(() => {
    almacen.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => almacen.get(k) ?? null,
      setItem: (k: string, v: string) => void almacen.set(k, v),
      removeItem: (k: string) => void almacen.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lo que se copia se puede leer y vaciar', () => {
    const copia = empaquetarPasos([pasoDe('A')], [0], 'Origen')
    expect(copiarAlPortapapeles(copia)).toBe(true)
    expect(leerDelPortapapeles()?.pasos).toHaveLength(1)
    vaciarElPortapapeles()
    expect(leerDelPortapapeles()).toBeNull()
  })

  it('un contenido que no es una copia se ignora en vez de romper el editor', () => {
    almacen.set('trauma-portapapeles-de-pasos', '{"cualquier":"cosa"}')
    expect(leerDelPortapapeles()).toBeNull()
    almacen.set('trauma-portapapeles-de-pasos', 'no es json')
    expect(leerDelPortapapeles()).toBeNull()
  })

  it('sin almacenamiento avisa de que no pudo y no tira', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(copiarAlPortapapeles(empaquetarPasos([pasoDe('A')], [0], 'x'))).toBe(false)
    expect(leerDelPortapapeles()).toBeNull()
    expect(() => vaciarElPortapapeles()).not.toThrow()
  })
})

describe('la incisión en línea recta', () => {
  it('reparte puntos equiespaciados entre los dos clics, extremos incluidos', () => {
    const puntos = muestrasEntre({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
    expect(puntos).toHaveLength(11)
    expect(puntos[0]).toEqual({ x: 0, y: 0 })
    expect(puntos[10]).toEqual({ x: 100, y: 0 })
    for (let i = 1; i < puntos.length; i++) expect(puntos[i].x - puntos[i - 1].x).toBeCloseTo(10, 9)
  })

  it('todos los puntos caen sobre la recta, también en diagonal', () => {
    const a = { x: 10, y: 20 }
    const b = { x: 130, y: 100 }
    for (const q of muestrasEntre(a, b, 7)) {
      const cruz = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)
      expect(Math.abs(cruz)).toBeLessThan(1e-6)
    }
  })

  it('una recta siempre tiene al menos dos puntos', () => {
    expect(muestrasEntre({ x: 0, y: 0 }, { x: 3, y: 0 }, 100)).toHaveLength(2)
    expect(muestrasEntre({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toHaveLength(2)
  })

  it('dos clics casi juntos no son una incisión', () => {
    expect(esRectaValida({ x: 0, y: 0 }, { x: LARGO_MINIMO_DE_LA_RECTA_PX - 1, y: 0 })).toBe(false)
    expect(esRectaValida({ x: 0, y: 0 }, { x: LARGO_MINIMO_DE_LA_RECTA_PX, y: 0 })).toBe(true)
  })

  it('se ofrecen las dos opciones: recta y mano alzada', () => {
    expect(TIPOS_DE_TRAZO.map((t) => t.valor)).toEqual(['recto', 'libre'])
  })
})
