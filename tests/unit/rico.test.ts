import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  desdeLexical,
  desdeTipTap,
  enlaceSeguro,
  estaVacio,
  haciaLexical,
  haciaTipTap,
  lexicalATipTap,
  textoLlanoALexical,
  tipTapALexical,
  type Parrafo,
} from '@/lib/textoRico'

/**
 * Lo que el residente acaba viendo.
 *
 * `tests/unit/textoRico.test.ts` prueba las conversiones contra su modelo; esto
 * prueba el otro extremo, que es donde se notaron los fallos: el HTML que sale
 * del renderizador público y los viajes de ida y vuelta que en el panel se
 * veían bien y en la ficha publicada no.
 *
 * Las pruebas del renderizador importan `Rico` a mano y no arriba porque el
 * prefijo se lee al cargar el módulo (`PREFIJO`, en `src/lib/rutas.ts`): hay
 * que fijar la variable de entorno antes, y volver a cargar el módulo después.
 */

const raiz = (hijos: unknown[]) => ({ root: { type: 'root', children: hijos } })

const parrafoConEnlace = (url: string) =>
  raiz([
    {
      type: 'paragraph',
      children: [
        {
          type: 'link',
          fields: { linkType: 'custom', url },
          children: [{ type: 'text', text: 'la guía', format: 0 }],
        },
      ],
    },
  ])

async function pintar(valor: unknown, prefijo = ''): Promise<string> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', prefijo)
  const { Rico } = await import('@/components/Rico')
  return renderToStaticMarkup(createElement(Rico, { valor }))
}

afterEach(() => {
  vi.unstubAllEnvs()
})

// ------------------------------------------------------------ renderizador

describe('enlaces del contenido, ya pintados', () => {
  it('el enlace interno sale con el prefijo delante', async () => {
    // Next.js no prefija un `<a>` escrito a mano. Sin `ruta()`, esto salía como
    // `/biblioteca/12` y en el servidor lo atendía otra página del dominio.
    const html = await pintar(parrafoConEnlace('/biblioteca/12'), '/traumahub')
    expect(html).toContain('href="/traumahub/biblioteca/12"')
  })

  it('el enlace interno no abre pestaña nueva', async () => {
    const html = await pintar(parrafoConEnlace('/biblioteca/12'), '/traumahub')
    expect(html).not.toContain('target="_blank"')
  })

  it('sin prefijo el enlace interno queda igual que antes', async () => {
    const html = await pintar(parrafoConEnlace('/biblioteca/12'))
    expect(html).toContain('href="/biblioteca/12"')
  })

  it('el enlace externo se pinta entero y en otra pestaña', async () => {
    const html = await pintar(parrafoConEnlace('https://ao.org/guia'), '/traumahub')
    expect(html).toContain('href="https://ao.org/guia"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('un enlace que ejecuta código no llega al HTML, ni desactivado', async () => {
    // La API REST de Payload sigue aceptando escritura sin pasar por la
    // conversión del panel, así que este árbol puede estar en la base. Lo que
    // hoy lo desactivaría es React, no esta casa: aquí se comprueba que la
    // comprobación es nuestra.
    const html = await pintar(parrafoConEnlace('javascript:alert(1)'), '/traumahub')
    expect(html).not.toContain('javascript')
    expect(html).not.toContain('<a')
    // El texto del enlace se conserva: se pierde el enlace, no lo escrito.
    expect(html).toContain('la guía')
  })

  it('un esquema que React no filtra tampoco se pinta', async () => {
    const html = await pintar(parrafoConEnlace('file://servidor-ajeno/recurso'), '/traumahub')
    expect(html).not.toContain('file://')
    expect(html).not.toContain('<a')
  })

  it('el salto de línea guardado se pinta como salto', async () => {
    const html = await pintar(textoLlanoALexical('Tracción longitudinal\nFlexión a 90°'))
    expect(html).toContain('<br')
  })
})

// -------------------------------------------------------- listas anidadas

describe('listas anidadas', () => {
  const listaConSublista = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Reducir' }] },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'con tracción' }] },
                    ],
                  },
                  {
                    type: 'listItem',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'bajo anestesia' }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fijar' }] }],
          },
        ],
      },
    ],
  }

  it('la sublista del editor se despliega en puntos propios, sin pegar palabras', () => {
    // Antes salía un único punto «Reducircon traccionbajo anestesia», y el
    // autor no tenía cómo recuperar lo escrito.
    expect(desdeTipTap(listaConSublista)).toEqual([
      {
        tipo: 'vinetas',
        puntos: [
          [{ texto: 'Reducir' }],
          [{ texto: 'con tracción' }],
          [{ texto: 'bajo anestesia' }],
          [{ texto: 'Fijar' }],
        ],
      },
    ])
  })

  it('lo mismo al abrir una lista anidada que ya está en la base', () => {
    const guardada = raiz([
      {
        type: 'list',
        listType: 'bullet',
        children: [
          {
            type: 'listitem',
            children: [
              { type: 'text', text: 'Reducir', format: 0 },
              {
                type: 'list',
                listType: 'bullet',
                children: [
                  { type: 'listitem', children: [{ type: 'text', text: 'con tracción', format: 0 }] },
                ],
              },
            ],
          },
        ],
      },
    ])
    expect(desdeLexical(guardada)).toEqual([
      { tipo: 'vinetas', puntos: [[{ texto: 'Reducir' }], [{ texto: 'con tracción' }]] },
    ])
  })

  it('dos párrafos dentro de una cita no quedan pegados', () => {
    const [cita] = desdeTipTap({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Primero' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'no dañar' }] },
          ],
        },
      ],
    })
    expect(cita).toEqual({ tipo: 'cita', fragmentos: [{ texto: 'Primero\nno dañar' }] })
  })

  it('una lista de un solo nivel sigue exactamente igual', () => {
    const plana: Parrafo[] = [
      { tipo: 'vinetas', puntos: [[{ texto: 'uno' }], [{ texto: 'dos' }]] },
    ]
    expect(desdeTipTap(haciaTipTap(plana))).toEqual(plana)
    expect(desdeLexical(haciaLexical(plana))).toEqual(plana)
  })
})

