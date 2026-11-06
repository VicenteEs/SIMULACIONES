import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ABULTAMIENTO_MAXIMO_MM,
  ALCANCE_MM,
  HOLGURA_DE_LA_CARA_DE_DENTRO_MM,
  HOLGURA_DE_LA_CARA_DE_FUERA_MM,
  PASO_DE_LAS_MUESTRAS_MM,
  PENDIENTE_DE_LA_PIEL,
  RADIO_DEL_ABULTAMIENTO_MM,
  abultamientoMm,
  muestrasDeLaSuperficie,
  tenderLaPiel,
  verticesDeLaCaraDeDentro,
} from '@/lib/abultamientoDeLaPiel'
import {
  abultamientoMaximoMm,
  crearAbultamientoDeLaPiel,
  marcarLaCaraDeDentro,
  quitarElAbultamiento,
} from '@/components/simulador/abultamientoEnLaEscena'

/**
 * La piel que se hincha (P-013, pedidos 1 y 8 de Cristóbal): «al cerrar, la mitad de la placa quedó afuera de la piel» y
 * «hacer que la piel se hinche y no que el fragmento óseo se salga por encima de ella».
 *
 * Lo que no puede volver: una placa o un trozo por fuera de la piel cerrada, un bulto que se queda cuando lo que empujaba
 * se fue, y un bulto que se suma a sí mismo cada vez que la herida reescribe la piel.
 */

/** Una piel plana en z = `z`, de `lado` mm, un vértice cada milímetro, que mira hacia `haciaFuera`. */
function pielPlana(z: number, lado = 40, haciaFuera: 1 | -1 = 1, holgura = HOLGURA_DE_LA_CARA_DE_FUERA_MM) {
  const pos: number[] = []
  for (let x = -lado / 2; x <= lado / 2; x += 1) for (let y = -lado / 2; y <= lado / 2; y += 1) pos.push(x, y, z)
  const n = pos.length / 3
  const dir = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) dir[i * 3 + 2] = haciaFuera
  return { posiciones: Float32Array.from(pos), haciaFuera: dir, holguras: new Float32Array(n).fill(holgura) }
}
/** Una placa de 10 × 30 mm en z = `z`, un punto cada milímetro. */
function placa(z: number): Float32Array {
  const pos: number[] = []
  for (let x = -5; x <= 5; x += 1) for (let y = -15; y <= 15; y += 1) pos.push(x, y, z)
  return Float32Array.from(pos)
}
const enXY = (p: { posiciones: Float32Array }, x: number, y: number) => {
  for (let i = 0; i < p.posiciones.length / 3; i++) if (p.posiciones[i * 3] === x && p.posiciones[i * 3 + 1] === y) return i
  return -1
}

