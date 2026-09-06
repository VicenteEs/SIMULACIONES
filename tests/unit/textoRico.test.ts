import { describe, it, expect } from 'vitest'
import {
  desdeLexical,
  desdeTextoLlano,
  desdeTipTap,
  enlaceSeguro,
  estaVacio,
  haciaLexical,
  haciaTipTap,
  lexicalATipTap,
  textoPlano,
  tipTapALexical,
  type Parrafo,
} from '@/lib/textoRico'

/**
 * Tres formatos y dos traducciones: el árbol de Lexical que se guarda y que lee
 * el renderizador público, el documento de TipTap que edita el panel, y el
 * modelo de en medio. Si estas conversiones se rompen, el contenido escrito
 * deja de verse o deja de poder editarse, así que se prueban de las dos
 * direcciones y, sobre todo, en el viaje de ida y vuelta.
 */

const raizLexical = (hijos: unknown[]) => ({ root: { type: 'root', children: hijos } })

const parrafoLexical = (texto: string, formato = 0) => ({
  type: 'paragraph',
  children: [{ type: 'text', text: texto, format: formato }],
})

// ---------------------------------------------------------------- Lexical

describe('lectura del formato de Lexical', () => {
  it('lee un párrafo llano', () => {
    expect(desdeLexical(raizLexical([parrafoLexical('Fractura de fémur')]))).toEqual([
      { tipo: 'parrafo', fragmentos: [{ texto: 'Fractura de fémur' }] },
    ])
  })

  it('lee los cuatro formatos de la máscara de bits', () => {
    const [parrafo] = desdeLexical(
      raizLexical([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'n', format: 1 },
            { type: 'text', text: 'c', format: 2 },
            { type: 'text', text: 't', format: 4 },
            { type: 'text', text: 's', format: 8 },
            { type: 'text', text: 'todo', format: 15 },
          ],
        },
      ]),
    )
    expect(parrafo).toEqual({
      tipo: 'parrafo',
      fragmentos: [
        { texto: 'n', negrita: true },
        { texto: 'c', cursiva: true },
        { texto: 't', tachado: true },
        { texto: 's', subrayado: true },
        { texto: 'todo', negrita: true, cursiva: true, tachado: true, subrayado: true },
      ],
    })
  })

  it('lee encabezados, cita y listas', () => {
    const leidos = desdeLexical(
      raizLexical([
        { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Dos' }] },
        { type: 'quote', children: [{ type: 'text', text: 'Citado' }] },
        {
          type: 'list',
          listType: 'number',
          children: [{ type: 'listitem', children: [{ type: 'text', text: 'uno' }] }],
        },
      ]),
    )
    expect(leidos.map((p) => p.tipo)).toEqual(['h2', 'cita', 'numerada'])
  })

  it('lee la alineación del bloque', () => {
    const [parrafo] = desdeLexical(
      raizLexical([{ type: 'paragraph', format: 'center', children: [{ type: 'text', text: 'x' }] }]),
    )
    expect(parrafo).toMatchObject({ alineacion: 'centro' })
  })

  it('lee un enlace y lo lleva al fragmento', () => {
    const [parrafo] = desdeLexical(
      raizLexical([
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'ver ' },
            {
              type: 'link',
              fields: { url: 'https://ao.org' },
              children: [{ type: 'text', text: 'la guía' }],
            },
          ],
        },
      ]),
    )
    expect(parrafo).toEqual({
      tipo: 'parrafo',
      fragmentos: [{ texto: 'ver ' }, { texto: 'la guía', enlace: 'https://ao.org' }],
    })
  })

  it('trata como párrafo un encabezado de nivel que el editor no ofrece', () => {
    const [parrafo] = desdeLexical(
      raizLexical([{ type: 'heading', tag: 'h1', children: [{ type: 'text', text: 'Uno' }] }]),
    )
    expect(parrafo.tipo).toBe('parrafo')
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
    const arbol = haciaLexical([]) as { root: { children: { type: string }[] } }
    expect(arbol.root.children).toHaveLength(1)
    expect(arbol.root.children[0].type).toBe('paragraph')
  })

  it('escribe los formatos como los bits que corresponden', () => {
    const arbol = haciaLexical([
      {
        tipo: 'parrafo',
        fragmentos: [{ texto: 'a', negrita: true, cursiva: true, subrayado: true, tachado: true }],
      },
    ]) as { root: { children: { children: { format: number }[] }[] } }
    expect(arbol.root.children[0].children[0].format).toBe(1 | 2 | 4 | 8)
  })

  it('agrupa en un solo nodo los fragmentos seguidos con el mismo enlace', () => {
    const arbol = haciaLexical([
      {
        tipo: 'parrafo',
        fragmentos: [
          { texto: 'la ', enlace: 'https://ao.org' },
          { texto: 'guía', enlace: 'https://ao.org', negrita: true },
          { texto: ' suelta' },
        ],
      },
    ]) as { root: { children: { children: { type: string; children?: unknown[] }[] }[] } }

    const hijos = arbol.root.children[0].children
    expect(hijos).toHaveLength(2)
    expect(hijos[0].type).toBe('link')
    expect(hijos[0].children).toHaveLength(2)
    expect(hijos[1].type).toBe('text')
  })

  it('el viaje de ida y vuelta no pierde nada', () => {
    const original: Parrafo[] = [
      { tipo: 'h2', fragmentos: [{ texto: 'Manejo' }] },
      {
        tipo: 'parrafo',
        alineacion: 'justificado',
        fragmentos: [
          { texto: 'La reducción es ' },
          { texto: 'urgente', negrita: true, subrayado: true },
          { texto: ' en la ' },
          { texto: 'luxación', enlace: 'https://ao.org' },
          { texto: '.' },
        ],
      },
      { tipo: 'cita', fragmentos: [{ texto: 'Primero no dañar.' }] },
      { tipo: 'vinetas', puntos: [[{ texto: 'primero' }], [{ texto: 'después' }]] },
    ]
    expect(desdeLexical(haciaLexical(original))).toEqual(original)
  })
})

