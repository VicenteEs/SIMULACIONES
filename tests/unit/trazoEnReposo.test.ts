import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import type { Punto } from '@/lib/incisiones'
import { bajoLoQueLaTapa, llevarAlReposo, porElRayoHastaLaCapa, porElTrazo, type MallaConReposo } from '@/components/simulador/trazoEnReposo'

/**
 * El trazo llevado a la piel en reposo antes de cortar (D-416): se pincha en la malla de ahora, abierta y apartada, y se
 * corta en la cerrada. Antes el corte caía en el tejido que en reposo tenía esas coordenadas, y no en el que se veía.
 */

/**
 * Una lámina de 10 × 10 en z = 0, un vértice por unidad. Ahora, la mitad de arriba (y ≥ 5) está corrida 3 hacia +y, como
 * la piel que aparta un Farabeuf, y la franja entre y = 4 y y = 5 quedó estirada al cuádruple.
 */
function lamina(aMundo = new THREE.Matrix4()): MallaConReposo {
  const reposo: number[] = []
  const ahora: number[] = []
  for (let y = 0; y <= 10; y++) {
    for (let x = 0; x <= 10; x++) {
      reposo.push(x, y, 0)
      ahora.push(x, y >= 5 ? y + 3 : y, 0)
    }
  }
  const indices: number[] = []
  const v = (x: number, y: number) => y * 11 + x
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) indices.push(v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y), v(x + 1, y + 1), v(x, y + 1))
  }
  return { ahora, reposo, indices, aMundo }
}

const arriba: Punto = [0, 0, 1]
const cerca = (a: Punto, b: Punto) => a.forEach((x, k) => expect(x).toBeCloseTo(b[k], 9))

describe('cada punto del trazo, al tejido que tenía debajo (D-416)', () => {
  it('lo pinchado en la piel corrida va a donde estaba esa piel', () => {
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [arriba], [lamina()], 0.01, 0.001)
    cerca(l!.punto, [2.5, 5.5, 0])
    cerca(l!.normal, [0, 0, 1])
  })

  it('en la franja estirada, a la misma fracción del triángulo', () => {
    // A mitad de la franja, que ahora va de 4 a 8: en reposo, a mitad de 4 a 5.
    const [l] = llevarAlReposo([[2.5, 6, 0]], [arriba], [lamina()], 0.01, 0.001)
    cerca(l!.punto, [2.5, 4.5, 0])
  })

  it('lo que no se movió, y lo que no está sobre la malla, se queda donde está', () => {
    const [quieto, enElAire] = llevarAlReposo(
      [
        [2.5, 2.5, 0],
        [2.5, 8.5, 1],
      ],
      [arriba, arriba],
      [lamina()],
      0.01,
      0.001,
    )
    expect(quieto).toBeNull()
    expect(enElAire).toBeNull()
  })

  it('en el mundo, con la malla escalada y movida como en el atlas', () => {
    // Un milímetro por unidad de la malla, y la pierna a 2 m del origen.
    const aMundo = new THREE.Matrix4().makeTranslation(2, 0, 0).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
    const [l] = llevarAlReposo([[2 + 0.0025, 0.0085, 0]], [arriba], [lamina(aMundo)], 0.00001, 0.000001)
    cerca(l!.punto, [2 + 0.0025, 0.0055, 0])
  })

  it('la normal es la de la piel en reposo, hacia el lado de la que se dio', () => {
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [[0, 0, -1]], [lamina()], 0.01, 0.001)
    cerca(l!.normal, [0, 0, -1])
  })

  it('con dos mallas, la más cercana', () => {
    // La segunda, 0,5 por debajo: la fascia bajo la piel. El punto está en la piel.
    const abajo = lamina(new THREE.Matrix4().makeTranslation(0, 0, -0.5))
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [arriba], [abajo, lamina()], 0.6, 0.001)
    cerca(l!.punto, [2.5, 5.5, 0])
  })
})

describe('lo que sale del trazo va con él, y lo demás se queda (D-416)', () => {
  // Tres muestras pinchadas; la segunda y la tercera estaban en reposo 3 más abajo.
  const trazo: Punto[] = [
    [0, 0, 0],
    [0, 10, 0],
    [0, 20, 0],
  ]
  const llevar = porElTrazo(
    trazo,
    [null, { punto: [0, 7, 0], normal: [1, 0, 0] }, { punto: [0, 17, 0], normal: [1, 0, 0] }],
    [arriba, arriba, arriba],
    1e-6,
  )

  it('una muestra, a su reposo', () => {
    cerca(llevar([0, 10, 0], arriba).p, [0, 7, 0])
  })

  it('un punto entre dos muestras, a la misma fracción entre sus reposos, con la normal mezclada', () => {
    const { p, n } = llevar([0, 15, 0], arriba)
    cerca(p, [0, 12, 0])
    cerca(n, [1, 0, 0])
    // Entre una quieta y una corrida: la mitad.
    const medio = llevar([0, 5, 0], arriba)
    cerca(medio.p, [0, 3.5, 0])
    cerca(medio.n, [Math.SQRT1_2, 0, Math.SQRT1_2])
  })

  it('lo que no está en el trazo —una incisión de antes, el sitio donde nace una rama— no se toca', () => {
    expect(llevar([1, 10, 0], arriba)).toEqual({ p: [1, 10, 0], n: arriba })
  })
})

