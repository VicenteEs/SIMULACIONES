import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { girarPiezas } from '@/atlas/transformar'
import {
  EJES_DEL_MUNDO,
  atarAlEjeMasCercano,
  cifra,
  cuaternionDelMarco,
  describirLectura,
  desplazamientoEnElPlano,
  distalDeLosDos,
  focoDeLaTapa,
  girarEnSaltos,
  giroLibre,
  leerReduccion,
  marcoDelHueso,
  puntoActual,
  rayoDelPuntero,
  saltoDeAngulo,
  type EjesDeUnHueso,
} from '@/atlas/manipular'

/**
 * Manipular piezas y fragmentos con el ratón (D-160, E3).
 *
 * Todo es aritmética con respuesta conocida: la pieza sigue al cursor, un eje
 * mirando a la cámara no se elige, un giro de diez grados es diez grados y se lee
 * «varo» en una pierna derecha y «valgo» en una izquierda.
 */

function camaraDeFrente(): THREE.PerspectiveCamera {
  const camara = new THREE.PerspectiveCamera(42, 1.5, 0.02, 60)
  camara.position.set(0, 0, 1)
  camara.lookAt(0, 0, 0)
  camara.updateMatrixWorld(true)
  camara.updateProjectionMatrix()
  return camara
}

const grados = (g: number) => (g * Math.PI) / 180
type Cuaternion = [number, number, number, number]
const cuaternion = (eje: [number, number, number], g: number): Cuaternion => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...eje).normalize(), grados(g))
  return [q.x, q.y, q.z, q.w]
}
const REPOSO: Cuaternion = [0, 0, 0, 1]

describe('arrastrar sobre el plano de la cámara', () => {
  it('el punto pinchado queda bajo el cursor', () => {
    const camara = camaraDeFrente()
    const agarre = new THREE.Vector3(0.05, 0.02, -0.1)
    // Se pincha donde el agarre se proyecta y se arrastra 120 px a la derecha.
    const p = agarre.clone().project(camara)
    const ancho = 900
    const alto = 600
    const px = ((p.x + 1) / 2) * ancho
    const py = ((1 - p.y) / 2) * alto
    const rayo = rayoDelPuntero(camara, px + 120, py, ancho, alto)
    const d = desplazamientoEnElPlano(camara, agarre, rayo)
    const nuevo = agarre.clone().add(d).project(camara)
    expect(((nuevo.x + 1) / 2) * ancho).toBeCloseTo(px + 120, 3)
    expect(((1 - nuevo.y) / 2) * alto).toBeCloseTo(py, 3)
    // Y no se acerca ni se aleja: se queda en el plano.
    expect(d.z).toBeCloseTo(0, 9)
  })

  it('sin moverse no hay desplazamiento', () => {
    const camara = camaraDeFrente()
    const rayo = rayoDelPuntero(camara, 450, 300, 900, 600)
    expect(desplazamientoEnElPlano(camara, new THREE.Vector3(0, 0, 0), rayo).length()).toBeLessThan(1e-9)
  })

  it('lo lejano se mueve más por píxel, y sigue al cursor', () => {
    const camara = camaraDeFrente()
    const rayo = rayoDelPuntero(camara, 550, 300, 900, 600)
    const cerca = desplazamientoEnElPlano(camara, new THREE.Vector3(0, 0, 0.5), rayo)
    const lejos = desplazamientoEnElPlano(camara, new THREE.Vector3(0, 0, -2), rayo)
    expect(lejos.x).toBeGreaterThan(cerca.x * 3)
  })
})

describe('atar al eje con Mayús', () => {
  const camara = camaraDeFrente()

  it('un gesto horizontal se ata a X', () => {
    const r = atarAlEjeMasCercano(camara, new THREE.Vector3(0.1, 0.01, 0), EJES_DEL_MUNDO)
    expect(r.eje).toBe('x')
    expect(r.desplazamiento.x).toBeCloseTo(0.1, 9)
    expect(r.desplazamiento.y).toBeCloseTo(0, 9)
  })

  it('uno vertical, a Y', () => {
    expect(atarAlEjeMasCercano(camara, new THREE.Vector3(0.002, -0.08, 0), EJES_DEL_MUNDO).eje).toBe('y')
  })

  it('el eje que apunta a la cámara no se elige nunca', () => {
    // Z mira a la cámara: arrastrar «a lo largo» de él mandaría la pieza lejísimos.
    for (const gesto of [new THREE.Vector3(0.1, 0, 0), new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.07, 0.07, 0)]) {
      expect(atarAlEjeMasCercano(camara, gesto, EJES_DEL_MUNDO).eje).not.toBe('z')
    }
  })

  it('con los ejes de un hueso inclinado, elige el del hueso', () => {
    const c = Math.cos(Math.asin(0.5))
    const inclinado = marcoDelHueso({ largo: [0.5, -c, 0], delante: [0, 0, 1], fuera: [-c, -0.5, 0] })
    const sobreElLargo = new THREE.Vector3(-0.05, 0.0866, 0)
    const r = atarAlEjeMasCercano(camara, sobreElLargo, inclinado)
    expect(r.eje).toBe('y')
    // Queda sobre la recta del hueso.
    expect(Math.abs(r.desplazamiento.clone().normalize().dot(inclinado.y))).toBeCloseTo(1, 6)
  })

  it('sin gesto no ata a nada', () => {
    expect(atarAlEjeMasCercano(camara, new THREE.Vector3(), EJES_DEL_MUNDO).eje).toBeNull()
  })
})