describe('cuánto sube la piel', () => {
  it('sobre una placa que asoma 1 mm, la cara de fuera sube lo que asoma más su dermis', () => {
    const piel = pielPlana(0)
    const sube = abultamientoMm(piel, placa(1))
    expect(sube[enXY(piel, 0, 0)]).toBeCloseTo(1 + HOLGURA_DE_LA_CARA_DE_FUERA_MM, 5)
  })

  it('a los lados cae sola, sin escalón, y lejos no se mueve', () => {
    const piel = pielPlana(0)
    const sube = abultamientoMm(piel, placa(1))
    const perfil = [0, 5, 8, 11, 14, 17].map((x) => sube[enXY(piel, x, 0)])
    for (let k = 1; k < perfil.length; k++) expect(perfil[k]).toBeLessThanOrEqual(perfil[k - 1] + 1e-6)
    expect(perfil[1]).toBeCloseTo(perfil[0], 5)
    // El borde de la placa está en x = 5: a más de 12 mm de él, nada.
    expect(sube[enXY(piel, 5 + RADIO_DEL_ABULTAMIENTO_MM + 1, 0)]).toBe(0)
  })

  it('con un punto cada 3 mm, la piel sobre un trozo grande no se ondula entre ellos', () => {
    const puntos: number[] = []
    for (let x = -15; x <= 15; x += PASO_DE_LAS_MUESTRAS_MM) for (let y = -15; y <= 15; y += PASO_DE_LAS_MUESTRAS_MM) puntos.push(x, y, 10)
    const piel = pielPlana(0, 12)
    const sube = abultamientoMm(piel, Float32Array.from(puntos))
    const alto = 10 + HOLGURA_DE_LA_CARA_DE_FUERA_MM
    // Encima de un punto, a medio camino entre dos y en el centro de un cuadro de cuatro: todos igual de altos.
    for (const [x, y] of [[0, 0], [1, 0], [2, 1], [-4, -5]]) expect(sube[enXY(piel, x, y)]).toBeCloseTo(alto, 4)
  })

  it('lo que está hondo no pide nada: el hueso en su sitio no levanta la piel', () => {
    expect(Math.max(...abultamientoMm(pielPlana(0), placa(-10)))).toBe(0)
  })

  it('la cara de dentro, que mira al cuerpo, sube hacia fuera con su propia holgura', () => {
    const dentro = pielPlana(-4, 40, 1, HOLGURA_DE_LA_CARA_DE_DENTRO_MM)
    const sube = abultamientoMm(dentro, placa(-3.5))
    expect(sube[enXY(dentro, 0, 0)]).toBeCloseTo(0.5 + HOLGURA_DE_LA_CARA_DE_DENTRO_MM, 5)
  })

  it('hasta el máximo sigue al trozo, después lo suelta, y un trozo lanzado lejos no la estira hasta él', () => {
    expect(Math.max(...abultamientoMm(pielPlana(0), placa(ABULTAMIENTO_MAXIMO_MM - 2)))).toBeCloseTo(ABULTAMIENTO_MAXIMO_MM, 5)
    // Un peroné arrastrado que asoma 20 mm queda tapado, con su dermis encima.
    expect(Math.max(...abultamientoMm(pielPlana(0), placa(20)))).toBeCloseTo(20 + HOLGURA_DE_LA_CARA_DE_FUERA_MM, 5)
    const soltando = Math.max(...abultamientoMm(pielPlana(0), placa(ABULTAMIENTO_MAXIMO_MM + RADIO_DEL_ABULTAMIENTO_MM / 2)))
    expect(soltando).toBeGreaterThan(0)
    expect(soltando).toBeLessThan(ABULTAMIENTO_MAXIMO_MM)
    expect(Math.max(...abultamientoMm(pielPlana(0), placa(80)))).toBe(0)
    expect(Math.max(...abultamientoMm(pielPlana(0), placa(ALCANCE_MM + 0.5)))).toBe(0)
  })

  it('un trozo que sale poco a poco no hace saltar la piel', () => {
    // Era el fallo: la rejilla dejaba de ver el trozo entre 12 y 24 mm, y la piel caía de 26 mm a nada de un cuadro al otro.
    // De cuarto en cuarto de milímetro, lo más que cambia al soltarlo es el máximo por π/2 entre el radio: 1 mm.
    const piel = pielPlana(0, 24)
    const centro = enXY(piel, 0, 0)
    let antes = abultamientoMm(piel, placa(0))[centro]
    for (let z = 0.25; z <= ALCANCE_MM + 2; z += 0.25) {
      const ahora = abultamientoMm(piel, placa(z))[centro]
      expect(Math.abs(ahora - antes)).toBeLessThan(2.5)
      antes = ahora
    }
  })

  it('lo que está lejos de toda la piel no cuenta, y repartido por metros la rejilla agranda sus celdas y da lo mismo', () => {
    const piel = pielPlana(0, 24)
    const centro = enXY(piel, 0, 0)
    const sola = abultamientoMm(piel, placa(1))[centro]
    const conUnoLejos = Float32Array.from([...placa(1), 5_000_000, 0, 0])
    expect(abultamientoMm(piel, conUnoLejos)[centro]).toBeCloseTo(sola, 6)
    // Una piel de tres metros de lado con puntos en las dos puntas: 250³ celdas de 12 mm no caben.
    const grande = {
      posiciones: Float32Array.from([...piel.posiciones, 3000, 3000, 3000]),
      haciaFuera: Float32Array.from([...piel.haciaFuera, 0, 0, 1]),
      holguras: Float32Array.from([...piel.holguras, HOLGURA_DE_LA_CARA_DE_FUERA_MM]),
    }
    const repartidos = Float32Array.from([...placa(1), 3000, 3000, 3001])
    const sube = abultamientoMm(grande, repartidos)
    expect(sube[centro]).toBeCloseTo(sola, 6)
    expect(sube[sube.length - 1]).toBeCloseTo(1 + HOLGURA_DE_LA_CARA_DE_FUERA_MM, 6)
  })

  it('el alcance es el mismo para todos los vértices, caiga cada uno donde caiga en su celda', () => {
    for (const z of [0, 5, 11, 11.9, -7]) {
      const piel = pielPlana(z, 24)
      expect(abultamientoMm(piel, placa(z + 20))[enXY(piel, 0, 0)]).toBeCloseTo(20 + HOLGURA_DE_LA_CARA_DE_FUERA_MM, 4)
    }
  })
})

