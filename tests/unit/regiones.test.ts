import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REGIONES, REGION_OTROS, agruparEnRegiones, regionDeSegmento } from '@/lib/regiones'

/**
 * Las regiones anatómicas (D-157).
 *
 * Es presentación pura, pero hay una cosa que no se puede dejar caer: que a
 * ninguna ficha le pase lo que a una maniobra sin segmento antes de
 * `agruparManiobrasPorSegmento`, que desaparece del listado. Por eso la mitad de
 * estas pruebas es sobre lo que **no** reconoce la tabla.
 */

/**
 * Los trece segmentos que usa la plataforma: los siete que traía la base de
 * partida (Hombro, Codo, Muñeca y mano, Cadera, Rodilla, Pierna, Tobillo y pie)
 * y los seis que la ingesta puede crear (`SEGMENTOS_NUEVOS_PERMITIDOS` de
 * `docs/ingesta/PROMPT-DE-INGESTA.md`). Si se añade uno a cualquiera de los dos
 * sitios y no a la tabla, aterriza en «Otros» y esta prueba es la que avisa.
 */
const SEGMENTOS_DE_LA_PLATAFORMA = [
  'Hombro',
  'Brazo',
  'Codo',
  'Antebrazo',
  'Muñeca y mano',
  'Cadera',
  'Muslo',
  'Rodilla',
  'Pierna',
  'Tobillo y pie',
  'Columna',
  'Pelvis y acetábulo',
  'Principios generales',
]

describe('la tabla de regiones', () => {
  it('cubre los trece segmentos de la plataforma, y ninguno cae en «Otros»', () => {
    for (const nombre of SEGMENTOS_DE_LA_PLATAFORMA) {
      expect(regionDeSegmento(nombre).region, `«${nombre}» no tiene región`).not.toBe(REGION_OTROS)
    }
  })

  it('la lista de la prueba sigue siendo la de la ingesta', () => {
    // Si el prompt de ingesta permite un segmento más, esta prueba tiene que
    // enterarse: es la manera de que la tabla no se quede atrás en silencio.
    const prompt = readFileSync(join(process.cwd(), 'docs', 'ingesta', 'PROMPT-DE-INGESTA.md'), 'utf8')
    const linea = /SEGMENTOS_NUEVOS_PERMITIDOS \| ([^|]+)\|/.exec(prompt)?.[1] ?? ''
    const permitidos = linea.split(';').map((s) => s.trim()).filter(Boolean)
    expect(permitidos.length).toBeGreaterThan(0)
    for (const nombre of permitidos) expect(SEGMENTOS_DE_LA_PLATAFORMA).toContain(nombre)
  })

  it('no repite un segmento en dos regiones', () => {
    const todos = REGIONES.flatMap((r) => r.segmentos)
    expect(new Set(todos).size).toBe(todos.length)
  })

  it('reparte cada segmento donde corresponde', () => {
    expect(regionDeSegmento('Codo').region.titulo).toBe('Miembro superior')
    expect(regionDeSegmento('Rodilla').region.titulo).toBe('Miembro inferior')
    expect(regionDeSegmento('Columna').region.titulo).toBe('Esqueleto axial')
    expect(regionDeSegmento('Pelvis y acetábulo').region.titulo).toBe('Esqueleto axial')
    expect(regionDeSegmento('Principios generales').region.titulo).toBe('Generales')
  })

  it('reconoce el nombre sin importar tildes ni mayúsculas', () => {
    // El nombre lo escribe una persona en el panel.
    expect(regionDeSegmento('MUÑECA Y MANO').region.titulo).toBe('Miembro superior')
    expect(regionDeSegmento('pelvis y acetabulo').region.titulo).toBe('Esqueleto axial')
    expect(regionDeSegmento('  hombro ').region.titulo).toBe('Miembro superior')
  })

  it('lo desconocido, y lo que ni es texto, va a «Otros»', () => {
    expect(regionDeSegmento('Mano izquierda').region).toBe(REGION_OTROS)
    expect(regionDeSegmento('Otras maniobras').region).toBe(REGION_OTROS)
    expect(regionDeSegmento(undefined).region).toBe(REGION_OTROS)
    expect(regionDeSegmento(null).region).toBe(REGION_OTROS)
    expect(regionDeSegmento(12).region).toBe(REGION_OTROS)
  })
})

describe('agruparEnRegiones', () => {
  const g = (titulo: string) => ({ titulo, lista: [titulo] })

  it('ordena las regiones como la tabla y los segmentos de proximal a distal', () => {
    // Llegan en el desorden en que los dejó el campo `orden` de la base.
    const grupos = ['Tobillo y pie', 'Codo', 'Principios generales', 'Hombro', 'Rodilla', 'Columna', 'Muñeca y mano', 'Cadera'].map(g)
    const salida = agruparEnRegiones(grupos)
    expect(salida.map((r) => r.region.titulo)).toEqual([
      'Miembro superior',
      'Miembro inferior',
      'Esqueleto axial',
      'Generales',
    ])
    expect(salida[0].grupos.map((x) => x.titulo)).toEqual(['Hombro', 'Codo', 'Muñeca y mano'])
    expect(salida[1].grupos.map((x) => x.titulo)).toEqual(['Cadera', 'Rodilla', 'Tobillo y pie'])
  })

  it('no pierde ningún grupo, ni siquiera los que la tabla no conoce', () => {
    const grupos = ['Codo', 'Segmento nuevo', 'Otras maniobras', 'Cadera'].map(g)
    const salida = agruparEnRegiones(grupos)
    const vueltos = salida.flatMap((r) => r.grupos.map((x) => x.titulo)).sort()
    expect(vueltos).toEqual(['Cadera', 'Codo', 'Otras maniobras', 'Segmento nuevo'])
    // «Otros» al final, y los desconocidos en el orden en que llegaron.
    const ultima = salida[salida.length - 1]
    expect(ultima.region).toBe(REGION_OTROS)
    expect(ultima.grupos.map((x) => x.titulo)).toEqual(['Segmento nuevo', 'Otras maniobras'])
  })

  it('no devuelve una región sin grupos', () => {
    const salida = agruparEnRegiones([g('Codo')])
    expect(salida).toHaveLength(1)
    expect(agruparEnRegiones([])).toEqual([])
  })

  it('conserva el resto de lo que lleva cada grupo', () => {
    const salida = agruparEnRegiones([{ titulo: 'Codo', lista: [1, 2, 3], clave: 'segmento-3' }])
    expect(salida[0].grupos[0]).toEqual({ titulo: 'Codo', lista: [1, 2, 3], clave: 'segmento-3' })
  })
})