describe('el giro libre y los saltos', () => {
  it('arrastrar a la derecha lleva hacia la derecha la cara que mira a la cámara', () => {
    const camara = camaraDeFrente()
    const cara = new THREE.Vector3(0, 0, 1).applyQuaternion(giroLibre(camara, 40, 0))
    expect(cara.x).toBeGreaterThan(0.2)
    expect(Math.abs(cara.y)).toBeLessThan(1e-9)
  })

  it('arrastrar hacia abajo la lleva hacia abajo', () => {
    const camara = camaraDeFrente()
    const cara = new THREE.Vector3(0, 0, 1).applyQuaternion(giroLibre(camara, 0, 40))
    expect(cara.y).toBeLessThan(-0.2)
  })

  it('con Ctrl el ángulo salta de cinco en cinco grados', () => {
    expect((saltoDeAngulo(grados(7.4)) * 180) / Math.PI).toBeCloseTo(5, 9)
    expect((saltoDeAngulo(grados(7.6)) * 180) / Math.PI).toBeCloseTo(10, 9)
    expect((saltoDeAngulo(grados(-13)) * 180) / Math.PI).toBeCloseTo(-15, 9)
  })

  it('un giro libre en saltos conserva el eje y redondea el ángulo', () => {
    const eje = new THREE.Vector3(1, 2, -1).normalize()
    const q = new THREE.Quaternion().setFromAxisAngle(eje, grados(23))
    const s = girarEnSaltos(q)
    expect((2 * Math.acos(s.w) * 180) / Math.PI).toBeCloseTo(25, 6)
    expect(new THREE.Vector3(s.x, s.y, s.z).normalize().dot(eje)).toBeCloseTo(1, 9)
  })

  it('un giro de casi nada se queda en nada', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), grados(1))
    expect(Math.abs(girarEnSaltos(q).w)).toBeCloseTo(1, 9)
  })
})

describe('el marco de un hueso', () => {
  const tibiaDerecha: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] }
  const tibiaIzquierda: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [1, 0, 0] }

  it('X hacia fuera, Y hacia proximal y los tres de mano derecha, en los dos lados', () => {
    for (const hueso of [tibiaDerecha, tibiaIzquierda]) {
      const m = marcoDelHueso(hueso)
      expect(m.x.dot(new THREE.Vector3(...hueso.fuera))).toBeCloseTo(1, 9)
      expect(m.y.dot(new THREE.Vector3(...hueso.largo))).toBeCloseTo(-1, 9)
      expect(m.x.clone().cross(m.y).dot(m.z)).toBeCloseTo(1, 9)
    }
  })

  it('el cuaternión del marco lleva los ejes del mundo a los del hueso', () => {
    const m = marcoDelHueso(tibiaDerecha)
    const q = cuaternionDelMarco(m)
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(q).distanceTo(m.x)).toBeLessThan(1e-9)
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(m.y)).toBeLessThan(1e-9)
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(m.z)).toBeLessThan(1e-9)
  })
})

describe('el foco de un corte', () => {
  it('es el punto medio de los vértices que están sobre el plano', () => {
    // Cuatro vértices en el plano y = 0.5, y dos fuera de él.
    const pos = [0, 0.5, 0, 0.02, 0.5, 0, 0.02, 0.5, 0.04, 0, 0.5, 0.04, 0.3, 0.9, 0.3, 0.1, 0.1, 0.1]
    const foco = focoDeLaTapa(pos, [0, 0.5, 0], [0, 1, 0])!
    expect(foco.x).toBeCloseTo(0.01, 9)
    expect(foco.y).toBeCloseTo(0.5, 9)
    expect(foco.z).toBeCloseTo(0.02, 9)
  })

  it('sin vértices sobre el plano no hay foco', () => {
    expect(focoDeLaTapa([0, 0, 0, 1, 1, 1], [0, 0.5, 0], [0, 1, 0])).toBeNull()
  })

  it('un punto del fragmento se mueve con él: gira sobre el centro y se desplaza', () => {
    const centro = new THREE.Vector3(0, 1, 0)
    const foco = new THREE.Vector3(0, 1.1, 0)
    expect(puntoActual(centro, foco, null).distanceTo(foco)).toBe(0)
    const ahora = puntoActual(centro, foco, { mover: [0.01, 0, 0], girar: cuaternion([0, 0, 1], 90) })
    // 0,1 m por encima del centro, girado 90° sobre Z, queda 0,1 m a su izquierda; más el desplazamiento.
    expect(ahora.x).toBeCloseTo(-0.1 + 0.01, 9)
    expect(ahora.y).toBeCloseTo(1, 9)
  })
})