// ------------------------------------------------------- saltos y formato

describe('lo que sobrevive al guardado', () => {
  it('el salto simple se guarda como nodo, no dentro del texto', () => {
    // Un `\n` dentro de un nodo `text` lo colapsa el HTML y el párrafo sale
    // corrido; el editor lo reconstruía igual, así que desde el panel no se
    // veía nada raro.
    const guardado = JSON.stringify(textoLlanoALexical('una\notra'))
    expect(guardado).toContain('"linebreak"')
    expect(guardado).not.toContain('una\\notra')
  })

  it('el salto sigue volviendo al modelo como un salto', () => {
    const original: Parrafo[] = [{ tipo: 'parrafo', fragmentos: [{ texto: 'una\notra' }] }]
    expect(desdeLexical(haciaLexical(original))).toEqual(original)
  })

  it('la alineación de una cita no se endereza sola al pasar por el editor', () => {
    // `TextAlign` la deja en el párrafo interior del `blockquote`, y leerla solo
    // en el nodo de primer nivel la perdía en cada tecla del campo.
    const original: Parrafo[] = [
      { tipo: 'cita', alineacion: 'centro', fragmentos: [{ texto: 'Estabilidad relativa.' }] },
    ]
    expect(desdeLexical(tipTapALexical(lexicalATipTap(haciaLexical(original))))).toEqual(original)
  })

  it('un enlace interno no se guarda para abrirse en otra pestaña', () => {
    const arbol = haciaLexical([
      { tipo: 'parrafo', fragmentos: [{ texto: 'ver', enlace: '/biblioteca/12' }] },
    ]) as { root: { children: { children: { fields?: { newTab?: boolean } }[] }[] } }
    expect(arbol.root.children[0].children[0].fields?.newTab).toBe(false)
  })
})

// ------------------------------------------------------------- direcciones

describe('direcciones disfrazadas', () => {
  it('rechaza la ruta interna con un carácter de control en medio', () => {
    // El navegador borra tabulador, salto y retorno al analizar la dirección,
    // así que esto terminaba resolviéndose como `//evil.example.com`.
    for (const url of ['/\t/evil.example.com', '/\n/evil.example.com', '/\r/evil.example.com']) {
      expect(enlaceSeguro(url), JSON.stringify(url)).toBeUndefined()
    }
  })

  it('las rutas internas de siempre siguen valiendo', () => {
    expect(enlaceSeguro('/biblioteca/12')).toBe('/biblioteca/12')
    expect(enlaceSeguro('https://ao.org/guia')).toBe('https://ao.org/guia')
  })
})

// ------------------------------------------------------------ campo vacío

describe('cuándo un campo rico está vacío', () => {
  it('un contenido cuyo único nodo es una imagen no está vacío', () => {
    // `desdeLexical` no sabe leer un `upload`, así que medirlo por su texto
    // llano daba «vacío» y la radiografía desaparecía entera de la ficha.
    expect(estaVacio(raiz([{ type: 'upload' }]))).toBe(false)
    expect(estaVacio(raiz([{ type: 'horizontalrule' }]))).toBe(false)
  })

  it('un párrafo en blanco sigue estando vacío', () => {
    expect(estaVacio(haciaLexical([]))).toBe(true)
    expect(estaVacio(haciaLexical([{ tipo: 'parrafo', fragmentos: [{ texto: '   ' }] }]))).toBe(true)
    expect(estaVacio(null)).toBe(true)
    expect(estaVacio(haciaLexical([{ tipo: 'parrafo', fragmentos: [{ texto: 'algo' }] }]))).toBe(
      false,
    )
  })
})
