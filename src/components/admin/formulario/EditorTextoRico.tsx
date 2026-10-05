'use client'

import { useEffect, useId, useReducer, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as IconoSubrayado,
  Undo2,
} from 'lucide-react'
import { useEditor, EditorContent, Extension, type Content, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Link } from '@tiptap/extension-link'
import { TextAlign } from '@tiptap/extension-text-align'
import { lexicalATipTap, tipTapALexical } from '@/lib/textoRico'

/**
 * Editor de texto con formato.
 *
 * Es TipTap, el mismo editor que ya se usa en la página de cursos, para que
 * escribir aquí se sienta igual que allá y no haya que aprender dos cosas.
 *
 * Lo que cambia respecto de allá es qué se guarda: aquí no sale HTML sino el
 * árbol de Lexical, que es lo que el renderizador público sabe pintar con
 * componentes propios y sin `dangerouslySetInnerHTML`. La conversión en las dos
 * direcciones vive en `src/lib/textoRico.ts` y está probada aparte.
 *
 * No hay imagen ni tabla en la barra a propósito: la plataforma ya tiene
 * bloques de Imagen, Video, Tabla de clasificación y Modelo 3D, que se
 * presentan bastante mejor dentro de una ficha que un archivo suelto metido en
 * mitad de un párrafo.
 */

/**
 * El tabulador dentro de una lista no hace nada.
 *
 * `ListItem` de TipTap trae `Tab: () => sinkListItem(...)`, así que basta pulsar
 * el tabulador en un punto para crear una sublista. El modelo de `textoRico.ts`
 * no anida: la conversión la despliega en puntos sueltos y el autor ve
 * deshacerse al recargar la jerarquía que acababa de escribir —y antes de
 * arreglar la conversión, directamente perdía el texto—. Mientras el modelo sea
 * plano, es preferible que la tecla no prometa lo que no se puede guardar.
 *
 * Solo se traga la pulsación dentro de una lista. Fuera devuelve `false` para
 * que el tabulador siga sacando el foco del editor, que es como se sale de él
 * sin ratón.
 *
 * La prioridad tiene que estar por encima de la de `ListItem` y `ListKeymap`
 * (100, la de siempre): TipTap ordena los atajos por prioridad y atiende la
 * tecla el primero que la reclame.
 */
const SinSublistas = Extension.create({
  name: 'sinSublistas',
  priority: 1000,
  addKeyboardShortcuts() {
    const dentroDeLista = () => this.editor.isActive('listItem')
    return { Tab: dentroDeLista, 'Shift-Tab': dentroDeLista }
  },
})

/**
 * Los atributos del área editable, con su nombre accesible.
 *
 * TipTap le pone `role="textbox"` al `div contenteditable` y nada más, así que
 * sin esto el lector de pantalla entra en «cuadro de edición» sin decir de qué
 * campo. El rótulo del campo lo pinta `Campos.tsx`; aquí solo se cita su `id`.
 * Nombrar el grupo que envuelve al editor, que es lo que se hizo primero, no
 * alcanza: el grupo no recibe el foco, y lo que se anuncia al tabular es el
 * elemento enfocado.
 *
 * Los dos `id` se añaden solo si llegan, y eso no es cortesía: ProseMirror
 * convierte cada atributo con `String()` (`computeDocDeco`, en
 * `prosemirror-view`), de modo que un `undefined` acaba escrito como
 * `aria-describedby="undefined"`, que apunta a un elemento que no existe y es
 * justo el defecto que se viene a cerrar.
 *
 * `aria-multiline` porque es verdad —Intro parte el párrafo, no envía nada— y
 * es lo que hace que el lector lo anuncie como un área de varias líneas y no
 * como una casilla de una sola.
 */
export function atributosDelArea(
  idEtiqueta: string | undefined,
  idAyuda: string | undefined,
): Record<string, string> {
  return {
    class: 'rte-contenido',
    'aria-multiline': 'true',
    ...(idEtiqueta ? { 'aria-labelledby': idEtiqueta } : {}),
    ...(idAyuda ? { 'aria-describedby': idAyuda } : {}),
  }
}

