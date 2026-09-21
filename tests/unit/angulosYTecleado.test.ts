import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cuaternionDeGrados, gradosDeCuaternion } from '@/atlas/angulos'
import {
  desplazamientoTecleado,
  giroTecleado,
  numeroTecleado,
  teclearNumero,
} from '@/atlas/transformar'

/** El panel de números y los valores tecleados durante un gesto (D-133). */

describe('ángulos sin three', () => {
  // `angulos.ts` no importa three para que el taller pueda usarlo; tiene que
  // dar lo mismo que three, o un giro tecleado no sería el que se dibuja.
  it('da el mismo cuaternión que THREE.Euler en orden XYZ', () => {
    for (const grados of [[15, 0, 0], [0, -40, 0], [0, 0, 90], [20, 35, -50]] as const) {
      const nuestro = cuaternionDeGrados([...grados])
      const [rx, ry, rz] = grados.map((g) => (g * Math.PI) / 180)
      const deThree = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'))
      expect(nuestro[0]).toBeCloseTo(deThree.x, 9)
      expect(nuestro[1]).toBeCloseTo(deThree.y, 9)
      expect(nuestro[2]).toBeCloseTo(deThree.z, 9)
      expect(nuestro[3]).toBeCloseTo(deThree.w, 9)
    }
  })

  it('va y vuelve: los grados que se teclean son los que se leen después', () => {
    for (const grados of [[15, 0, 0], [0, 0, -30], [20, 35, -50], [0, 0, 0]] as [number, number, number][]) {
      const vuelta = gradosDeCuaternion(cuaternionDeGrados(grados))
      grados.forEach((g, i) => expect(vuelta[i]).toBeCloseTo(g, 2))
    }
  })

  it('el reposo se lee como tres ceros, sin «-0»', () => {
    expect(gradosDeCuaternion([0, 0, 0, 1]).map(String)).toEqual(['0', '0', '0'])
  })
})

describe('valores tecleados durante el gesto', () => {
  it('cifras, un solo punto, el signo alterna y Retroceso borra', () => {
    let texto = ''
    for (const tecla of ['1', '2', '.', '.', '5']) texto = teclearNumero(texto, tecla) ?? texto
    expect(texto).toBe('12.5')
    expect(teclearNumero(texto, '-')).toBe('-12.5')
    expect(teclearNumero('-12.5', '-')).toBe('12.5')
    expect(teclearNumero(texto, 'backspace')).toBe('12.')
    expect(teclearNumero(texto, ',')).toBe('12.5')
    // Una tecla que no es de número no es suya.
    expect(teclearNumero(texto, 'h')).toBeNull()
  })

  // «-» o «.» son un número a medio escribir: si valieran cero, la pieza
  // saltaría a su sitio entre una tecla y la siguiente.
  it('un número a medias no es un cero', () => {
    expect(numeroTecleado('')).toBeNull()
    expect(numeroTecleado('-')).toBeNull()
    expect(numeroTecleado('.')).toBeNull()
    expect(numeroTecleado('8')).toBe(8)
    expect(numeroTecleado('12.')).toBe(12)
    expect(numeroTecleado('-0.5')).toBe(-0.5)
  })

  it('G X 8: ocho milímetros por el eje, y por X si no se dijo ninguno', () => {
    expect(desplazamientoTecleado(8, 'y').toArray()).toEqual([0, 0.008, 0])
    expect(desplazamientoTecleado(8, null).toArray()).toEqual([0.008, 0, 0])
  })

  it('R Z 90 gira con la regla de la mano derecha: el +X pasa al +Y', () => {
    const camara = new THREE.PerspectiveCamera()
    camara.position.set(0, 0, 5)
    const q = giroTecleado(camara, new THREE.Vector3(), 90, 'z')
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
    expect(x.x).toBeCloseTo(0, 6)
    expect(x.y).toBeCloseTo(1, 6)
  })
})