describe('la lectura clínica', () => {
  // Una tibia de pie: el largo va hacia abajo, delante es +Z y fuera, −X en la derecha y +X en la izquierda.
  const derecha: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] }
  const izquierda: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [1, 0, 0] }
  const centros = { distal: new THREE.Vector3(0, 0.2, 0), proximal: new THREE.Vector3(0, 0.5, 0) }
  // El foco es el mismo punto en los dos: es el centro de la tapa del corte.
  const focos = { distal: new THREE.Vector3(0, 0.35, 0), proximal: new THREE.Vector3(0, 0.35, 0) }

  type T = { mover: [number, number, number]; girar: Cuaternion }

  /**
   * Un giro de `grados` sobre el foco, hecho como lo hace el visor (`girarPiezas`):
   * el fragmento gira sobre sí mismo y su centro describe un arco, de modo que el
   * foco se queda donde estaba. Girarlo solo sobre su centro movería el foco
   * quince centímetros y la lectura diría, con razón, que se desplazó.
   */
  const sobreElFoco = (eje: [number, number, number], g: number, centro = centros.distal): T => {
    const q = new THREE.Quaternion(...cuaternion(eje, g))
    const salida = girarPiezas(new Map(), ['f'], new Map([['f', centro]]), focos.distal, q)
    return salida.get('f')!
  }
  const lee = (ejes: EjesDeUnHueso, distal: T | null, proximal: T | null = null) =>
    leerReduccion(ejes, distal, proximal, centros, focos)

  it('en su sitio no hay nada que leer', () => {
    const l = lee(derecha, null, null)
    expect(Math.abs(l.lateral) + Math.abs(l.valgo) + Math.abs(l.rotacion)).toBeLessThan(1e-9)
    expect(describirLectura(l)).toBeNull()
  })

  it('ocho milímetros hacia fuera, en una pierna derecha, son laterales', () => {
    const l = lee(derecha, { mover: [-0.008, 0, 0], girar: REPOSO })
    expect(l.lateral).toBeCloseTo(8, 6)
    expect(l.anteroposterior).toBeCloseTo(0, 6)
    expect(describirLectura(l)).toBe('8 mm lateral')
  })

  it('y hacia el lado contrario, mediales', () => {
    expect(describirLectura(lee(derecha, { mover: [0.008, 0, 0], girar: REPOSO }))).toBe('8 mm medial')
  })

  it('el mismo gesto en la pierna izquierda es el espejo', () => {
    expect(describirLectura(lee(izquierda, { mover: [0.008, 0, 0], girar: REPOSO }))).toBe('8 mm lateral')
  })

  it('el extremo distal hacia dentro es varo, y hacia fuera, valgo', () => {
    // Pierna derecha: dentro es +X. Girar sobre Z un ángulo positivo lleva el extremo de abajo hacia +X.
    const varo = lee(derecha, sobreElFoco([0, 0, 1], 10))
    expect(varo.valgo).toBeCloseTo(-10, 6)
    expect(describirLectura(varo)).toBe('10° varo')
    expect(describirLectura(lee(derecha, sobreElFoco([0, 0, 1], -10)))).toBe('10° valgo')
    // Y la izquierda es el espejo.
    expect(describirLectura(lee(izquierda, sobreElFoco([0, 0, 1], 10)))).toBe('10° valgo')
  })

  it('la lectura del enunciado: 8 mm lateral y 10° varo', () => {
    // Se angula sobre el foco y se desplaza ocho milímetros hacia fuera, como con el ratón.
    const angulado = sobreElFoco([0, 0, 1], 10)
    const t: T = { mover: [angulado.mover[0] - 0.008, angulado.mover[1], angulado.mover[2]], girar: angulado.girar }
    expect(describirLectura(lee(derecha, t))).toBe('8 mm lateral · 10° varo')
  })

  it('hacia delante o hacia atrás se nombra por el extremo distal', () => {
    // Girar sobre X lleva el extremo de abajo hacia atrás: antecurvatum (ápice anterior).
    expect(describirLectura(lee(derecha, sobreElFoco([1, 0, 0], 12)))).toBe('12° antecurvatum')
    expect(describirLectura(lee(derecha, sobreElFoco([1, 0, 0], -12)))).toBe('12° recurvatum')
  })

  it('la torsión sobre el eje largo es rotación, externa o interna según el lado', () => {
    // Sobre el largo (hacia abajo): la cara anterior de una pierna derecha gira hacia −X, que es fuera.
    expect(describirLectura(lee(derecha, sobreElFoco([0, -1, 0], 15)))).toBe('15° de rotación externa')
    expect(describirLectura(lee(izquierda, sobreElFoco([0, -1, 0], 15)))).toBe('15° de rotación interna')
  })

  it('una torsión no se cuenta como varo ni como recurvatum', () => {
    const l = lee(derecha, { mover: [0, 0, 0], girar: cuaternion([0, -1, 0], 40) })
    expect(Math.abs(l.valgo)).toBeLessThan(1e-6)
    expect(Math.abs(l.recurvatum)).toBeLessThan(1e-6)
  })

  it('con ochenta grados de torsión las cifras siguen diciendo lo suyo (sin bloqueo de cardán)', () => {
    const q = new THREE.Quaternion().multiplyQuaternions(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), grados(10)),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, -1, 0), grados(80)),
    )
    const l = lee(derecha, { mover: [0, 0, 0], girar: [q.x, q.y, q.z, q.w] })
    expect(l.valgo).toBeCloseTo(-10, 4)
    expect(l.rotacion).toBeCloseTo(80, 4)
  })

  it('si se mueve el proximal, el distal quieto se lee al revés', () => {
    // El proximal gira 10° como el varo de arriba; visto desde el distal quieto, es el contrario.
    expect(describirLectura(lee(derecha, null, sobreElFoco([0, 0, 1], 10, centros.proximal)))).toBe('10° valgo')
  })

  it('si los dos giran igual, no hay angulación', () => {
    const t: T = { mover: [0, 0, 0], girar: cuaternion([1, 1, 0], 25) }
    const l = leerReduccion(derecha, t, t, centros, focos)
    expect(Math.abs(l.valgo) + Math.abs(l.recurvatum) + Math.abs(l.rotacion)).toBeLessThan(1e-6)
  })

  it('el eje axial: más es diástasis y menos, acortamiento', () => {
    // El largo apunta hacia abajo: bajar el distal 6 mm los separa.
    expect(describirLectura(lee(derecha, { mover: [0, -0.006, 0], girar: REPOSO }))).toBe('6 mm de diástasis')
    expect(describirLectura(lee(derecha, { mover: [0, 0.006, 0], girar: REPOSO }))).toBe('6 mm de acortamiento')
  })

  it('sin focos se miden los centros, descontando lo que ya los separaba', () => {
    const l = leerReduccion(derecha, { mover: [-0.008, 0, 0], girar: REPOSO }, null, centros, null)
    expect(l.lateral).toBeCloseTo(8, 6)
    expect(l.axial).toBeCloseTo(0, 6)
  })
})

