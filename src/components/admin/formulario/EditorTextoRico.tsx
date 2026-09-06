'use client'

import { useEffect, useReducer, useRef } from 'react'
import { useEditor, EditorContent, type Content, type Editor } from '@tiptap/react'
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

export function EditorTextoRico({
  valor,
  alCambiar,
}: {
  valor: unknown
  alCambiar: (nuevo: unknown) => void
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
      }),
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
      attributes: { class: 'rte-contenido' },
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

function Barra({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus()

  const ponerEnlace = () => {
    const actual = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Dirección del enlace (vacío para quitarlo):', actual ?? 'https://')
    if (url === null) return
    if (url.trim() === '') {
      c().extendMarkRange('link').unsetLink().run()
      return
    }
    c().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="rte-barra" role="toolbar" aria-label="Formato del texto">
      <Boton titulo="Deshacer" alPulsar={() => c().undo().run()} deshabilitado={!editor.can().undo()}>
        ↶
      </Boton>
      <Boton titulo="Rehacer" alPulsar={() => c().redo().run()} deshabilitado={!editor.can().redo()}>
        ↷
      </Boton>
      <Separador />

      <Boton titulo="Negrita" activo={editor.isActive('bold')} alPulsar={() => c().toggleBold().run()}>
        <b>B</b>
      </Boton>
      <Boton titulo="Cursiva" activo={editor.isActive('italic')} alPulsar={() => c().toggleItalic().run()}>
        <i>I</i>
      </Boton>
      <Boton
        titulo="Subrayado"
        activo={editor.isActive('underline')}
        alPulsar={() => c().toggleUnderline().run()}
      >
        <u>U</u>
      </Boton>
      <Boton titulo="Tachado" activo={editor.isActive('strike')} alPulsar={() => c().toggleStrike().run()}>
        <s>S</s>
      </Boton>
      <Separador />

      <Boton
        titulo="Título"
        activo={editor.isActive('heading', { level: 2 })}
        alPulsar={() => c().toggleHeading({ level: 2 }).run()}
      >
        H1
      </Boton>
      <Boton
        titulo="Subtítulo"
        activo={editor.isActive('heading', { level: 3 })}
        alPulsar={() => c().toggleHeading({ level: 3 }).run()}
      >
        H2
      </Boton>
      <Boton
        titulo="Encabezado menor"
        activo={editor.isActive('heading', { level: 4 })}
        alPulsar={() => c().toggleHeading({ level: 4 }).run()}
      >
        H3
      </Boton>
      <Separador />

      <Boton
        titulo="Viñetas"
        activo={editor.isActive('bulletList')}
        alPulsar={() => c().toggleBulletList().run()}
      >
        • Lista
      </Boton>
      <Boton
        titulo="Lista numerada"
        activo={editor.isActive('orderedList')}
        alPulsar={() => c().toggleOrderedList().run()}
      >
        1. Lista
      </Boton>
      <Boton
        titulo="Cita"
        activo={editor.isActive('blockquote')}
        alPulsar={() => c().toggleBlockquote().run()}
      >
        ❝
      </Boton>
      <Separador />

      <Boton
        titulo="Alinear a la izquierda"
        activo={editor.isActive({ textAlign: 'left' })}
        alPulsar={() => c().setTextAlign('left').run()}
      >
        <IconoAlinear variante="left" />
      </Boton>
      <Boton
        titulo="Centrar"
        activo={editor.isActive({ textAlign: 'center' })}
        alPulsar={() => c().setTextAlign('center').run()}
      >
        <IconoAlinear variante="center" />
      </Boton>
      <Boton
        titulo="Alinear a la derecha"
        activo={editor.isActive({ textAlign: 'right' })}
        alPulsar={() => c().setTextAlign('right').run()}
      >
        <IconoAlinear variante="right" />
      </Boton>
      <Boton
        titulo="Justificar"
        activo={editor.isActive({ textAlign: 'justify' })}
        alPulsar={() => c().setTextAlign('justify').run()}
      >
        <IconoAlinear variante="justify" />
      </Boton>
      <Separador />

      <Boton titulo="Insertar enlace" activo={editor.isActive('link')} alPulsar={ponerEnlace}>
        🔗
      </Boton>
      <Boton titulo="Quitar formato" alPulsar={() => c().unsetAllMarks().clearNodes().run()}>
        T✕
      </Boton>
    </div>
  )
}

function IconoAlinear({ variante }: { variante: 'left' | 'center' | 'right' | 'justify' }) {
  const trazos: Record<typeof variante, string[]> = {
    left: ['M2 4h14', 'M2 8h9', 'M2 12h12', 'M2 16h7'],
    center: ['M3 4h12', 'M5 8h8', 'M4 12h10', 'M6 16h6'],
    right: ['M4 4h14', 'M7 8h11', 'M5 12h13', 'M9 16h9'],
    justify: ['M2 4h16', 'M2 8h16', 'M2 12h16', 'M2 16h16'],
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {trazos[variante].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
