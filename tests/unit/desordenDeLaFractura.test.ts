import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ANGULO_MAXIMO_GRADOS,
  ANGULO_MINIMO_GRADOS,
  DESPLAZAMIENTO_MAXIMO_M,
  DESPLAZAMIENTO_MINIMO_M,
  anguloDeLaTransformacion,
  desordenarLosFragmentos,
  distanciaDeLaTransformacion,
  type TrozoParaDesordenar,
} from '@/atlas/desordenDeLaFractura'
import type { EjeDelHueso } from '@/lib/planoDeCorte'

/**
 * Lo que pidió Cristóbal para «Fracturar» en el taller anatómico: los fragmentos
 * intermedios se desplazan al azar entre 0,5 mm y 2 cm y se angulan entre 5° y 20°; con
 * solo dos fragmentos, el más pequeño se angula.
 */

/** Un hueso de pie: el eje es Y, de proximal (abajo en la prueba) a distal. */
const eje: EjeDelHueso = {
  centro: [0, 0, 0],
  direccion: [0, 1, 0],
  proximal: -0.2,
  distal: 0.2,
  radio: 0.012,
  delante: [0, 0, 1],
  fuera: [1, 0, 0],
}

const trozo = (id: string, y: number, tamano = 1, foco: [number, number, number] | null = null): TrozoParaDesordenar => ({
  id,
  centro: [0, y, 0],
  foco,
  tamano,
})

/** Un azar repetible: congruencial lineal, de 0 a 1. */
function azarConSemilla(semilla: number) {
  let estado = semilla >>> 0
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }
}

describe('con tres o más fragmentos', () => {
  const trozos = [trozo('a#a#a', 0.15), trozo('a#a#b', 0.02), trozo('a#b', -0.1), trozo('a#a#b#a', 0.07), trozo('a#c', -0.18)]

  it('los dos extremos del hueso no se tocan, y todos los intermedios sí', () => {
    const r = desordenarLosFragmentos(trozos, eje, azarConSemilla(3))
    // El más proximal (y = -0,18) y el más distal (y = 0,15) se quedan.
    expect(r.has('a#c')).toBe(false)
    expect(r.has('a#a#a')).toBe(false)
    expect([...r.keys()].sort()).toEqual(['a#a#b', 'a#a#b#a', 'a#b'])
  })

  it('cada intermedio se desplaza entre 0,5 mm y 2 cm, siempre', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const r = desordenarLosFragmentos(trozos, eje, azarConSemilla(semilla))
      for (const t of r.values()) {
        const d = distanciaDeLaTransformacion(t)
        expect(d).toBeGreaterThanOrEqual(DESPLAZAMIENTO_MINIMO_M - 1e-9)
        expect(d).toBeLessThanOrEqual(DESPLAZAMIENTO_MAXIMO_M + 1e-9)
      }
    }
  })

  it('cada intermedio se angula entre 5° y 20°, siempre', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const r = desordenarLosFragmentos(trozos, eje, azarConSemilla(semilla))
      for (const t of r.values()) {
        const a = anguloDeLaTransformacion(t)
        expect(a).toBeGreaterThanOrEqual(ANGULO_MINIMO_GRADOS - 1e-6)
        expect(a).toBeLessThanOrEqual(ANGULO_MAXIMO_GRADOS + 1e-6)
      }
    }
  })

  it('los extremos del rango se alcanzan: no es un valor fijo escondido', () => {
    const distancias: number[] = []
    const angulos: number[] = []
    for (let semilla = 1; semilla <= 400; semilla++) {
      for (const t of desordenarLosFragmentos(trozos, eje, azarConSemilla(semilla)).values()) {
        distancias.push(distanciaDeLaTransformacion(t))
        angulos.push(anguloDeLaTransformacion(t))
      }
    }
    expect(Math.min(...distancias)).toBeLessThan(0.002)
    expect(Math.max(...distancias)).toBeGreaterThan(0.018)
    expect(Math.min(...angulos)).toBeLessThan(6)
    expect(Math.max(...angulos)).toBeGreaterThan(19)
  })

  it('la angulación es de lado: el eje del giro es perpendicular al del hueso', () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const r = desordenarLosFragmentos(trozos, eje, azarConSemilla(semilla))
      for (const t of r.values()) {
        const q = new THREE.Quaternion(...t.girar)
        // Un giro con eje perpendicular a Y deja el componente Y del cuaternión en cero.
        expect(Math.abs(q.y)).toBeLessThan(1e-9)
      }
    }
  })

  it('repetible con la misma semilla y distinto con otra', () => {
    const a = desordenarLosFragmentos(trozos, eje, azarConSemilla(7))
    const b = desordenarLosFragmentos(trozos, eje, azarConSemilla(7))
    const c = desordenarLosFragmentos(trozos, eje, azarConSemilla(8))
    expect([...a.entries()]).toEqual([...b.entries()])
    expect([...a.entries()]).not.toEqual([...c.entries()])
  })

  it('con tres fragmentos solo se mueve el del medio (la cuña, el segmento)', () => {
    const tres = [trozo('x#a', 0.1), trozo('x#b', -0.1), trozo('x#a#a', 0.0)]
    const r = desordenarLosFragmentos(tres, eje, azarConSemilla(5))
    expect([...r.keys()]).toEqual(['x#a#a'])
  })

  it('no importa el orden en que lleguen: manda su posición a lo largo del hueso', () => {
    const revueltos = [trozos[3], trozos[4], trozos[0], trozos[2], trozos[1]]
    const r = desordenarLosFragmentos(revueltos, eje, azarConSemilla(3))
    expect([...r.keys()].sort()).toEqual(['a#a#b', 'a#a#b#a', 'a#b'])
  })
})

