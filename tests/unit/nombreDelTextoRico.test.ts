import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atributosDelArea } from '@/components/admin/formulario/EditorTextoRico'

/**
 * El área editable del texto rico, con el nombre de su campo.
 *
 * El rótulo se había arreglado a medias: el `id` existía y lo citaba el grupo
 * que envuelve al editor, pero el grupo no recibe el foco. Lo recibe el
 * `div contenteditable` al que TipTap le pone `role="textbox"`, y ese seguía sin
 * nombre: en un formulario de maniobra, tres editores seguidos se anunciaban
 * igual, «cuadro de edición», sin decir cuál era cuál.
 *
 * Hay dos mitades y las dos se vigilan, porque separadas no falla nada: la
 * función que compone los atributos (se ejercita de verdad) y el cable que le
 * lleva el `id` desde `Campos.tsx` (se lee la fuente: la suite corre en `node`
 * y el formulario no se deja importar).
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const CAMPOS = fuente('src', 'components', 'admin', 'formulario', 'Campos.tsx')
const EDITOR = fuente('src', 'components', 'admin', 'formulario', 'EditorTextoRico.tsx')

/** La rama del campo rico en `ControlDeCampo`, hasta la siguiente. */
const RAMA_RICA = CAMPOS.slice(CAMPOS.indexOf("case 'rico':"), CAMPOS.indexOf("case 'grupo':"))

describe('los atributos del área editable', () => {
  it('la nombran con el rótulo y la describen con la ayuda', () => {
    expect(atributosDelArea(':r1:-etiqueta', ':r1:-ayuda')).toEqual({
      class: 'rte-contenido',
      'aria-multiline': 'true',
      'aria-labelledby': ':r1:-etiqueta',
      'aria-describedby': ':r1:-ayuda',
    })
  })

  it('sin ayuda no escriben un `aria-describedby="undefined"`', () => {
    // ProseMirror pasa cada atributo por `String()`: un `undefined` llegaría al
    // DOM como la palabra, apuntando a un elemento que no existe.
    const atributos = atributosDelArea(':r1:-etiqueta', undefined)
    expect(atributos).not.toHaveProperty('aria-describedby')
    expect(Object.values(atributos)).not.toContain('undefined')
  })

  it('conservan la clase de la hoja, que ProseMirror suma a la suya', () => {
    expect(atributosDelArea('x', undefined).class).toBe('rte-contenido')
  })
})

describe('el cable del rótulo al área', () => {
  it('el editor usa esos atributos, y no los de antes', () => {
    expect(EDITOR).toContain('attributes: atributosDelArea(idEtiqueta, idAyuda)')
    expect(EDITOR).not.toContain("attributes: { class: 'rte-contenido' }")
  })

  it('el campo le pasa el `id` del rótulo que pinta en la misma rama', () => {
    expect(RAMA_RICA).toContain('{rotulo}')
    expect(RAMA_RICA).toContain('idEtiqueta={idEtiqueta}')
    expect(RAMA_RICA).toContain('idAyuda={describe}')
    // Y el rótulo lleva ese `id`: si se separan, el área cita a nadie.
    expect(CAMPOS).toMatch(/const rotulo = \(\s*<span className="campo-etiqueta" id=\{idEtiqueta\}>/)
  })

  it('el grupo sigue nombrado, pero la ayuda solo se oye una vez', () => {
    // El grupo contiene también la barra de formato, y tres barras iguales solo
    // se distinguen por él. La ayuda, en cambio, va en el área: repetida en el
    // grupo se leería dos veces seguidas al entrar.
    expect(RAMA_RICA).toMatch(/role="group" aria-labelledby=\{idEtiqueta\}>/)
    expect(RAMA_RICA).not.toMatch(/role="group"[^>]*aria-describedby/)
  })
})