describe('escribir la lectura', () => {
  it('con coma decimal y sin ceros de más', () => {
    expect(cifra(8)).toBe('8')
    expect(cifra(8.04)).toBe('8')
    expect(cifra(8.4)).toBe('8,4')
    expect(cifra(-3.26)).toBe('3,3')
    expect(cifra(23.4)).toBe('23')
  })

  it('lo que no llega a medio milímetro o medio grado no se escribe', () => {
    const base = { lateral: 0, anteroposterior: 0, axial: 0, valgo: 0, recurvatum: 0, rotacion: 0 }
    expect(describirLectura({ ...base, lateral: 0.4, valgo: -0.3 })).toBeNull()
    expect(describirLectura({ ...base, lateral: 0.6 })).toBe('0,6 mm lateral')
  })

  it('ordena: primero lo que se desplaza y luego lo que se angula', () => {
    expect(
      describirLectura({ lateral: -3, anteroposterior: 2, axial: 0, valgo: 5, recurvatum: -4, rotacion: 0 }),
    ).toBe('3 mm medial · 2 mm anterior · 5° valgo · 4° antecurvatum')
  })
})

describe('cuál de los dos es el distal', () => {
  it('el que cae más hacia donde apunta el largo', () => {
    const ejes: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] }
    const hueso = new THREE.Vector3(0, 0.5, 0)
    const arriba = new THREE.Vector3(0, 0.7, 0)
    const abajo = new THREE.Vector3(0, 0.3, 0)
    expect(distalDeLosDos(ejes, hueso, abajo, arriba)).toBe('a')
    expect(distalDeLosDos(ejes, hueso, arriba, abajo)).toBe('b')
  })
})