describe('con solo dos fragmentos', () => {
  const grande = trozo('h#b', -0.08, 10, [0, 0.02, 0])
  const pequeno = trozo('h#a', 0.12, 2, [0, 0.0, 0.0])

  it('se angula el más pequeño, entre 5° y 20°, y el grande no se toca', () => {
    for (let semilla = 1; semilla <= 100; semilla++) {
      const r = desordenarLosFragmentos([grande, pequeno], eje, azarConSemilla(semilla))
      expect([...r.keys()]).toEqual(['h#a'])
      const a = anguloDeLaTransformacion(r.get('h#a')!)
      expect(a).toBeGreaterThanOrEqual(ANGULO_MINIMO_GRADOS - 1e-6)
      expect(a).toBeLessThanOrEqual(ANGULO_MAXIMO_GRADOS + 1e-6)
    }
  })

  it('el más pequeño es el más pequeño aunque llegue primero o segundo', () => {
    expect([...desordenarLosFragmentos([pequeno, grande], eje, azarConSemilla(2)).keys()]).toEqual(['h#a'])
    expect([...desordenarLosFragmentos([grande, pequeno], eje, azarConSemilla(2)).keys()]).toEqual(['h#a'])
  })

  it('gira sobre el foco de la fractura: el punto del foco no se despega', () => {
    const foco = new THREE.Vector3(0.001, 0.05, 0)
    const p = trozo('h#a', 0.12, 2, [foco.x, foco.y, foco.z])
    const r = desordenarLosFragmentos([grande, p], eje, azarConSemilla(4))
    const t = r.get('h#a')!
    // Donde cae el foco tras la transformación: centro + mover + giro·(foco − centro).
    const centro = new THREE.Vector3(...p.centro)
    const tras = centro
      .clone()
      .add(new THREE.Vector3(...t.mover))
      .add(foco.clone().sub(centro).applyQuaternion(new THREE.Quaternion(...t.girar)))
    expect(tras.distanceTo(foco)).toBeLessThan(1e-9)
  })

  it('no se desplaza aparte del arco que el giro describe: la tapa sigue apoyada', () => {
    const r = desordenarLosFragmentos([grande, trozo('h#a', 0.12, 2, [0, 0.1, 0])], eje, azarConSemilla(9))
    // El centro está a 2 cm del foco: un giro de 20° lo mueve como mucho unos 7 mm, nunca centímetros.
    expect(distanciaDeLaTransformacion(r.get('h#a')!)).toBeLessThan(0.0075)
  })

  it('sin foco gira sobre su propio centro y no se desplaza', () => {
    const sinFoco = trozo('h#a', 0.12, 2, null)
    const r = desordenarLosFragmentos([grande, sinFoco], eje, azarConSemilla(2))
    expect(distanciaDeLaTransformacion(r.get('h#a')!)).toBeLessThan(1e-12)
  })
})

describe('sin fractura', () => {
  it('con un solo trozo, o ninguno, no hay nada que desordenar', () => {
    expect(desordenarLosFragmentos([], eje).size).toBe(0)
    expect(desordenarLosFragmentos([trozo('solo', 0)], eje).size).toBe(0)
  })
})
