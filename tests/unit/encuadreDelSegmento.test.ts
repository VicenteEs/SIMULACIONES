import { describe, it, expect } from 'vitest'
import { encuadreDelSegmento } from '@/lib/encuadreDelSegmento'
import { segmentoDeLaPlataforma } from '@/lib/clasificacionAO'

/**
 * El recorte del atlas para cada segmento (D-237).
 *
 * El nombre lo escribe una persona en la colección `segmentos`, así que se
 * busca sin tildes ni mayúsculas. Lo que no está en la tabla sale sin recorte,
 * que es mejor que un recorte del sitio equivocado.
 */

describe('el recorte de cada segmento', () => {
  it('se encuentra sin tildes, mayúsculas ni espacios de más', () => {
    expect(encuadreDelSegmento('Muñeca y mano')).not.toBeNull()
    expect(encuadreDelSegmento('  MUÑECA   y Mano ')).toEqual(encuadreDelSegmento('Muñeca y mano'))
    expect(encuadreDelSegmento('Pelvis y acetábulo')).not.toBeNull()
  })

  it('sin nombre conocido no hay recorte', () => {
    expect(encuadreDelSegmento('Clavícula')).toBeNull()
    expect(encuadreDelSegmento('')).toBeNull()
    expect(encuadreDelSegmento(null)).toBeNull()
  })

  it('cae dentro de la captura y con un zoom que la llena', () => {
    // Un centro fuera de [0, 1] enseña el fondo azul; un zoom por debajo de 1
    // deja franjas vacías a los lados de la tarjeta.
    const nombres = ['Hombro', 'Brazo', 'Codo', 'Antebrazo', 'Muñeca y mano', 'Cadera', 'Muslo', 'Rodilla', 'Pierna', 'Tobillo y pie', 'Columna', 'Pelvis y acetábulo', 'Principios generales']
    for (const nombre of nombres) {
      const e = encuadreDelSegmento(nombre)
      expect(e, nombre).not.toBeNull()
      expect(e!.x).toBeGreaterThanOrEqual(0)
      expect(e!.x).toBeLessThanOrEqual(1)
      expect(e!.y).toBeGreaterThanOrEqual(0)
      expect(e!.y).toBeLessThanOrEqual(1)
      expect(e!.zoom).toBeGreaterThanOrEqual(1)
    }
  })

  it('cada segmento de la plataforma al que lleva un código AO tiene su recorte', () => {
    // Si la tabla de `clasificacionAO` nombra un segmento que aquí no está, la
    // técnica AO y el simulador de ese hueso salen sin imagen y nadie lo nota.
    for (const codigo of ['11', '12', '13', '21', '22', '23', '31', '32', '33', '41', '42', '43', '44', '51', '61']) {
      const segmento = segmentoDeLaPlataforma(`${codigo}-A1`)
      expect(segmento, codigo).not.toBeNull()
      expect(encuadreDelSegmento(segmento), `${codigo} → ${segmento}`).not.toBeNull()
    }
  })
})
