import { describe, it, expect } from 'vitest'
import {
  aRenglones,
  desdeLexical,
  desdeRenglones,
  desdeTextoLlano,
  estaVacio,
  haciaLexical,
  textoPlano,
  type Parrafo,
} from '@/lib/textoRico'

/**
 * El contenido rico se guarda en el formato de Lexical, que ya lee el
 * renderizador público. Estas funciones son el único puente entre ese formato y
 * el editor del panel: si se rompen, el contenido escrito deja de verse.
 */

const raiz = (hijos: unknown[]) => ({ root: { type: 'root', children: hijos } })

const parrafoLexical = (texto: string, formato = 0) => ({
  type: 'paragraph',
  children: [{ type: 'text', text: texto, format: formato }],
})

describe('lectura del formato de Lexical', () => {
  it('lee un párrafo llano', () => {
    expect(desdeLexical(raiz([parrafoLexical('Fractura de fémur')]))).toEqual([
      { tipo: 'parrafo', fragmentos: [{ texto: 'Fractura de fémur' }] },
    ])
  })

  it('lee la negrita y la cursiva de la máscara de bits', () => {
    const [parrafo] = desdeLexical(
      raiz([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'negrita', format: 1 },
            { type: 'text', text: 'cursiva', format: 2 },
            { type: 'text', text: 'ambas', format: 3 },
          ],
        },
      ]),
    )
    expect(parrafo).toEqual({
      tipo: 'parrafo',
      fragmentos: [
        { texto: 'negrita', negrita: true },
        { texto: 'cursiva', cursiva: true },
        { texto: 'ambas', negrita: true, cursiva: true },
      ],
    })
  })

  it('lee los encabezados que el editor sabe representar', () => {
    const leidos = desdeLexical(
      raiz([
        { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Dos' }] },
        { type: 'heading', tag: 'h3', children: [{ type: 'text', text: 'Tres' }] },
      ]),
    )
    expect(leidos.map((p) => p.tipo)).toEqual(['h2', 'h3'])
  })

  it('trata como párrafo un encabezado de nivel que el editor no ofrece', () => {
    const [parrafo] = desdeLexical(
      raiz([{ type: 'heading', tag: 'h1', children: [{ type: 'text', text: 'Uno' }] }]),
    )
    expect(parrafo.tipo).toBe('parrafo')
  })

  it('lee una lista con sus puntos', () => {
    const [lista] = desdeLexical(
      raiz([
        {
          type: 'list',
          listType: 'bullet',
          children: [
            { type: 'listitem', children: [{ type: 'text', text: 'uno' }] },
            { type: 'listitem', children: [{ type: 'text', text: 'dos' }] },
          ],
        },
      ]),
    )
    expect(lista).toEqual({
      tipo: 'vinetas',
      puntos: [[{ texto: 'uno' }], [{ texto: 'dos' }]],
    })
  })

  it('conserva el texto de un nodo que no sabe representar, como un enlace', () => {
    const [parrafo] = desdeLexical(
      raiz([
        {
          type: 'paragraph',
          children: [
            { type: 'link', children: [{ type: 'text', text: 'ver la guía' }] },
          ],
        },
      ]),
    )
    expect(textoPlano(haciaLexical([parrafo]))).toBe('ver la guía')
  })

  it('no revienta con contenido nulo, vacío o inesperado', () => {
    for (const valor of [null, undefined, {}, { root: {} }, 'texto', 42]) {
      expect(() => desdeLexical(valor)).not.toThrow()
      expect(desdeLexical(valor)).toEqual([])
    }
  })
})