// ----------------------------------------------------------------- TipTap

describe('lectura del documento de TipTap', () => {
  it('lee las marcas del editor', () => {
    const parrafos = desdeTipTap({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'n', marks: [{ type: 'bold' }] },
            { type: 'text', text: 's', marks: [{ type: 'underline' }] },
            { type: 'text', text: 't', marks: [{ type: 'strike' }] },
          ],
        },
      ],
    })
    expect(parrafos[0]).toEqual({
      tipo: 'parrafo',
      fragmentos: [
        { texto: 'n', negrita: true },
        { texto: 's', subrayado: true },
        { texto: 't', tachado: true },
      ],
    })
  })

  it('aplana el párrafo que TipTap mete dentro de cada punto de lista', () => {
    const [lista] = desdeTipTap({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }],
            },
          ],
        },
      ],
    })
    expect(lista).toEqual({ tipo: 'vinetas', puntos: [[{ texto: 'uno' }]] })
  })

  it('un encabezado de nivel 1 se guarda como el mayor que ofrece la ficha', () => {
    // El h1 es el título de la página; dentro del contenido no debe repetirse.
    const [parrafo] = desdeTipTap({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A' }] }],
    })
    expect(parrafo.tipo).toBe('h2')
  })

  it('descarta lo que la plataforma no ofrece', () => {
    const parrafos = desdeTipTap({
      type: 'doc',
      content: [
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'queda' }] },
      ],
    })
    expect(parrafos).toHaveLength(1)
  })

  it('no revienta con un documento vacío o de otra forma', () => {
    for (const valor of [null, undefined, {}, { type: 'doc' }, 'texto']) {
      expect(desdeTipTap(valor)).toEqual([])
    }
  })
})

describe('el puente entre el editor y lo que se guarda', () => {
  it('sobrevive al viaje completo Lexical → TipTap → Lexical', () => {
    const original: Parrafo[] = [
      { tipo: 'h3', fragmentos: [{ texto: 'Clasificación' }] },
      {
        tipo: 'parrafo',
        alineacion: 'centro',
        fragmentos: [
          { texto: 'tipo ' },
          { texto: 'A1', negrita: true, cursiva: true },
          { texto: ' — ver ' },
          { texto: 'AO', enlace: 'https://ao.org' },
        ],
      },
      { tipo: 'numerada', puntos: [[{ texto: 'reducir' }], [{ texto: 'fijar' }]] },
      { tipo: 'cita', fragmentos: [{ texto: 'Estabilidad relativa.' }] },
    ]

    const guardado = haciaLexical(original)
    const enElEditor = lexicalATipTap(guardado)
    const devuelta = tipTapALexical(enElEditor)

    expect(desdeLexical(devuelta)).toEqual(original)
  })

  it('el salto de línea dentro de un párrafo sobrevive', () => {
    const original: Parrafo[] = [{ tipo: 'parrafo', fragmentos: [{ texto: 'una\notra' }] }]
    expect(desdeTipTap(haciaTipTap(original))).toEqual(original)
  })

  it('un contenido vacío da un documento con un párrafo, no uno sin nada', () => {
    const documento = haciaTipTap([]) as { content: unknown[] }
    expect(documento.content).toHaveLength(1)
  })
})

// -------------------------------------------------------------- seguridad

describe('direcciones de enlace', () => {
  it('acepta lo que se puede publicar', () => {
    for (const url of [
      'https://ao.org/guia',
      'http://intranet.local',
      'mailto:jefe@hospital.cl',
      'tel:+56912345678',
      '/biblioteca/12',
    ]) {
      expect(enlaceSeguro(url), url).toBe(url)
    }
  })

  it('rechaza los esquemas que ejecutan código', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>',
      'vbscript:msgbox',
      '  javascript:alert(1)  ',
      '//evil.example.com',
    ]) {
      expect(enlaceSeguro(url), url).toBeUndefined()
    }
  })

  it('un enlace peligroso no sobrevive a la conversión', () => {
    const parrafos = desdeTipTap({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'pulse',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(parrafos)).not.toContain('javascript')
    expect(JSON.stringify(haciaLexical(parrafos))).not.toContain('javascript')
  })
})

// ------------------------------------------------------------- utilidades

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

  it('el texto llano de la migración se parte por líneas en blanco', () => {
    expect(desdeTextoLlano('uno\n\ndos')).toEqual([
      { tipo: 'parrafo', fragmentos: [{ texto: 'uno' }] },
      { tipo: 'parrafo', fragmentos: [{ texto: 'dos' }] },
    ])
  })

  it('un salto simple no parte el párrafo: era un salto de línea, no de idea', () => {
    expect(desdeTextoLlano('una\notra')).toEqual([
      { tipo: 'parrafo', fragmentos: [{ texto: 'una\notra' }] },
    ])
  })
})