describe('el lienzo lleva al reposo lo que va a cortar (D-416)', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const corte = lienzo.slice(lienzo.indexOf('const aplicarElCorte = '), lienzo.indexOf('const terminarPerforacion = '))

  it('mide el trazo en la malla de ahora antes de decidir y de cerrar nada', () => {
    const mide = corte.indexOf('llevarAlReposo(puntosDelCorte, normalesDelCorte, conReposo')
    expect(mide).toBeGreaterThan(0)
    expect(mide).toBeLessThan(corte.indexOf('const decision = decidirEnSuCapa('))
    // Solo con un trazo de verdad: lo que rehace la sesión ya está en reposo.
    expect(corte.slice(0, mide)).toContain('if (deUnTrazo) {\n        const conReposo')
  })

  it('lleva lo principal y las ramas antes de cerrar la incisión que se alarga y antes de cortar', () => {
    const lleva = corte.indexOf('ramas = ramas.map(aReposo)')
    expect(lleva).toBeGreaterThan(corte.indexOf('const decision = decidirEnSuCapa('))
    expect(lleva).toBeLessThan(corte.indexOf('if (previo) cerrarLaIncision(t, id, { conSusSeparadores: true })'))
    expect(lleva).toBeLessThan(corte.indexOf('cortarCapa(malla, puntos, normales, parametrosDe(malla))'))
  })

  it('baja el trazo del bulto de la piel antes de medirlo contra las incisiones de antes (D-421)', () => {
    // Al revés, el trazo pinchado sobre el bulto queda a milímetros del reposo de la incisión de antes y no la encuentra:
    // la T o la L salen como dos incisiones sueltas, o como un corte corto que no llega.
    const baja = corte.indexOf('bajarDelBulto(mallas, puntosDelCorte, normalesDelCorte)')
    expect(baja).toBeGreaterThan(0)
    expect(baja).toBeLessThan(corte.indexOf('llevarAlReposo(puntosDelCorte, normalesDelCorte, conReposo'))
  })

  it('el del bisturí profundo va además a la fascia por su rayo, salvo con un músculo elegido', () => {
    // Pinchado sobre el trozo de tibia que asoma por la fascia abierta, el repaso de la vertical quedaba 6 a 10 mm por
    // encima de su línea y cortaba la fascia otra vez (la T del caso 86). Con un músculo elegido se pinchó en él.
    const lleva = corte.indexOf('enLaFascia(mallas, puntosDelCorte, normalesDelCorte)')
    expect(lleva).toBeGreaterThan(0)
    expect(lleva).toBeLessThan(corte.indexOf('llevarAlReposo(puntosDelCorte, normalesDelCorte, conReposo'))
    expect(corte).toMatch(/plano === 'piel'\s+\? enLaPiel\([^)]*\)\s+: conMusculoElegido\s+\? bajarDelBulto\(/)
    // Y lo que no da en la fascia, bajado del bulto como el de la piel.
    const enLaFascia = lienzo.slice(lienzo.indexOf('const enLaFascia = '), lienzo.indexOf('const decidirEnSuCapa = '))
    expect(enLaFascia).toContain('const bajados = bajarDelBulto(mallas, puntos, normales)')
    expect(enLaFascia).toContain('porElRayoHastaLaCapa(puntos, [ojo.x, ojo.y, ojo.z], fascias, PROFUNDIDAD_DEL_CORTE_HONDO_MM * unidadesPorMm)')
  })

  it('el de la piel, pinchado en lo que asoma por ella, va a la piel que lo tapa y después baja del bulto (D-421)', () => {
    // La barra de una T dibujada a través del trozo de tibia del caso 3 se pinchaba en el hueso y no cortaba esa mitad.
    const lleva = corte.indexOf('enLaPiel(mallas, puntosDelCorte, normalesDelCorte)')
    expect(lleva).toBeGreaterThan(0)
    expect(lleva).toBeLessThan(corte.indexOf('llevarAlReposo(puntosDelCorte, normalesDelCorte, conReposo'))
    const enLaPiel = lienzo.slice(lienzo.indexOf('const enLaPiel = '), lienzo.indexOf('const enLaFascia = '))
    expect(enLaPiel).toContain('bajoLoQueLaTapa(puntos, [ojo.x, ojo.y, ojo.z], pieles, PIEL_BAJO_LO_QUE_ASOMA_MM * unidadesPorMm')
    expect(enLaPiel).toContain('return bajarDelBulto(mallas, puntos, normales)')
  })

  it('baja del bulto de la piel aunque corte la fascia, que no se abulta', () => {
    // Si bajara solo de las mallas que corta, el trazo profundo pinchado en las puntas de la incisión de piel quedaría
    // sobre el tobillo 20 mm por encima de la fascia: la vertical de la fascia salía de 45 mm bajo una de piel de 80.
    const baja = lienzo.slice(lienzo.indexOf('const bajarDelBulto = '), lienzo.indexOf('const decidirEnSuCapa = '))
    expect(baja).toContain("const pieles = mallasConRol(t, ultimas.current.piezas, ['piel'])")
    expect(baja).toContain('[...new Set([...mallas, ...pieles])].map(conSuBulto)')
  })
})