describe('la piel tendida', () => {
  /** Una fila de vértices a 1 mm, cada uno vecino de los de al lado. */
  const fila = (n: number) => {
    const posiciones = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) posiciones[k * 3] = k
    const vecinos = (k: number, visitar: (j: number) => void) => {
      if (k > 0) visitar(k - 1)
      if (k < n - 1) visitar(k + 1)
    }
    return { posiciones, vecinos }
  }

  it('alrededor de lo alto baja con la pendiente, nunca más empinada', () => {
    const { posiciones, vecinos } = fila(41)
    const sube = new Float32Array(41)
    sube[20] = 15
    tenderLaPiel(sube, posiciones, vecinos, PENDIENTE_DE_LA_PIEL)
    for (let k = 0; k < 41; k++) expect(sube[k]).toBeCloseTo(Math.max(0, 15 - Math.abs(k - 20) * PENDIENTE_DE_LA_PIEL), 4)
  })

  it('nunca baja a ninguno: lo que tapaba lo sigue tapando', () => {
    const { posiciones, vecinos } = fila(11)
    const pedido = Float32Array.from([0, 0, 6, 0, 0, 0, 0, 4, 4.5, 0, 0])
    const sube = tenderLaPiel(Float32Array.from(pedido), posiciones, vecinos, 1)
    for (let k = 0; k < 11; k++) expect(sube[k]).toBeGreaterThanOrEqual(pedido[k])
    expect(sube[5]).toBeCloseTo(3, 4)
    expect(sube[8]).toBeCloseTo(4.5, 4)
  })

  it('no salta a lo que no está unido por la piel: la otra pierna, la otra cara', () => {
    const posiciones = Float32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0])
    const sube = tenderLaPiel(Float32Array.from([10, 0, 0]), posiciones, (k, visitar) => (k === 0 ? visitar(1) : k === 1 ? visitar(0) : undefined), 1)
    expect([...sube]).toEqual([10, 9, 0])
  })
})

describe('las muestras de lo que empuja', () => {
  it('una cara larga sin vértices en medio se llena de puntos', () => {
    const triangulo = [0, 0, 0, 20, 0, 0, 0, 20, 0]
    const puntos = muestrasDeLaSuperficie(triangulo, null, 1.5)
    expect(puntos.length / 3).toBeGreaterThan(50)
    for (let i = 0; i < puntos.length; i += 3) {
      expect(puntos[i] + puntos[i + 1]).toBeLessThanOrEqual(20 + 1e-4)
      expect(puntos[i + 2]).toBe(0)
    }
  })

  it('una malla fina se queda con uno por celda', () => {
    const fina: number[] = []
    for (let i = 0; i < 1000; i++) fina.push(Math.random() * 3, Math.random() * 3, 0)
    expect(muestrasDeLaSuperficie(fina, null, 1.5).length / 3).toBeLessThanOrEqual(4 * 2)
  })

  it('la cara de dentro se lee de sus triángulos', () => {
    expect([...verticesDeLaCaraDeDentro(Uint8Array.from([0, 1]), [0, 1, 2, 2, 3, 4], 5)]).toEqual([0, 0, 1, 1, 1])
  })
})