export function EditorTextoRico({
  valor,
  alCambiar,
  idEtiqueta,
  idAyuda,
}: {
  valor: unknown
  alCambiar: (nuevo: unknown) => void
  /** El `id` del rótulo del campo. Obligatorio: sin él, el área no tiene nombre. */
  idEtiqueta: string
  /** El `id` de la ayuda del campo, si la tiene. */
  idAyuda?: string
}) {
  // Refresca la barra cuando cambia la selección: sin esto, los botones no se
  // encienden al poner el cursor sobre un texto que ya tiene formato.
  const [, refrescar] = useReducer((n: number) => n + 1, 0)

  // La función del padre cambia de identidad en cada render; guardarla en una
  // referencia evita recrear el editor y perder el cursor a cada tecla.
  const alCambiarRef = useRef(alCambiar)
  useEffect(() => {
    alCambiarRef.current = alCambiar
  }, [alCambiar])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        // El h1 se reserva para el título de la página; dentro del contenido la
        // jerarquía empieza en h2 (decisión del editor clínico, D-011).
        heading: { levels: [2, 3, 4] },
        horizontalRule: false,
        codeBlock: false,
        // `code` es una extensión aparte de `codeBlock`, y viene encendida con
        // su propio atajo (Ctrl+E) y su regla de entrada por acentos graves: se
        // activaba sin ningún botón en la barra. La conversión no sabe guardar
        // esa marca, así que el autor escribía `AO 31-A2` entre acentos, los
        // veía desaparecer al aplicarse el monoespaciado y al recargar se
        // encontraba el texto corrido, sin el destaque y sin los acentos.
        code: false,
      }),
      SinSublistas,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: lexicalATipTap(valor) as Content,
    editorProps: {
      attributes: atributosDelArea(idEtiqueta, idAyuda),
      // Lo que se pega viene de Word o de un PDF y trae fuentes, colores y
      // tamaños que no pintan nada aquí: el aspecto vive en el código y no en
      // lo que el autor traiga pegado (D-011). TipTap ya limpia lo que no
      // entiende; esto además descarta el marcado que sí entendería pero que
      // la plataforma no ofrece.
      transformPastedHTML: (html) =>
        html
          .replace(/<(img|table|thead|tbody|tr|th|td|figure|figcaption)[^>]*>/gi, '')
          .replace(/<\/(img|table|thead|tbody|tr|th|td|figure|figcaption)>/gi, ''),
    },
    onUpdate: ({ editor }) => {
      alCambiarRef.current(tipTapALexical(editor.getJSON()))
    },
    onSelectionUpdate: () => refrescar(),
    onTransaction: () => refrescar(),
  })

  return (
    <div className="rte">
      {editor ? <Barra editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function Boton({
  alPulsar,
  activo,
  deshabilitado,
  titulo,
  children,
}: {
  alPulsar: () => void
  activo?: boolean
  deshabilitado?: boolean
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="rte-boton"
      data-activo={activo ? 'true' : undefined}
      disabled={deshabilitado}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      // Sin esto se pierde la selección del editor al pulsar, y el formato se
      // aplicaría a un cursor que ya no está donde estaba.
      onMouseDown={(e) => e.preventDefault()}
      onClick={alPulsar}
    >
      {children}
    </button>
  )
}

const Separador = () => <span className="rte-separador" aria-hidden="true" />

/** Los iconos de la barra: 16 px, como el resto del panel. */
const T = 16

function Barra({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus()

  /**
   * El enlace se escribe en una casilla bajo la barra y no en `window.prompt`.
   *
   * El `prompt` del navegador era una caja gris con el dominio por título,
   * sin forma de quitar el enlace salvo vaciarla —cosa que solo decía el texto
   * de la pregunta— y que en Safari de iPad salía detrás del teclado. La
   * casilla vive dentro de la barra fija, así que no se pierde de vista al
   * escribir abajo en un texto largo.
   *
   * Pasar el foco a la casilla no pierde la selección del texto: ProseMirror la
   * guarda en su estado aunque el área deje de tener el foco, y `focus()` en la
   * cadena la devuelve antes de aplicar el enlace.
   */
  const [enlace, setEnlace] = useState<string | null>(null)
  const idEnlace = useId()
  const casilla = useRef<HTMLInputElement>(null)
  // Solo al abrir, y por eso depende de `abierta` y no de `enlace`: con el
  // texto en las dependencias, cada tecla volvería a enfocar la casilla.
  const abierta = enlace !== null
  useEffect(() => {
    if (abierta) casilla.current?.focus()
  }, [abierta])

  const abrirEnlace = () => {
    const actual = editor.getAttributes('link').href as string | undefined
    setEnlace(actual ?? 'https://')
  }
  const cerrarEnlace = () => {
    setEnlace(null)
    editor.commands.focus()
  }
  const aplicarEnlace = () => {
    const url = (enlace ?? '').trim()
    if (url === '' || url === 'https://') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url }).run()
    setEnlace(null)
  }
  const quitarEnlace = () => {
    c().extendMarkRange('link').unsetLink().run()
    setEnlace(null)
  }

  return (
    <div className="rte-barra-contenedor">
      <div className="rte-barra" role="toolbar" aria-label="Formato del texto">
        <Boton titulo="Deshacer" alPulsar={() => c().undo().run()} deshabilitado={!editor.can().undo()}>
          <Undo2 aria-hidden size={T} />
        </Boton>
        <Boton titulo="Rehacer" alPulsar={() => c().redo().run()} deshabilitado={!editor.can().redo()}>
          <Redo2 aria-hidden size={T} />
        </Boton>
        <Separador />

        <Boton titulo="Negrita" activo={editor.isActive('bold')} alPulsar={() => c().toggleBold().run()}>
          <Bold aria-hidden size={T} />
        </Boton>
        <Boton titulo="Cursiva" activo={editor.isActive('italic')} alPulsar={() => c().toggleItalic().run()}>
          <Italic aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Subrayado"
          activo={editor.isActive('underline')}
          alPulsar={() => c().toggleUnderline().run()}
        >
          <IconoSubrayado aria-hidden size={T} />
        </Boton>
        <Boton titulo="Tachado" activo={editor.isActive('strike')} alPulsar={() => c().toggleStrike().run()}>
          <Strikethrough aria-hidden size={T} />
        </Boton>
        <Separador />

        {/* Los rótulos dicen H1, H2 y H3 aunque guarden h2, h3 y h4: el h1 es el
            título de la página (D-011) y para quien escribe esto es el primer
            nivel de su texto. Los iconos de lucide llevan el número del
            elemento, así que se pinta el rótulo y no el icono. */}
        <Boton
          titulo="Título"
          activo={editor.isActive('heading', { level: 2 })}
          alPulsar={() => c().toggleHeading({ level: 2 }).run()}
        >
          <span className="rte-rotulo">H1</span>
        </Boton>
        <Boton
          titulo="Subtítulo"
          activo={editor.isActive('heading', { level: 3 })}
          alPulsar={() => c().toggleHeading({ level: 3 }).run()}
        >
          <span className="rte-rotulo">H2</span>
        </Boton>
        <Boton
          titulo="Encabezado menor"
          activo={editor.isActive('heading', { level: 4 })}
          alPulsar={() => c().toggleHeading({ level: 4 }).run()}
        >
          <span className="rte-rotulo">H3</span>
        </Boton>
        <Separador />

        <Boton
          titulo="Viñetas"
          activo={editor.isActive('bulletList')}
          alPulsar={() => c().toggleBulletList().run()}
        >
          <List aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Lista numerada"
          activo={editor.isActive('orderedList')}
          alPulsar={() => c().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Cita"
          activo={editor.isActive('blockquote')}
          alPulsar={() => c().toggleBlockquote().run()}
        >
          <Quote aria-hidden size={T} />
        </Boton>
        <Separador />

        <Boton
          titulo="Alinear a la izquierda"
          activo={editor.isActive({ textAlign: 'left' })}
          alPulsar={() => c().setTextAlign('left').run()}
        >
          <AlignLeft aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Centrar"
          activo={editor.isActive({ textAlign: 'center' })}
          alPulsar={() => c().setTextAlign('center').run()}
        >
          <AlignCenter aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Alinear a la derecha"
          activo={editor.isActive({ textAlign: 'right' })}
          alPulsar={() => c().setTextAlign('right').run()}
        >
          <AlignRight aria-hidden size={T} />
        </Boton>
        <Boton
          titulo="Justificar"
          activo={editor.isActive({ textAlign: 'justify' })}
          alPulsar={() => c().setTextAlign('justify').run()}
        >
          <AlignJustify aria-hidden size={T} />
        </Boton>
        <Separador />

        <Boton titulo="Insertar enlace" activo={editor.isActive('link') || enlace !== null} alPulsar={abrirEnlace}>
          <Link2 aria-hidden size={T} />
        </Boton>
        <Boton titulo="Quitar formato" alPulsar={() => c().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting aria-hidden size={T} />
        </Boton>
      </div>

      {enlace !== null ? (
        <div
          className="rte-enlace"
          role="group"
          aria-label="Enlace"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              cerrarEnlace()
            }
          }}
        >
          <label htmlFor={idEnlace} className="rte-enlace-etiqueta">
            Dirección del enlace
          </label>
          <input
            ref={casilla}
            id={idEnlace}
            type="url"
            inputMode="url"
            className="campo-control rte-enlace-casilla"
            value={enlace}
            placeholder="https://"
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                aplicarEnlace()
              }
            }}
          />
          <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={aplicarEnlace}>
            Aplicar
          </button>
          {editor.isActive('link') ? (
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={quitarEnlace}>
              Quitar enlace
            </button>
          ) : null}
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={cerrarEnlace}>
            Cancelar
          </button>
        </div>
      ) : null}
    </div>
  )
}
