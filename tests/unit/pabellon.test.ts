import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { montarElPabellon } from '@/components/simulador/pabellon'

/**
 * Dónde cuelga la lámpara (P-014 E4).
 *
 * Hasta que hubo colchón la lámpara iba «hacia +Y», que es hacia la cabeza del paciente: el modelo se miraba de
 * pie y esa era su parte de arriba. Con el paciente acostado eso deja la luz a ras de la camilla, y boca abajo
 * detrás del colchón: con las sombras encendidas, el paciente entero a oscuras. No falla nada —la escena se
 * dibuja, solo que negra—, así que se fija aquí de qué lado queda la luz.
 */
describe('la lámpara del pabellón', () => {
  const montar = () => {
    const escena = new THREE.Scene()
    const pabellon = montarElPabellon(escena, { sombras: false })
    const focos = escena.children.filter((o): o is THREE.SpotLight => (o as THREE.SpotLight).isSpotLight)
    // La lámpara es la más intensa de las dos; la otra es su satélite.
    const [lampara, satelite] = [...focos].sort((a, b) => b.intensity - a.intensity)
    return { escena, pabellon, lampara, satelite }
  }
  // Una pierna: larga en Y, como viene del atlas.
  const caja = new THREE.Box3(new THREE.Vector3(-0.06, -0.2, -0.05), new THREE.Vector3(0.06, 0.2, 0.05))
  const centro = caja.getCenter(new THREE.Vector3())
  const hacia = (foco: THREE.SpotLight) => foco.position.clone().sub(centro).normalize()

  it('sin colchón cuelga hacia +Y y algo por delante, como siempre', () => {
    const { pabellon, lampara } = montar()
    pabellon.colocar(caja)
    const d = hacia(lampara)
    expect(d.y).toBeGreaterThan(0.7)
    expect(d.z).toBeGreaterThan(0)
    expect(lampara.target.position.distanceTo(centro)).toBeLessThan(1e-9)
  })

  it('con el paciente boca arriba cuelga sobre la camilla, corrida hacia la cabeza', () => {
    const { pabellon, lampara, satelite } = montar()
    const arriba = new THREE.Vector3(0, 0, 1)
    const cabeza = new THREE.Vector3(0, 1, 0)
    pabellon.colocar(caja, { arriba, cabeza })
    const d = hacia(lampara)
    // Casi a plomo: más de arriba que de ningún otro lado.
    expect(d.dot(arriba)).toBeGreaterThan(0.8)
    expect(d.dot(cabeza)).toBeGreaterThan(0)
    // La satélite, también por encima y del otro costado: entre las dos no dejan una cara del miembro en sombra.
    const s = hacia(satelite)
    const lado = new THREE.Vector3().crossVectors(cabeza, arriba)
    expect(s.dot(arriba)).toBeGreaterThan(0.5)
    expect(Math.sign(s.dot(lado))).toBe(-Math.sign(d.dot(lado)))
  })

  it('boca abajo se va con el colchón al otro lado: nunca queda detrás de él', () => {
    const { pabellon, lampara } = montar()
    const arriba = new THREE.Vector3(0, 0, -1)
    pabellon.colocar(caja, { arriba, cabeza: new THREE.Vector3(0, 1, 0) })
    expect(hacia(lampara).dot(arriba)).toBeGreaterThan(0.8)
    expect(lampara.position.z).toBeLessThan(centro.z)
  })

  it('la distancia va con el tamaño del modelo, esté como esté el paciente', () => {
    const { pabellon, lampara } = montar()
    const radio = caja.getSize(new THREE.Vector3()).length() / 2
    pabellon.colocar(caja)
    expect(lampara.position.distanceTo(centro)).toBeCloseTo(radio * 2.6, 9)
    pabellon.colocar(caja, { arriba: new THREE.Vector3(0, 0, 1), cabeza: new THREE.Vector3(0, 1, 0) })
    expect(lampara.position.distanceTo(centro)).toBeCloseTo(radio * 2.6, 9)
  })

  it('una caja vacía no mueve nada', () => {
    const { pabellon, lampara } = montar()
    pabellon.colocar(caja)
    const antes = lampara.position.clone()
    pabellon.colocar(new THREE.Box3())
    expect(lampara.position.equals(antes)).toBe(true)
  })

  it('al soltarlo no deja luces en la escena', () => {
    const { escena, pabellon } = montar()
    pabellon.liberar()
    expect(escena.children.filter((o) => (o as THREE.Light).isLight)).toHaveLength(0)
  })
})
