import { describe, it, expect } from 'vitest'
import { catalogoEnPantalla } from '@/atlas/enPantalla'
import { armarArbol } from '@/atlas/catalogo'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * El árbol del taller solo lista lo que está en pantalla.
 *
 * El fallo que esto corrige: con la mano sola en pantalla, apagar un músculo y
 * pulsar la casilla del grupo «Músculos» encendía los músculos de todo el
 * cuerpo, porque el grupo contaba las piezas del atlas entero. Aquí se
 * comprueba la causa —el grupo ya no tiene piezas fuera de pantalla—, que es lo
 * que se puede probar sin montar el árbol.
 */

const pieza = (id: string, sistema: string, region: string): PiezaDelAtlas =>
  ({ id, nombre: `Pieza ${id}`, fma: id, sistema, region, origenRegion: 'fma' }) as unknown as PiezaDelAtlas

const CATALOGO = {
  version: 'prueba',
  fuente: '',
  licencia: '',
  sujeto: '',
  triangulos: 0,
  sistemas: [
    { id: 'musculos', nombre: 'Músculos', color: '#a33' },
    { id: 'esqueleto', nombre: 'Esqueleto', color: '#999' },
  ],
  regiones: [
    { id: 'mano', nombre: 'Mano' },
    { id: 'pie', nombre: 'Pie' },
  ],
  paquetes: [],
  piezas: [
    pieza('m1', 'musculos', 'mano'),
    pieza('m2', 'musculos', 'mano'),
    pieza('m3', 'musculos', 'pie'),
    pieza('h1', 'esqueleto', 'mano'),
    pieza('h2', 'esqueleto', 'pie'),
  ],
} as unknown as CatalogoDelAtlas

describe('catalogoEnPantalla', () => {
  it('devuelve el mismo catálogo si todo está encendido', () => {
    const todas = new Set(CATALOGO.piezas.map((p) => p.id))
    // Por identidad: el árbol memoriza lo que arma sobre él.
    expect(catalogoEnPantalla(CATALOGO, todas)).toBe(CATALOGO)
  })

  it('deja solo las piezas encendidas', () => {
    const reducido = catalogoEnPantalla(CATALOGO, new Set(['m1', 'h1']))
    expect(reducido.piezas.map((p) => p.id)).toEqual(['m1', 'h1'])
  })

  it('no toca el resto del catálogo', () => {
    const reducido = catalogoEnPantalla(CATALOGO, new Set(['m1']))
    expect(reducido.sistemas).toBe(CATALOGO.sistemas)
    expect(reducido.regiones).toBe(CATALOGO.regiones)
    expect(reducido.version).toBe(CATALOGO.version)
  })

  it('con la mano sola, el grupo «Músculos» no tiene nada fuera de pantalla que encender', () => {
    const mano = new Set(['m1', 'm2', 'h1'])
    const arbol = armarArbol(catalogoEnPantalla(CATALOGO, mano), 'sistema')
    const musculos = arbol.find((g) => g.id === 'musculos')
    // m3, el músculo del pie, ya no cuenta: pulsar la casilla del grupo no
    // puede encenderlo.
    expect(musculos?.total).toBe(2)
    expect(musculos?.ramas.flatMap((r) => r.piezas.map((p) => p.id)).sort()).toEqual(['m1', 'm2'])
  })

  it('los grupos que se quedan sin piezas desaparecen de la lista', () => {
    const arbol = armarArbol(catalogoEnPantalla(CATALOGO, new Set(['h1'])), 'sistema')
    expect(arbol.map((g) => g.id)).toEqual(['esqueleto'])
  })

  it('sin nada encendido la lista queda vacía', () => {
    expect(catalogoEnPantalla(CATALOGO, new Set()).piezas).toEqual([])
  })
})
