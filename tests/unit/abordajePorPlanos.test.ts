import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LIMITE_DEL_LABIO_MM,
  LIMITE_PARA_COLOCAR_MM,
  avisoDelClicSinEfecto,
  correrElApoyo,
  decidirElClicDelSeparador,
  invertirLaDireccion,
  ordenDeLosPlanos,
  type CandidatoDeHerida,
} from '@/lib/abordajePorPlanos'
import { retraerVertices } from '@/lib/retraccion'
import { aplicarUnaRetraccion, estadoDeLasRetracciones, retraccionActivaDe, type RetraccionDeMusculo } from '@/components/simulador/LienzoQuirurgico'

/**
 * El abordaje por planos de corrido (P-004 E5, pedidos 8 y 10 de Cristóbal).
 *
 * Lo que se promete: el plano lo decide el clic, un músculo se separa con un clic sin abrir la ficha, el siguiente clic
 * deja el anterior retraído, y un músculo se puede apartar hacia el otro lado o correr a lo largo.
 */

const sinHerida = (plano: 'piel' | 'musculo'): CandidatoDeHerida => ({ plano, cercaMm: null })
const aMm = (plano: 'piel' | 'musculo', cercaMm: number): CandidatoDeHerida => ({ plano, cercaMm })

describe('decidirElClicDelSeparador · plano automático', () => {
  it('sobre el labio de una herida de la piel, apoya el separador en la piel', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'piel', candidatos: [sinHerida('musculo'), aMm('piel', 2)], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'colocar', plano: 'piel' })
  })

  it('el Farabeuf queda puesto en una herida del músculo sin haber elegido «Músculo» (el fallo de Cristóbal)', () => {
    // Antes: plano «piel» por omisión, sin herida en la piel, y el clic no hacía nada.
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('musculo', 3), sinHerida('piel')], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'colocar', plano: 'musculo' })
  })

  it('con heridas en los dos planos gana el que se ve bajo el cursor', () => {
    const candidatos = [aMm('musculo', 4), aMm('piel', 4)]
    expect(decidirElClicDelSeparador({ rolDelGolpe: 'piel', candidatos, puedeSepararMusculos: true })).toEqual({ accion: 'colocar', plano: 'piel' })
    expect(decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos, puedeSepararMusculos: true })).toEqual({ accion: 'colocar', plano: 'musculo' })
  })

  it('sobre un músculo, lejos de todo labio, lo separa de una vez', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('piel', LIMITE_DEL_LABIO_MM + 1), sinHerida('musculo')], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'separar-musculo' })
  })

  it('sin ninguna herida, un músculo a la vista también se separa', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [sinHerida('musculo'), sinHerida('piel')], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'separar-musculo' })
  })

  it('el que no puede separar músculos (el Hohmann apoya en el hueso) cae a la herida más cercana', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('piel', 15)], puedeSepararMusculos: false })
    expect(d).toEqual({ accion: 'colocar', plano: 'piel' })
  })

  it('sobre la piel y lejos de toda herida no hace nada, y dice por qué', () => {
    const lejos = decidirElClicDelSeparador({ rolDelGolpe: 'piel', candidatos: [aMm('piel', LIMITE_PARA_COLOCAR_MM + 10)], puedeSepararMusculos: true })
    expect(lejos).toEqual({ accion: 'nada', motivo: 'lejos' })
    const sin = decidirElClicDelSeparador({ rolDelGolpe: 'piel', candidatos: [sinHerida('piel'), sinHerida('musculo')], puedeSepararMusculos: true })
    expect(sin).toEqual({ accion: 'nada', motivo: 'sin-herida' })
  })

  it('el límite del labio es inclusivo', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('musculo', LIMITE_DEL_LABIO_MM)], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'colocar', plano: 'musculo' })
  })

  it('sin nada bajo el cursor, la herida más profunda a distancia', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: null, candidatos: [aMm('piel', 20), aMm('musculo', 25)], puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'colocar', plano: 'musculo' })
  })
})