describe('en la escena', () => {
  /**
   * Una piel de 60 × 60 mm en metros, como el modelo, vestida como piel, y una placa de 10 × 30 × 3 mm que asoma por ella.
   * Con `cuantizada`, las normales como las trae el atlas: enteros de 16 bits normalizados (`glb.ts`).
   */
  function escena({ cuantizada = false, vestida = true } = {}) {
    const geometria = new THREE.PlaneGeometry(0.06, 0.06, 60, 60)
    if (cuantizada) {
      const n = geometria.getAttribute('normal')
      const enteros = new Int16Array(n.count * 3)
      for (let i = 0; i < n.count * 3; i++) enteros[i] = Math.round((n.array as Float32Array)[i] * 32767)
      geometria.setAttribute('normal', new THREE.BufferAttribute(enteros, 3, true))
    }
    const piel = new THREE.Mesh(geometria, new THREE.MeshBasicMaterial())
    piel.name = 'piel'
    if (vestida) marcarLaCaraDeDentro(piel)
    const placaDeMetal = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.003), new THREE.MeshBasicMaterial())
    placaDeMetal.position.set(0, 0, 0.0005)
    const raiz = new THREE.Group()
    raiz.add(piel, placaDeMetal)
    raiz.updateMatrixWorld(true)
    return { piel, placaDeMetal }
  }
  const zMaxima = (m: THREE.Mesh) => {
    const p = m.geometry.getAttribute('position')
    let mayor = -Infinity
    for (let i = 0; i < p.count; i++) mayor = Math.max(mayor, p.getZ(i))
    return mayor * 1000
  }

  it('la piel tapa la placa, y no vuelve a hacer nada si nada se movió', () => {
    const { piel, placaDeMetal } = escena()
    const a = crearAbultamientoDeLaPiel()
    expect(a.alDia([piel], [placaDeMetal], 1000)).toBe(true)
    // La cara de arriba de la placa está a 2 mm: la piel, con su dermis encima.
    expect(zMaxima(piel)).toBeGreaterThanOrEqual(2 + HOLGURA_DE_LA_CARA_DE_FUERA_MM - 0.05)
    expect(a.caja).not.toBeNull()
    expect(a.alDia([piel], [placaDeMetal], 1000)).toBe(false)
  })

  it('cuando lo que empujaba se va, la piel vuelve a ser la de antes', () => {
    const { piel, placaDeMetal } = escena()
    const antes = Float32Array.from(piel.geometry.getAttribute('position').array as Float32Array)
    const a = crearAbultamientoDeLaPiel()
    a.alDia([piel], [placaDeMetal], 1000)
    placaDeMetal.position.z = -0.02
    placaDeMetal.updateMatrixWorld(true)
    expect(a.alDia([piel], [placaDeMetal], 1000)).toBe(true)
    expect([...(piel.geometry.getAttribute('position').array as Float32Array)]).toEqual([...antes])
  })

  it('si la herida reescribe la piel, el bulto se vuelve a calcular sobre la nueva y no se suma a sí mismo', () => {
    const { piel, placaDeMetal } = escena()
    const a = crearAbultamientoDeLaPiel()
    a.alDia([piel], [placaDeMetal], 1000)
    const primera = zMaxima(piel)
    // Como `recomponer`: las posiciones de la base escritas de nuevo, y todas las normales rehechas.
    const atributo = piel.geometry.getAttribute('position') as THREE.BufferAttribute
    const plano = new THREE.PlaneGeometry(0.06, 0.06, 60, 60).getAttribute('position').array as Float32Array
    ;(atributo.array as Float32Array).set(plano)
    atributo.needsUpdate = true
    piel.geometry.computeVertexNormals()
    expect(a.alDia([piel], [placaDeMetal], 1000)).toBe(true)
    expect(zMaxima(piel)).toBeCloseTo(primera, 3)
  })

  it('con las normales del atlas, en enteros de 16 bits, sube lo mismo y las deja como estaban al bajar', () => {
    // Era el fallo: leídas del arreglo valían hasta 32 767, y la piel subió casi un kilómetro sin placa que tapar.
    const { piel, placaDeMetal } = escena({ cuantizada: true })
    const normal = piel.geometry.getAttribute('normal')
    const antes = Int16Array.from(normal.array as Int16Array)
    const a = crearAbultamientoDeLaPiel()
    a.alDia([piel], [placaDeMetal], 1000)
    expect(abultamientoMaximoMm(piel, 1000)).toBeCloseTo(2 + HOLGURA_DE_LA_CARA_DE_FUERA_MM, 1)
    expect(zMaxima(piel)).toBeLessThan(2 + HOLGURA_DE_LA_CARA_DE_FUERA_MM + 0.1)
    // Las normales del bulto, rehechas: siguen siendo unitarias, no ceros truncados.
    let inclinadas = 0
    for (let i = 0; i < normal.count; i++) {
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 2)
      if (normal.getZ(i) < 0.999) inclinadas++
    }
    expect(inclinadas).toBeGreaterThan(0)
    placaDeMetal.position.z = -0.02
    placaDeMetal.updateMatrixWorld(true)
    a.alDia([piel], [placaDeMetal], 1000)
    expect([...(normal.array as Int16Array)]).toEqual([...antes])
  })

  it('la fascia superficial, que el caso pone con la piel pero no se viste de piel, no se abulta', () => {
    const { piel, placaDeMetal } = escena({ vestida: false })
    expect(crearAbultamientoDeLaPiel().alDia([piel], [placaDeMetal], 1000)).toBe(false)
    expect(abultamientoMaximoMm(piel, 1000)).toBe(0)
    expect(zMaxima(piel)).toBe(0)
  })

  it('sobre un trozo que asoma 22 mm, la piel se tiende como una tienda y no como un dedo', () => {
    const { piel } = escena()
    const trozo = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), new THREE.MeshBasicMaterial())
    trozo.position.set(0, 0, 0.02)
    trozo.updateMatrixWorld(true)
    const antes = Float32Array.from(piel.geometry.getAttribute('position').array as Float32Array)
    crearAbultamientoDeLaPiel().alDia([piel], [trozo], 1000)
    const ahora = piel.geometry.getAttribute('position').array as Float32Array
    const sube = (i: number) => (ahora[i * 3 + 2] - antes[i * 3 + 2]) * 1000
    // La piel de la prueba es una rejilla de 61 × 61 vértices a 1 mm: de cada uno a los de al lado.
    let masEmpinada = 0
    for (let f = 0; f < 61; f++) {
      for (let c = 0; c < 60; c++) {
        masEmpinada = Math.max(masEmpinada, Math.abs(sube(f * 61 + c + 1) - sube(f * 61 + c)), Math.abs(sube(c * 61 + f + 61) - sube(c * 61 + f)))
      }
    }
    expect(zMaxima(piel)).toBeGreaterThanOrEqual(22 + HOLGURA_DE_LA_CARA_DE_FUERA_MM - 0.05)
    // Más una décima: lo que sube menos que eso no se mueve, y al pie de la falda queda ese escalón.
    expect(masEmpinada).toBeLessThanOrEqual(PENDIENTE_DE_LA_PIEL + 0.1)
  })

  it('cuenta lo que le costó, para la sonda', () => {
    const { piel, placaDeMetal } = escena()
    const a = crearAbultamientoDeLaPiel()
    a.alDia([piel], [placaDeMetal], 1000)
    expect(a.ultimaCuenta?.subidos).toBeGreaterThan(0)
    expect(a.ultimaCuenta?.candidatos).toBeGreaterThanOrEqual(a.ultimaCuenta?.subidos ?? 0)
    expect(a.ultimaCuenta?.ms).toBeGreaterThanOrEqual(0)
  })

  it('antes de cortar se quita: el corte no puede llevarse el bulto dentro', () => {
    const { piel, placaDeMetal } = escena()
    const antes = Float32Array.from(piel.geometry.getAttribute('position').array as Float32Array)
    crearAbultamientoDeLaPiel().alDia([piel], [placaDeMetal], 1000)
    quitarElAbultamiento(piel)
    expect([...(piel.geometry.getAttribute('position').array as Float32Array)]).toEqual([...antes])
    const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
    const i = lienzo.indexOf('quitarElAbultamiento(malla)')
    expect(i).toBeGreaterThan(0)
    expect(lienzo.indexOf('const herida = cortarCapa(malla, puntos, normales, parametros)', i)).toBeGreaterThan(i)
  })

  it('el lienzo la pone al día antes de cada dibujo, con la placa, los tornillos y el trozo del foco', () => {
    const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
    expect(lienzo).toContain("const cambio = abultamiento.alDia(mallasConRol(t, ultimas.current.piezas, ['piel']), loQueEmpujaLaPiel(), mm)")
    expect(lienzo).toContain('if (t.implantes?.placa) deGrupo(t.implantes.placa.grupo)')
    expect(lienzo).toContain("const delFoco = m === t.fragmento || !!t.posesReducidas?.has(m) || rolDe.get(m.name) === 'fragmento'")
  })
})
