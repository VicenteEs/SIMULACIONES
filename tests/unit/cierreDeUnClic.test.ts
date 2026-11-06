import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  HILOS_DEL_CIERRE,
  MARGEN_DE_LOS_EXTREMOS_MM,
  PASO_DE_LOS_CORCHETES_MM,
  cierreDelPlan,
  crucesDelPlan,
  hiloDelCierre,
  planDelCierre,
  textoDelCierre,
} from '@/lib/cierreDeUnClic'
import { SEPARACION_IDEAL_POR_PLANO, hilosDeLasPuntadas, resumirPorPlanos, textoDeLaHeridaCerrada } from '@/lib/planosDeLaSutura'
import type { PuntoDeSutura } from '@/lib/sutura'
import { crearSutura, reconstruirHilo } from '@/components/simulador/hiloEnLaEscena'
import { readFileSync } from 'node:fs'

// P-013, pedido 16 de Cristóbal: «cerrar fascia», elegir el hilo y su diámetro, pinchar la fascia y que quede toda cerrada; en
// la piel, nailon, Monocryl o corchetes.

describe('los hilos que se pueden elegir', () => {
  it('la piel ofrece nailon, Monocryl y corchetes, y la fascia absorbibles', () => {
    expect(HILOS_DEL_CIERRE.piel.map((f) => f.clave)).toEqual(['nylon', 'monocryl', 'corchetes'])
    expect(HILOS_DEL_CIERRE.fascia.map((f) => f.clave)).toContain('vicryl')
    for (const f of HILOS_DEL_CIERRE.fascia) expect(f.tipo).toBe('hilo')
  })

  it('el calibre cambia el nombre y el grosor: más ceros, más fino', () => {
    const grueso = hiloDelCierre('piel', 'nylon', '2-0')!
    const fino = hiloDelCierre('piel', 'nylon', '5-0')!
    expect(grueso.nombre).toBe('Nylon 2-0')
    expect(fino.nombre).toBe('Nylon 5-0')
    expect(fino.grosorMm).toBeLessThan(grueso.grosorMm)
    expect(fino.planos).toEqual(['piel'])
  })

  it('un calibre que esa familia no tiene se cambia por el habitual, y una familia de otro plano no vale', () => {
    expect(hiloDelCierre('fascia', 'vicryl', '5-0')!.nombre).toBe('Vicryl 2-0')
    expect(hiloDelCierre('fascia', 'nylon', '3-0')).toBeNull()
  })

  it('los corchetes no tienen calibre y son de tipo corchete', () => {
    const c = hiloDelCierre('piel', 'corchetes', '3-0')!
    expect(c.tipo).toBe('corchete')
    expect(c.nombre).toBe('Corchetes')
  })
})