describe('decidirElClicDelSeparador · plano forzado', () => {
  it('«Piel» busca solo en la piel, aunque el clic caiga sobre un músculo', () => {
    const d = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('musculo', 2), sinHerida('piel')], planoForzado: 'piel', puedeSepararMusculos: true })
    expect(d).toEqual({ accion: 'nada', motivo: 'sin-herida' })
  })

  it('«Músculo» coloca en el músculo si la herida está cerca, y nunca retrae', () => {
    const cerca = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('musculo', 20)], planoForzado: 'musculo', puedeSepararMusculos: true })
    expect(cerca).toEqual({ accion: 'colocar', plano: 'musculo' })
    const lejos = decidirElClicDelSeparador({ rolDelGolpe: 'musculo', candidatos: [aMm('musculo', 80)], planoForzado: 'musculo', puedeSepararMusculos: true })
    expect(lejos).toEqual({ accion: 'nada', motivo: 'lejos' })
  })

  it('`auto` explícito es lo mismo que no decir nada', () => {
    const entrada = { rolDelGolpe: 'musculo', candidatos: [sinHerida('musculo'), sinHerida('piel')], puedeSepararMusculos: true }
    expect(decidirElClicDelSeparador({ ...entrada, planoForzado: 'auto' })).toEqual(decidirElClicDelSeparador(entrada))
  })
})

describe('el orden de los planos y los avisos', () => {
  it('sobre la piel se prueba la piel primero; en cualquier otro caso, lo más profundo', () => {
    expect(ordenDeLosPlanos('piel')).toEqual(['piel', 'musculo'])
    expect(ordenDeLosPlanos('musculo')).toEqual(['musculo', 'piel'])
    expect(ordenDeLosPlanos(null)).toEqual(['musculo', 'piel'])
  })

  it('los avisos dicen qué falta', () => {
    expect(avisoDelClicSinEfecto('sin-herida', false, true)).toContain('haga clic en un músculo')
    expect(avisoDelClicSinEfecto('sin-herida', true, true)).toContain('Automático')
    expect(avisoDelClicSinEfecto('lejos', true, true)).toContain('borde de la herida')
  })
})

describe('apartar hacia el otro lado y correr a lo largo', () => {
  it('invertir la dirección la cambia de signo y volver a invertir la devuelve', () => {
    const d: [number, number, number] = [0.3, -0.5, 0.8]
    const al = invertirLaDireccion(d)
    expect(al).toEqual([-0.3, 0.5, -0.8])
    expect(invertirLaDireccion(al)).toEqual(d)
  })

  it('correr el apoyo suma el eje por la distancia', () => {
    expect(correrElApoyo([1, 2, 3], [0, 0, 1], 0.5)).toEqual([1, 2, 3.5])
    expect(correrElApoyo([1, 2, 3], [0, 0, 1], -2)).toEqual([1, 2, 1])
  })

  it('con la dirección invertida los vértices cercanos van al lado contrario y cerrar los devuelve', () => {
    const original = Float32Array.from([0, 0, 0, 0.01, 0, 0, 0.5, 0, 0])
    const destino = new Float32Array(original.length)
    retraerVertices(original, destino, [0, 0, 0], [0, 1, 0], 0.02, 0.04)
    const arriba = destino[1]
    expect(arriba).toBeGreaterThan(0)
    retraerVertices(original, destino, [0, 0, 0], invertirLaDireccion([0, 1, 0]), 0.02, 0.04)
    expect(destino[1]).toBeCloseTo(-arriba, 9)
    // El vértice lejano no se entera en ningún sentido.
    expect(destino[7]).toBe(0)
  })
})

