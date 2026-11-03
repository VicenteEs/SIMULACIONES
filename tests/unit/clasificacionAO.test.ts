import { describe, it, expect } from 'vitest'
import {
  ejercicioDeClasificacion,
  leerCodigoAO,
  segmentoAO,
  segmentoDeLaPlataforma,
} from '@/lib/clasificacionAO'

/**
 * El código AO/OTA como lo escriben las personas (D-237).
 *
 * El código une la ficha con su técnica y su caso, arma el ejercicio de la
 * lectura de imágenes y elige el recorte del atlas. Lo escribe a mano quien
 * redacta, así que llega con prefijos, espacios y cifras alrededor que no son
 * el código: leer «2026» o «120 mm» como un código haría ofrecer técnicas de
 * otro hueso sin que nada falle.
 */

describe('leer un código', () => {
  it('con tipo y grupo, con o sin guion ni prefijo', () => {
    expect(leerCodigoAO('42-A2')).toEqual({ hueso: 4, segmento: 2, tipo: 'A', grupo: 2 })
    expect(leerCodigoAO('AO/OTA 42-A2')).toEqual({ hueso: 4, segmento: 2, tipo: 'A', grupo: 2 })
    expect(leerCodigoAO('42A2')).toEqual({ hueso: 4, segmento: 2, tipo: 'A', grupo: 2 })
    expect(leerCodigoAO('23 - c3')).toEqual({ hueso: 2, segmento: 3, tipo: 'C', grupo: 3 })
  })

  it('el subgrupo no estorba', () => {
    expect(leerCodigoAO('42-A2.1')).toEqual({ hueso: 4, segmento: 2, tipo: 'A', grupo: 2 })
  })

  it('solo el segmento, sin tipo', () => {
    expect(leerCodigoAO('AO/OTA 42')).toEqual({ hueso: 4, segmento: 2, tipo: null, grupo: null })
  })

  it('no confunde un año, una medida ni un decimal con un código', () => {
    expect(leerCodigoAO('2026')).toBeNull()
    expect(leerCodigoAO('120 mm')).toBeNull()
    expect(leerCodigoAO('desplazamiento de 3.42 cm')).toBeNull()
  })

  it('la clavícula con su región se lee como segmento, sin tipo', () => {
    // «15.2A» es la diáfisis de la clavícula en el compendio de 2018: la cifra
    // tras el punto es la región, no un grupo. Leer la «A» como su tipo
    // armaría un ejercicio con los tipos de un hueso largo.
    expect(leerCodigoAO('15.2A')).toEqual({ hueso: 1, segmento: 5, tipo: null, grupo: null })
    expect(ejercicioDeClasificacion('15.2A')).toBeNull()
  })

  it('sin texto no hay código', () => {
    expect(leerCodigoAO('')).toBeNull()
    expect(leerCodigoAO(null)).toBeNull()
    expect(leerCodigoAO(42)).toBeNull()
  })
})

describe('el segmento', () => {
  it('une códigos del mismo hueso y segmento, sea cual sea su tipo', () => {
    expect(segmentoAO('42-A2')).toBe('42')
    expect(segmentoAO('42-C1')).toBe('42')
    expect(segmentoAO('sin código')).toBeNull()
  })

  it('cae en el segmento de la plataforma por su extremo, no por el hueso', () => {
    expect(segmentoDeLaPlataforma('11-A1')).toBe('Hombro')
    expect(segmentoDeLaPlataforma('41-B2')).toBe('Rodilla')
    expect(segmentoDeLaPlataforma('42-A2')).toBe('Pierna')
    expect(segmentoDeLaPlataforma('44-B1')).toBe('Tobillo y pie')
    expect(segmentoDeLaPlataforma('61-A1')).toBe('Pelvis y acetábulo')
    expect(segmentoDeLaPlataforma('15-A1')).toBeNull()
  })
})

describe('el ejercicio de clasificación', () => {
  it('se arma con el tipo del código como respuesta', () => {
    const ejercicio = ejercicioDeClasificacion('23-A2')
    expect(ejercicio?.segmento).toBe('23')
    expect(ejercicio?.correcto).toBe('A')
    expect(ejercicio?.tipos.map((t) => t.tipo)).toEqual(['A', 'B', 'C'])
    expect(ejercicio?.tipos[0].nombre).toBe('Extraarticular')
  })

  it('las diáfisis se clasifican por fragmentos y los extremos por la articulación', () => {
    expect(ejercicioDeClasificacion('42-B1')?.tipos[1].nombre).toBe('En cuña')
    expect(ejercicioDeClasificacion('33-C1')?.tipos[2].nombre).toBe('Articular completa')
  })

  it('los tres segmentos con regla propia', () => {
    expect(ejercicioDeClasificacion('11-B1')?.tipos[1].nombre).toBe('Extraarticular bifocal')
    expect(ejercicioDeClasificacion('31-B2')?.tipos[1].nombre).toBe('Cuello femoral')
    expect(ejercicioDeClasificacion('44-C1')?.tipos[2].nombre).toBe('Suprasindesmal')
  })

  it('sin tipo, o de un segmento sin tabla, no hay ejercicio: la página se lee como antes', () => {
    expect(ejercicioDeClasificacion('42')).toBeNull()
    expect(ejercicioDeClasificacion('15-A1')).toBeNull()
    expect(ejercicioDeClasificacion(null)).toBeNull()
  })

  it('cada segmento trae su pista', () => {
    for (const codigo of ['11-A1', '12-A1', '13-A1', '21-A1', '22-A1', '23-A1', '31-A1', '32-A1', '33-A1', '41-A1', '42-A1', '43-A1', '44-A1']) {
      expect(ejercicioDeClasificacion(codigo)?.pista, codigo).toBeTruthy()
    }
  })
})