describe('la fascia se abre en L y en T como la piel (D-421)', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const gesto = lienzo.slice(lienzo.indexOf('const fasciaAbierta = '), lienzo.indexOf('const { plano: planoQueSeCorta, redirigido }'))

  it('pregunta a la fascia si el trazo profundo la repasa, con la misma decisión que la piel', () => {
    // Si `planoQueCorta` solo supiera que la fascia está abierta, el brazo de la L iría al músculo por debajo de fascia
    // entera: el músculo se abriría sin que la fascia de encima tuviera herida por donde verlo.
    expect(gesto).toContain("return decidirEnSuCapa('fascia', puntos, normales).tipo === 'repaso'")
    // Y con el trazo en la fascia, como lo medirá el corte (`enLaFascia`, que antes lo baja del bulto).
    expect(gesto).toContain('= enLaFascia(')
    expect(lienzo).toMatch(/planoQueCorta\(plano, \{[^}]*repasaLaFascia,\s*\}\)/)
  })
})

describe('el trazo del bisturí profundo, por el rayo de la cámara hasta la fascia (D-421)', () => {
  // La fascia es la lámina, vista desde 20 por encima de su centro.
  const ojo: Punto = [5, 5, 20]

  it('lo pinchado en el hueso que asoma, 6 por encima, va a la fascia que hay debajo en ese mismo píxel', () => {
    // En el rayo del ojo, que baja 3 en y por cada 14 en z: da en la fascia a 0,71 de su borde, no en la vertical del punto.
    const [l] = porElRayoHastaLaCapa([[5, 2, 6]], ojo, [lamina()], 50)
    cerca(l!.punto, [5, 5 - (3 * 20) / 14, 0])
    cerca(l!.normal, [0, 0, 1])
  })

  it('lo primero desde el ojo, aunque la otra hoja venga antes en la lista: el tabique está detrás', () => {
    const tabique = lamina(new THREE.Matrix4().makeTranslation(0, 0, -10))
    const [l] = porElRayoHastaLaCapa([[5, 5, 3]], ojo, [tabique, lamina()], 50)
    cerca(l!.punto, [5, 5, 0])
  })

  it('más allá del alcance, o con el rayo fuera de la fascia, nada: ese punto se queda como estaba', () => {
    const [lejos] = porElRayoHastaLaCapa([[5, 5, 3]], ojo, [lamina()], 2)
    expect(lejos).toBeNull()
    const [alLado] = porElRayoHastaLaCapa([[30, 5, 3]], ojo, [lamina()], 50)
    expect(alLado).toBeNull()
    expect(porElRayoHastaLaCapa([], ojo, [lamina()], 50)).toEqual([])
  })
})

describe('lo pinchado sobre lo que asoma por la piel, a la piel que lo tapa (D-421)', () => {
  // La piel es la lámina, vista desde 20 por encima de su centro; lo que asoma, un hueso por encima de ella.
  const ojo: Punto = [5, 5, 20]

  it('lo pinchado 6 por encima, en el hueso, va a la piel que hay detrás en ese mismo píxel', () => {
    const [l] = bajoLoQueLaTapa([[5, 2, 6]], ojo, [lamina()], 30, 0.5)
    cerca(l!.punto, [5, 5 - (3 * 20) / 14, 0])
  })

  it('lo que ya está en la piel se queda: no hay nada que la tape', () => {
    expect(bajoLoQueLaTapa([[5, 2, 0.2]], ojo, [lamina()], 30, 0.5)).toEqual([null])
  })

  it('lo visto por el hueco de una herida, con la piel delante, no se sube a ella', () => {
    // El fondo de la herida está 3 por debajo de la piel: el rayo cruza la lámina antes de llegar a él, y detrás no hay más.
    expect(bajoLoQueLaTapa([[5, 5, -3]], ojo, [lamina()], 30, 0.5)).toEqual([null])
    // Sin mirar solo detrás, el mismo rayo lo habría subido a la piel de delante.
    expect(porElRayoHastaLaCapa([[5, 5, -3]], ojo, [lamina()], 30)[0]).not.toBeNull()
  })
})