describe('la lista de las retracciones', () => {
  const unaRetraccion = (id: number, nodo: string): RetraccionDeMusculo => {
    const malla = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04, 10, 2, 2), new THREE.MeshStandardMaterial())
    malla.name = nodo
    const p = malla.geometry.getAttribute('position') as THREE.BufferAttribute
    return {
      id,
      nodo,
      nombre: 'Farabeuf',
      malla,
      original: Float32Array.from(p.array as ArrayLike<number>),
      apoyo: new THREE.Vector3(-0.2, 0, 0),
      direccion: new THREE.Vector3(0, 1, 0),
      aperturaMm: 10,
      maximoMm: 40,
    }
  }

  it('sin elegir ninguna, la activa es la última; elegida una, es esa', () => {
    const lista = [unaRetraccion(1, 'Tibial_anterior'), unaRetraccion(2, 'Extensor_largo')]
    expect(retraccionActivaDe({ retracciones: lista })?.id).toBe(2)
    expect(retraccionActivaDe({ retracciones: lista, retraccionActiva: 1 })?.id).toBe(1)
    // Una elegida que ya no está puesta no deja a la rueda sin músculo.
    expect(retraccionActivaDe({ retracciones: lista, retraccionActiva: 9 })?.id).toBe(2)
  })

  it('el estado marca una sola fila como activa', () => {
    const lista = [unaRetraccion(1, 'Tibial_anterior'), unaRetraccion(2, 'Extensor_largo')]
    const estado = estadoDeLasRetracciones({ retracciones: lista, retraccionActiva: 1 })
    expect(estado.lista.map((f) => f.activa)).toEqual([true, false])
    expect(estado.lista.map((f) => f.id)).toEqual([1, 2])
  })

  it('dos músculos retraídos a la vez no se pisan: cada uno tiene su malla y sus originales', () => {
    const a = unaRetraccion(1, 'Tibial_anterior')
    const b = unaRetraccion(2, 'Extensor_largo')
    expect(aplicarUnaRetraccion(a, 0.001)).toBe(true)
    expect(aplicarUnaRetraccion(b, 0.001)).toBe(true)
    const ya = Array.from((a.malla.geometry.getAttribute('position') as THREE.BufferAttribute).array)
    b.aperturaMm = 0
    aplicarUnaRetraccion(b, 0.001)
    expect(Array.from((a.malla.geometry.getAttribute('position') as THREE.BufferAttribute).array)).toEqual(ya)
  })
})

describe('el cableado', () => {
  const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('el lienzo decide con la función de lib y ya no exige un músculo elegido en la ficha', () => {
    expect(lienzo).toContain('decidirElClicDelSeparador({')
    expect(lienzo).not.toContain('es el músculo que eligió para separar')
    expect(lienzo).toContain("planoDelSeparador = 'auto'")
  })

  it('el panel arranca en «Automático» y lista las estructuras separadas con «Cortar» y «Otro lado»', () => {
    expect(consola).toContain("useState<'auto' | 'piel' | 'musculo'>('auto')")
    expect(consola).toContain('Estructuras separadas')
    expect(consola).toContain('cortarElMusculoSeparado(r.nodo)')
    expect(consola).toContain('invertirRetraccion(r.id)')
  })

  it('Mayúsculas + rueda corre la zona retraída solo cuando hay un músculo retraído', () => {
    expect(consola).toMatch(/const correLaRetraccion = ruedaDelInstrumento === 'separa' && retracciones\.length > 0/)
    expect(consola).toContain('m.correrRetraccion(sentido * 2)')
  })
})

describe('el labio crece con la vista', () => {
  it('con la pierna entera a la vista un clic a 14 mm del labio sigue siendo del labio, no del músculo', () => {
    const entrada = { rolDelGolpe: 'musculo', candidatos: [aMm('musculo', 14)], puedeSepararMusculos: true }
    expect(decidirElClicDelSeparador(entrada)).toEqual({ accion: 'separar-musculo' })
    expect(decidirElClicDelSeparador({ ...entrada, limiteDelLabioMm: 24 })).toEqual({ accion: 'colocar', plano: 'musculo' })
  })

  it('nunca baja del límite de siempre, ni siquiera con el zoom encima', () => {
    const entrada = { rolDelGolpe: 'musculo', candidatos: [aMm('musculo', LIMITE_DEL_LABIO_MM - 1)], puedeSepararMusculos: true, limiteDelLabioMm: 0.5 }
    expect(decidirElClicDelSeparador(entrada)).toEqual({ accion: 'colocar', plano: 'musculo' })
  })
})

describe('cortar un músculo retraído', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src', 'components', 'simulador', 'LienzoQuirurgico.tsx'), 'utf8').replace(/\r\n/g, '\n')

  it('la retracción de la malla que se corta se retira de la lista: sus originales eran los de la geometría vieja', () => {
    expect(lienzo).toMatch(/const cortadosRetraidos = \(t\.retracciones \?\? \[\]\)\.filter\(\(r\) => hechas\.some\(\(h\) => h\.malla === r\.malla\)\)/)
  })

  it('volver a pinchar un músculo cuya malla cambió parte de las posiciones de ahora y no de las viejas', () => {
    expect(lienzo).toContain('previa && previa.original.length === atributo.array.length ? previa.original')
  })
})