describe('el plan del cierre', () => {
  for (const plano of ['piel', 'fascia'] as const) {
    for (const largo of [6, 12, 25, 48, 80, 140]) {
      it(`un hilo cierra entera una herida de ${largo} mm de ${plano}`, () => {
        const plan = planDelCierre(largo, plano, 'hilo')
        expect(cierreDelPlan(plan, largo, plano)).toBe(1)
        // Una sola línea continua, que cruza en cada puntada.
        expect(plan.filter((p) => p.nuevaLinea)).toHaveLength(1)
        expect(crucesDelPlan(plan)).toBe(plan.length - 1)
      })
    }
  }

  it('las puntadas de un hilo quedan dentro de la herida, sin tocar las puntas, y a un paso que el juicio da por bueno', () => {
    for (const plano of ['piel', 'fascia'] as const) {
      const largo = 90
      const plan = planDelCierre(largo, plano, 'hilo')
      const mm = plan.map((p) => p.t * largo)
      expect(mm[0]).toBeCloseTo(MARGEN_DE_LOS_EXTREMOS_MM, 5)
      expect(mm[mm.length - 1]).toBeCloseTo(largo - MARGEN_DE_LOS_EXTREMOS_MM, 5)
      const ideal = SEPARACION_IDEAL_POR_PLANO[plano]
      for (let i = 1; i < mm.length; i++) {
        const paso = mm[i] - mm[i - 1]
        // A lo largo de la herida: lo que separa una puntada de la siguiente sin contar lo que se cruza.
        expect(paso).toBeGreaterThanOrEqual(ideal.min)
        expect(paso).toBeLessThanOrEqual(ideal.max)
      }
    }
  })

  it('los corchetes van de a dos puntas, una en cada labio y a la misma altura, cada 7 mm', () => {
    const largo = 64
    const plan = planDelCierre(largo, 'piel', 'corchete')
    expect(plan.length % 2).toBe(0)
    for (let i = 0; i < plan.length; i += 2) {
      expect(plan[i].nuevaLinea).toBe(true)
      expect(plan[i + 1].nuevaLinea).toBe(false)
      expect(plan[i].t).toBe(plan[i + 1].t)
      expect(plan[i].lado).not.toBe(plan[i + 1].lado)
    }
    const alturas = plan.filter((_, i) => i % 2 === 0).map((p) => p.t * largo)
    for (let i = 1; i < alturas.length; i++) expect(alturas[i] - alturas[i - 1]).toBeLessThanOrEqual(PASO_DE_LOS_CORCHETES_MM + 1e-9)
    expect(cierreDelPlan(plan, largo, 'piel')).toBe(1)
  })

  it('una herida sin largo no tiene plan', () => {
    expect(planDelCierre(0, 'piel', 'hilo')).toEqual([])
    expect(planDelCierre(Number.NaN, 'fascia', 'corchete')).toEqual([])
  })

  it('lo que se dice al cerrar cuenta corchetes como corchetes', () => {
    expect(textoDelCierre('piel', { nombre: 'Corchetes', tipo: 'corchete' }, 9, 1)).toBe('La piel quedó cerrada con 9 corchetes.')
    expect(textoDelCierre('fascia', { nombre: 'Vicryl 2-0', tipo: 'hilo' }, 8, 2)).toBe(
      'La fascia quedó cerrada con una sutura continua de Vicryl 2-0 (8 puntadas) en sus 2 incisiones.',
    )
  })
})

const punto = (x: number, plano: 'piel' | 'fascia', extra: Partial<PuntoDeSutura> = {}): PuntoDeSutura => ({
  punto: [x, 0, 0],
  normal: [0, 1, 0],
  lado: 1,
  nuevaLinea: false,
  plano,
  ...extra,
})

