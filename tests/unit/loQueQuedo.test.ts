import { describe, it, expect } from 'vitest'
import {
  ampliarConjunto,
  catalogoDeLoQueQuedo,
  conjuntoConLoEncendido,
} from '@/atlas/loQueQuedo'
import { armarArbol } from '@/atlas/catalogo'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'

/**
 * La lista del taller se queda con lo que quedó tras recortar.
 *
 * Dos pedidos seguidos del dueño: primero, que el grupo «Músculos» no encienda
 * los músculos de todo el cuerpo cuando se trabaja con la mano; después, que lo
 * que se apaga siga en la lista para poder volver a encenderlo. Aquí se prueba
 * lo que se puede probar sin montar el árbol: de qué piezas se arma la lista.
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

describe('catalogoDeLoQueQuedo', () => {
  it('sin conjunto devuelve el mismo catálogo: no hay nada que acotar', () => {
    expect(catalogoDeLoQueQuedo(CATALOGO, null)).toBe(CATALOGO)
  })

  it('con todas las piezas devuelve el mismo catálogo, por identidad', () => {
    const todas = new Set(CATALOGO.piezas.map((p) => p.id))
    expect(catalogoDeLoQueQuedo(CATALOGO, todas)).toBe(CATALOGO)
  })

  it('deja solo las piezas del conjunto, encendidas o no', () => {
    // El conjunto no sabe qué está encendido: m2 puede estar apagada y seguir
    // en la lista, que es lo que permite volver a encenderla.
    const reducido = catalogoDeLoQueQuedo(CATALOGO, new Set(['m1', 'm2', 'h1']))
    expect(reducido.piezas.map((p) => p.id)).toEqual(['m1', 'm2', 'h1'])
  })

  it('no toca el resto del catálogo', () => {
    const reducido = catalogoDeLoQueQuedo(CATALOGO, new Set(['m1']))
    expect(reducido.sistemas).toBe(CATALOGO.sistemas)
    expect(reducido.regiones).toBe(CATALOGO.regiones)
    expect(reducido.version).toBe(CATALOGO.version)
  })

  it('con la mano, el grupo «Músculos» no tiene nada fuera de ella que encender', () => {
    const mano = new Set(['m1', 'm2', 'h1'])
    const arbol = armarArbol(catalogoDeLoQueQuedo(CATALOGO, mano), 'sistema')
    const musculos = arbol.find((g) => g.id === 'musculos')
    // m3, el músculo del pie, no está en la lista: pulsar la casilla del grupo
    // no puede encenderlo.
    expect(musculos?.total).toBe(2)
    expect(musculos?.ramas.flatMap((r) => r.piezas.map((p) => p.id)).sort()).toEqual(['m1', 'm2'])
  })

  it('los grupos que se quedan sin piezas desaparecen de la lista', () => {
    const arbol = armarArbol(catalogoDeLoQueQuedo(CATALOGO, new Set(['h1'])), 'sistema')
    expect(arbol.map((g) => g.id)).toEqual(['esqueleto'])
  })
})

describe('ampliarConjunto', () => {
  it('sin conjunto sigue sin conjunto: el atlas entero ya lo contiene todo', () => {
    expect(ampliarConjunto(null, ['m3'])).toBeNull()
  })

  it('suma lo que se enciende desde fuera, para que no desaparezca al apagarlo', () => {
    const ampliado = ampliarConjunto(new Set(['m1']), ['m1', 'm3'])
    expect([...(ampliado ?? [])].sort()).toEqual(['m1', 'm3'])
  })

  it('devuelve el mismo conjunto si no hay nada nuevo', () => {
    const conjunto = new Set(['m1', 'm2'])
    expect(ampliarConjunto(conjunto, ['m1'])).toBe(conjunto)
  })

  it('no modifica el conjunto que recibe', () => {
    const conjunto = new Set(['m1'])
    ampliarConjunto(conjunto, ['m3'])
    expect([...conjunto]).toEqual(['m1'])
  })
})

describe('conjuntoConLoEncendido', () => {
  it('lo encendido siempre está en la lista, aunque llegue por otro camino', () => {
    // Abrir una preparación o deshacer cambian las piezas sin pasar por el
    // conjunto: la lista no puede quedarse sin una pieza que se está viendo.
    const lista = conjuntoConLoEncendido(new Set(['m1']), new Set(['m1', 'h2']))
    expect([...(lista ?? [])].sort()).toEqual(['h1', 'h2', 'm1'].filter((id) => id !== 'h1'))
  })

  it('sin conjunto, la lista es el atlas entero', () => {
    expect(conjuntoConLoEncendido(null, new Set(['m1']))).toBeNull()
  })
})