describe('escritura del formato de Lexical', () => {
  it('un contenido vacío sale con un párrafo, que es lo que Lexical espera', () => {
    const arbol = haciaLexical([]) as { root: { children: unknown[] } }
    expect(arbol.root.children).toHaveLength(1)
    expect((arbol.root.children[0] as { type: string }).type).toBe('paragraph')
  })

  it('escribe la negrita como el bit que corresponde', () => {
    const arbol = haciaLexical([
      { tipo: 'parrafo', fragmentos: [{ texto: 'a', negrita: true }] },
    ]) as { root: { children: { children: { format: number }[] }[] } }
    expect(arbol.root.children[0].children[0].format).toBe(1)
  })

  it('una lista se escribe con su etiqueta y su tipo', () => {
    const arbol = haciaLexical([
      { tipo: 'numerada', puntos: [[{ texto: 'uno' }]] },
    ]) as { root: { children: { tag: string; listType: string }[] } }
    expect(arbol.root.children[0].tag).toBe('ol')
    expect(arbol.root.children[0].listType).toBe('number')
  })

  it('el viaje de ida y vuelta no pierde nada', () => {
    const original: Parrafo[] = [
      { tipo: 'h2', fragmentos: [{ texto: 'Manejo' }] },
      {
        tipo: 'parrafo',
        fragmentos: [
          { texto: 'La reducción es ' },
          { texto: 'urgente', negrita: true },
          { texto: ' en la luxación.' },
        ],
      },
      { tipo: 'vinetas', puntos: [[{ texto: 'primero' }], [{ texto: 'después' }]] },
    ]
    expect(desdeLexical(haciaLexical(original))).toEqual(original)
  })
})

describe('renglones del editor', () => {
  it('una lista se abre en un renglón por punto', () => {
    const renglones = aRenglones([{ tipo: 'vinetas', puntos: [[{ texto: 'a' }], [{ texto: 'b' }]] }])
    expect(renglones).toEqual([
      { tipo: 'vinetas', fragmentos: [{ texto: 'a' }] },
      { tipo: 'vinetas', fragmentos: [{ texto: 'b' }] },
    ])
  })

  it('los renglones seguidos del mismo tipo se funden en una sola lista', () => {
    const parrafos = desdeRenglones([
      { tipo: 'vinetas', fragmentos: [{ texto: 'a' }] },
      { tipo: 'vinetas', fragmentos: [{ texto: 'b' }] },
      { tipo: 'parrafo', fragmentos: [{ texto: 'aparte' }] },
      { tipo: 'vinetas', fragmentos: [{ texto: 'c' }] },
    ])
    expect(parrafos).toHaveLength(3)
    expect(parrafos[0]).toEqual({ tipo: 'vinetas', puntos: [[{ texto: 'a' }], [{ texto: 'b' }]] })
    expect(parrafos[2]).toEqual({ tipo: 'vinetas', puntos: [[{ texto: 'c' }]] })
  })

  it('una lista con viñetas y otra numerada no se mezclan', () => {
    const parrafos = desdeRenglones([
      { tipo: 'vinetas', fragmentos: [{ texto: 'a' }] },
      { tipo: 'numerada', fragmentos: [{ texto: 'b' }] },
    ])
    expect(parrafos.map((p) => p.tipo)).toEqual(['vinetas', 'numerada'])
  })

  it('renglones y párrafos son inversos entre sí', () => {
    const parrafos: Parrafo[] = [
      { tipo: 'parrafo', fragmentos: [{ texto: 'uno' }] },
      { tipo: 'vinetas', puntos: [[{ texto: 'a' }], [{ texto: 'b' }]] },
    ]
    expect(desdeRenglones(aRenglones(parrafos))).toEqual(parrafos)
  })
})

describe('utilidades', () => {
  it('el texto llano sirve para resumir un bloque', () => {
    const arbol = haciaLexical([
      { tipo: 'h2', fragmentos: [{ texto: 'Manejo' }] },
      { tipo: 'vinetas', puntos: [[{ texto: 'uno' }], [{ texto: 'dos' }]] },
    ])
    expect(textoPlano(arbol)).toBe('Manejo uno · dos')
  })

  it('un contenido con solo un párrafo en blanco está vacío', () => {
    expect(estaVacio(haciaLexical([]))).toBe(true)
    expect(estaVacio(haciaLexical([{ tipo: 'parrafo', fragmentos: [{ texto: '   ' }] }]))).toBe(true)
    expect(estaVacio(haciaLexical([{ tipo: 'parrafo', fragmentos: [{ texto: 'algo' }] }]))).toBe(
      false,
    )
  })

  it('al pegar texto llano, una línea en blanco separa párrafos', () => {
    expect(desdeTextoLlano('uno\n\ndos')).toEqual([
      { tipo: 'parrafo', fragmentos: [{ texto: 'uno' }] },
      { tipo: 'parrafo', fragmentos: [{ texto: 'dos' }] },
    ])
  })
})
