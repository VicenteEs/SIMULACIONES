import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acercarHacia,
  encuadreDeLaHerida,
  FACTOR_POR_MUESCA,
  MAS_CERCA_MM,
  MUESCAS_POR_EVENTO,
  muescasDeLaRueda,
  PARTE_DE_LA_HERIDA,
  RADIO_MINIMO_MM,
} from '@/lib/acercarComoSeMira'

// Acercar como se mira (P-012 E5): la rueda hacia el cursor, el doble clic que centra y «Encuadrar la herida».

const MM = 0.001 // unidades del mundo por milímetro, con el modelo en metros
const LIMITES = { minimo: 20 * MM, maximo: 5 }
const resta = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const largo = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2])
const unitario = (a: readonly number[]) => a.map((x) => x / largo(a))
const cerca = (a: readonly number[], b: readonly number[], tolerancia = 1e-9) =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], Math.round(-Math.log10(tolerancia))))

describe('las muescas de la rueda', () => {
  it('una muesca hacia delante acerca y una hacia atrás aleja', () => {
    expect(muescasDeLaRueda({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBe(1)
    expect(muescasDeLaRueda({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBe(-1)
  })

  it('en líneas (Firefox) tres líneas son una muesca', () => {
    expect(muescasDeLaRueda({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBe(1)
  })

  it('el pellizco del panel táctil, que llega con Ctrl y pocos píxeles, acerca como la rueda', () => {
    expect(muescasDeLaRueda({ deltaY: -5, deltaMode: 0, ctrlKey: true })).toBeCloseTo(0.5)
  })

  it('ninguna rueda salta más de tres muescas de una vez, y un evento vacío no mueve nada', () => {
    expect(muescasDeLaRueda({ deltaY: -1000, deltaMode: 0, ctrlKey: false })).toBe(MUESCAS_POR_EVENTO)
    expect(muescasDeLaRueda({ deltaY: 1000, deltaMode: 0, ctrlKey: false })).toBe(-MUESCAS_POR_EVENTO)
    expect(muescasDeLaRueda({ deltaY: 0, deltaMode: 0, ctrlKey: false })).toBe(0)
    expect(muescasDeLaRueda({ deltaY: Number.NaN, deltaMode: 0, ctrlKey: false })).toBe(0)
  })
})

describe('acercar hacia lo que hay bajo el cursor', () => {
  // La pierna entera: la cámara a 2 m del centro, que es lo que mira; bajo el cursor, un punto de la piel apartado.
  const vista = { camara: [0, 0, 2], mirado: [0, 0, 0] }
  const piel = [0.2, 0.1, 0.05]

  it('el punto de la piel se queda quieto en la pantalla: la cámara no cambia de mirada ni de rayo hacia él', () => {
    const tras = acercarHacia(vista, piel, 1, LIMITES)!
    // La misma dirección de la mirada (no gira)…
    cerca(unitario(resta(tras.mirado, tras.camara)), unitario(resta(vista.mirado, vista.camara)))
    // …y el punto sigue en el mismo rayo desde la cámara, así que se ve en el mismo píxel.
    cerca(unitario(resta(piel, tras.camara)), unitario(resta(piel, vista.camara)))
  })

  it('cada muesca acerca un 15 % de lo que queda, y el punto mirado se acerca con la cámara', () => {
    const antes = largo(resta(vista.camara, piel))
    const tras = acercarHacia(vista, piel, 1, LIMITES)!
    expect(largo(resta(tras.camara, piel))).toBeCloseTo(antes * FACTOR_POR_MUESCA, 9)
    expect(largo(resta(tras.mirado, piel))).toBeCloseTo(largo(resta(vista.mirado, piel)) * FACTOR_POR_MUESCA, 9)
  })

  it('las 25 muescas de la auditoría son ahora 8', () => {
    expect(Math.pow(FACTOR_POR_MUESCA, 8)).toBeLessThanOrEqual(Math.pow(0.95, 25))
    expect(Math.pow(FACTOR_POR_MUESCA, 7)).toBeGreaterThan(Math.pow(0.95, 25))
  })

  it('no atraviesa la piel: se para a 2 cm y la muesca siguiente ya no mueve nada', () => {
    let v: { camara: readonly number[]; mirado: readonly number[] } = vista
    for (let i = 0; i < 200; i++) v = acercarHacia(v, piel, 3, LIMITES) ?? v
    expect(largo(resta(v.camara, piel))).toBeCloseTo(MAS_CERCA_MM * MM, 9)
    expect(acercarHacia(v, piel, 1, LIMITES)).toBeNull()
    // Pero alejar sí.
    expect(acercarHacia(v, piel, -1, LIMITES)).not.toBeNull()
  })

  it('quien empezó más cerca que el tope no sale despedido hacia atrás al acercar', () => {
    const pegada = { camara: [0, 0, 0.01], mirado: [0, 0, -0.5] }
    expect(acercarHacia(pegada, [0, 0, 0], 1, LIMITES)).toBeNull()
  })

  it('alejar tiene su tope, para no dejar la pierna en un punto del fondo', () => {
    let v: { camara: readonly number[]; mirado: readonly number[] } = vista
    for (let i = 0; i < 200; i++) v = acercarHacia(v, piel, -3, LIMITES) ?? v
    expect(largo(resta(v.camara, piel))).toBeCloseTo(LIMITES.maximo, 9)
    expect(acercarHacia(v, piel, -1, LIMITES)).toBeNull()
  })

  it('sin nada bajo el cursor, el foco es lo que se mira: acerca de frente y no se mueve el punto mirado', () => {
    const tras = acercarHacia(vista, vista.mirado, 1, LIMITES)!
    cerca(tras.mirado, vista.mirado)
    expect(tras.camara[2]).toBeCloseTo(2 * FACTOR_POR_MUESCA, 9)
  })

  it('acercar y alejar lo mismo en el mismo sitio deja la vista como estaba', () => {
    const ida = acercarHacia(vista, piel, 2, LIMITES)!
    const vuelta = acercarHacia(ida, piel, -2, LIMITES)!
    cerca(vuelta.camara, vista.camara)
    cerca(vuelta.mirado, vista.mirado)
  })
})

describe('encuadrar la herida', () => {
  // Una incisión de 10 cm a lo largo de Y en la cara anterior (+Z) de la pierna.
  const puntos = Array.from({ length: 11 }, (_, i) => [0.1, -0.05 + i * 0.01, 0.04])
  const normales = puntos.map(() => [0, 0, 1])
  const ahora = { direccion: [1, 0, 0], arriba: [0, 1, 0] }
  const camara = { fovGrados: 42, aspecto: 16 / 9 }

  it('sin herida, nada', () => {
    expect(encuadreDeLaHerida([], [], ahora, camara, MM)).toBeNull()
  })

  it('la herida en el centro y mirada de frente, desde fuera de la piel', () => {
    const e = encuadreDeLaHerida(puntos, normales, ahora, camara, MM)!
    cerca(e.centro, [0.1, 0, 0.04])
    cerca(e.direccion, [0, 0, 1])
    // El arriba de antes se conserva cuando cabe: así la vista no da una vuelta.
    cerca(e.arriba, [0, 1, 0])
  })

  it('ocupa el 60 % del lado estrecho del lienzo', () => {
    const e = encuadreDeLaHerida(puntos, normales, ahora, camara, MM)!
    const mitad = (camara.fovGrados * Math.PI) / 360
    // Con el lienzo apaisado, lo estrecho es el alto.
    expect(0.05 / e.distancia).toBeCloseTo(PARTE_DE_LA_HERIDA * Math.tan(mitad), 9)
    // En un lienzo de móvil, en vertical, lo estrecho es el ancho, y hay que alejarse más.
    const enVertical = encuadreDeLaHerida(puntos, normales, ahora, { fovGrados: 42, aspecto: 9 / 16 }, MM)!
    expect(enVertical.distancia).toBeGreaterThan(e.distancia)
  })

  it('una herida pequeña no se encuadra al microscopio', () => {
    const corta = [
      [0, 0, 0],
      [0, 0.002, 0],
    ]
    const e = encuadreDeLaHerida(corta, [[0, 0, 1], [0, 0, 1]], ahora, camara, MM)!
    const mitad = (camara.fovGrados * Math.PI) / 360
    expect(e.distancia).toBeCloseTo((RADIO_MINIMO_MM * MM) / (PARTE_DE_LA_HERIDA * Math.tan(mitad)), 9)
  })

  it('si las normales no se ponen de acuerdo, se mira desde donde se miraba', () => {
    const opuestas = puntos.map((_, i) => (i % 2 === 0 ? [0, 0, 1] : [0, 0, -1]))
    const e = encuadreDeLaHerida(puntos, opuestas, ahora, camara, MM)!
    cerca(e.direccion, [1, 0, 0])
  })

  it('con el arriba de antes en la dirección nueva, el arriba es otro eje y siempre perpendicular a la mirada', () => {
    const desdeArriba = encuadreDeLaHerida(puntos, puntos.map(() => [0, 1, 0]), ahora, camara, MM)!
    cerca(desdeArriba.direccion, [0, 1, 0])
    const d = desdeArriba.direccion
    const a = desdeArriba.arriba
    expect(Math.abs(d[0] * a[0] + d[1] * a[1] + d[2] * a[2])).toBeLessThan(1e-9)
    expect(largo(a)).toBeCloseTo(1, 9)
  })
})

describe('en el lienzo y en la consola', () => {
  const raiz = join(__dirname, '..', '..', 'src', 'components', 'simulador')
  const lienzo = readFileSync(join(raiz, 'LienzoQuirurgico.tsx'), 'utf8')
  const consola = readFileSync(join(raiz, 'ConsolaQuirurgica.tsx'), 'utf8')

  it('la rueda se atiende antes de que llegue a OrbitControls, que si no acercaría también', () => {
    expect(lienzo).toContain("superficie.addEventListener('wheel', alRodar, { capture: true, passive: false })")
    expect(lienzo).toContain("superficie.removeEventListener('wheel', alRodar, { capture: true })")
    const rueda = lienzo.slice(lienzo.indexOf('const alRodar = (evento: WheelEvent)'), lienzo.indexOf("superficie.addEventListener('wheel'"))
    expect(rueda).toContain('evento.stopPropagation()')
    expect(rueda).toContain('superficieBajoElCursor()')
    // El pellizco de la tableta lo sigue atendiendo OrbitControls: su zoom no se apaga.
    expect(lienzo).toContain('controles.enableZoom = true')
  })

  it('el doble clic centra solo mirando o leyendo fichas, donde un clic no hace nada en el paciente', () => {
    const doble = lienzo.slice(lienzo.indexOf('const alDobleClic = (evento: MouseEvent)'), lienzo.indexOf("superficie.addEventListener('dblclick'"))
    expect(doble).toContain("if (modo !== 'orbitar' && modo !== 'info') return")
    expect(doble).toContain('llevarLaCamaraAlEncuadre(')
  })

  it('la E encuadra la herida, y sin herida lo dice', () => {
    const tecla = consola.slice(consola.indexOf("if (e.key === 'e' || e.key === 'E')"), consola.indexOf("if (e.key === 'e' || e.key === 'E')") + 400)
    expect(tecla).toContain('mando.current?.encuadrarLaHerida()')
    expect(tecla).toContain("'atencion'")
    expect(consola).toContain('aria-keyshortcuts="E"')
  })
})