describe('el aviso de la herida cerrada', () => {
  const vicryl = { nombre: 'Vicryl 2-0', grosorMm: 0.9, color: 0x6a4cb0 }
  const nylon = { nombre: 'Nylon 3-0', grosorMm: 0.7, color: 0x14141a }

  it('cada plano dice su hilo, aunque la sutura tenga otro por omisión', () => {
    const puntos = [punto(0, 'fascia', { hilo: vicryl, nuevaLinea: true }), punto(1, 'fascia', { hilo: vicryl }), punto(2, 'piel', { hilo: nylon, nuevaLinea: true })]
    expect(hilosDeLasPuntadas(puntos, nylon)).toEqual(['Vicryl 2-0', 'Nylon 3-0'])
    // Lo guardado antes de que cada puntada llevara su hilo usa el de la sutura.
    expect(hilosDeLasPuntadas([punto(0, 'piel')], nylon)).toEqual(['Nylon 3-0'])
  })

  it('la fascia se mide de 8 a 15 mm, no con el rango de la piel', () => {
    const medida = (puntadas: number, bien: number) => ({
      puntadas,
      largoDeHiloMm: 0,
      cruces: puntadas - 1,
      tramos: puntadas - 1,
      separacionMediaMm: 10,
      separacionMinimaMm: 10,
      separacionMaximaMm: 10,
      bienEspaciadas: bien,
      separacionesMm: [],
    })
    const puntos = [
      ...[0, 1, 2].map((x, i) => punto(x, 'fascia', { hilo: vicryl, nuevaLinea: i === 0 })),
      ...[0, 1, 2, 3].map((x, i) => punto(x, 'piel', { hilo: nylon, nuevaLinea: i === 0 })),
    ]
    const planos = resumirPorPlanos({ fascia: medida(3, 2), piel: medida(4, 3) }, {}, {}, ['fascia', 'piel'], puntos, nylon)
    const { texto, bien } = textoDeLaHeridaCerrada(planos)
    expect(texto).toContain('fascia con 3 puntadas de Vicryl 2-0, 2 de 2 bien espaciadas (8 a 15 mm)')
    expect(texto).toContain('piel con 4 puntadas de Nylon 3-0, 3 de 3 bien espaciadas (5 a 10 mm)')
    expect(texto.indexOf('fascia')).toBeLessThan(texto.indexOf('piel'))
    expect(bien).toBe(true)
  })

  it('lo cerrado de un clic no se juzga puntada a puntada, y los corchetes se cuentan', () => {
    const corchetes = { nombre: 'Corchetes', grosorMm: 0.7, color: 0xb9bec6, tipo: 'corchete' as const }
    const puntos = [
      ...[0, 1, 2, 3].map((x, i) => punto(x, 'fascia', { hilo: vicryl, nuevaLinea: i === 0, asistida: true })),
      ...[0, 1, 2, 3, 4, 5].map((x, i) => punto(x, 'piel', { hilo: corchetes, nuevaLinea: i % 2 === 0, asistida: true })),
    ]
    const medida = { puntadas: 0, largoDeHiloMm: 0, cruces: 0, tramos: 9, separacionMediaMm: 0, separacionMinimaMm: 0, separacionMaximaMm: 0, bienEspaciadas: 0, separacionesMm: [] }
    const planos = resumirPorPlanos(
      { fascia: { ...medida, puntadas: 4 }, piel: { ...medida, puntadas: 6 } },
      {},
      {},
      ['fascia', 'piel'],
      puntos,
      null,
    )
    const { texto, bien } = textoDeLaHeridaCerrada(planos)
    expect(texto).toBe('Herida cerrada por planos: fascia con una sutura continua de Vicryl 2-0 (4 puntadas); piel con 3 corchetes.')
    expect(bien).toBe(true)
  })
})

describe('el hilo dibujado', () => {
  const plano = () => {
    const escena = new THREE.Scene()
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial())
    escena.add(suelo)
    suelo.updateMatrixWorld(true)
    return { escena, suelo }
  }
  const colorDe = (o: THREE.Object3D) => ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()

  it('cada línea con su hilo: cambiar de hilo no repinta lo cosido antes', () => {
    const { escena, suelo } = plano()
    const vicryl = { nombre: 'Vicryl 2-0', grosorMm: 0.9, color: 0x6a4cb0 }
    const nylon = { nombre: 'Nylon 3-0', grosorMm: 0.7, color: 0x14141a }
    const s = crearSutura(escena, nylon)
    s.puntos = [
      { punto: [0, 0, 0], normal: [0, 1, 0], lado: 1, nuevaLinea: true, hilo: vicryl },
      { punto: [0.01, 0, 0], normal: [0, 1, 0], lado: -1, nuevaLinea: false, hilo: vicryl },
      { punto: [0, 0, 0.02], normal: [0, 1, 0], lado: 1, nuevaLinea: true, hilo: nylon },
      { punto: [0.01, 0, 0.02], normal: [0, 1, 0], lado: -1, nuevaLinea: false, hilo: nylon },
    ]
    reconstruirHilo(s, [suelo], 0.001)
    const tubos = s.hechos.filter((o) => (o as THREE.Mesh).geometry instanceof THREE.TubeGeometry)
    expect(tubos.map(colorDe).sort()).toEqual([0x14141a, 0x6a4cb0].sort())
  })

  it('una puntada con otro hilo empieza otra línea aunque no lo diga, y la comparación es por lo que es el hilo', () => {
    const { escena, suelo } = plano()
    const s = crearSutura(escena, { nombre: 'Nylon 3-0', grosorMm: 0.7, color: 0x14141a })
    // Dos objetos iguales, como los que vuelven de la sesión guardada: es una sola línea.
    const igual = () => ({ nombre: 'Monocryl 4-0', grosorMm: 0.6, color: 0xd8c9a0 })
    s.puntos = [
      { punto: [0, 0, 0], normal: [0, 1, 0], lado: 1, nuevaLinea: true, hilo: igual() },
      { punto: [0.01, 0, 0], normal: [0, 1, 0], lado: -1, nuevaLinea: false, hilo: igual() },
      { punto: [0.02, 0, 0], normal: [0, 1, 0], lado: 1, nuevaLinea: false, hilo: igual() },
    ]
    reconstruirHilo(s, [suelo], 0.001)
    expect(s.hechos.filter((o) => (o as THREE.Mesh).geometry instanceof THREE.TubeGeometry)).toHaveLength(1)
  })

  it('los corchetes son grapas de acero entre los dos labios, sin nudos', () => {
    const { escena, suelo } = plano()
    const corchetes = { nombre: 'Corchetes', grosorMm: 0.7, color: 0xb9bec6, tipo: 'corchete' as const }
    const s = crearSutura(escena, corchetes)
    s.puntos = [0, 0.007, 0.014].flatMap((z) => [
      { punto: [-0.003, 0, z] as [number, number, number], normal: [0, 1, 0] as [number, number, number], lado: 1 as const, nuevaLinea: true, hilo: corchetes },
      { punto: [0.003, 0, z] as [number, number, number], normal: [0, 1, 0] as [number, number, number], lado: -1 as const, nuevaLinea: false, hilo: corchetes },
    ])
    reconstruirHilo(s, [suelo], 0.001)
    expect(s.hechos).toHaveLength(3)
    for (const o of s.hechos) {
      const m = o as THREE.Mesh
      expect(m.geometry).toBeInstanceOf(THREE.TubeGeometry)
      expect((m.material as THREE.MeshStandardMaterial).metalness).toBeGreaterThan(0.5)
      // Las patas entran en la piel: el corchete baja por debajo del plano donde se apoya.
      m.geometry.computeBoundingBox()
      expect(m.geometry.boundingBox!.min.y).toBeLessThan(0)
    }
  })
})

describe('en el lienzo y la consola', () => {
  const lienzo = readFileSync('src/components/simulador/LienzoQuirurgico.tsx', 'utf8')
  const consola = readFileSync('src/components/simulador/ConsolaQuirurgica.tsx', 'utf8')

  it('el clic con el cierre armado cierra el plano antes de mirar el hilo de la mano', () => {
    const subir = lienzo.indexOf('const alSubirParaCoser')
    const armado = lienzo.indexOf("ultimas.current.modo === 'coser' && armado", subir)
    const hiloDeLaMano = lienzo.indexOf('const hilo = ultimas.current.instrumento?.sutura', subir)
    expect(armado).toBeGreaterThan(subir)
    expect(armado).toBeLessThan(hiloDeLaMano)
  })

  it('la puntada a mano lleva su hilo y ya no cambia el de la sutura entera', () => {
    expect(lienzo).not.toMatch(/sutura\.hilo = hilo/)
    expect(lienzo).toMatch(/plano,\s*\n\s*hilo,\s*\n\s*\}/)
  })

  it('cada puntada guarda su hilo en la sesión', () => {
    expect(lienzo).toMatch(/hilo: q\.hilo,\s*\n\s*asistida: q\.asistida,/)
  })

  it('el aviso final ya no dice «(5 a 10 mm)» de la fascia', () => {
    expect(consola).toContain('textoDeLaHeridaCerrada(estado.planos)')
  })
})
