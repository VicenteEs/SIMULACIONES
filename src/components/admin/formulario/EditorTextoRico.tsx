'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  aRenglones,
  desdeLexical,
  desdeRenglones,
  haciaLexical,
  renglonNuevo,
  type Fragmento,
  type Renglon,
  type TipoDeParrafo,
} from '@/lib/textoRico'

/**
 * Editor de texto con formato, propio.
 *
 * Cada renglón es un `contenteditable` independiente en lugar de un único
 * campo enorme. Es más código, pero resuelve de una vez los tres problemas que
 * tiene un editor de un solo campo: cambiar el tipo de una línea no obliga a
 * seleccionar nada, React no pelea con el cursor al re-renderizar, y un fallo
 * al leer una línea no arrastra al resto del texto.
 *
 * El contenido se guarda en el formato de Lexical, el mismo que ya usa la
 * plataforma: ver `src/lib/textoRico.ts`.
 */

const TIPOS: { valor: TipoDeParrafo; etiqueta: string; titulo: string }[] = [
  { valor: 'parrafo', etiqueta: '¶', titulo: 'Párrafo' },
  { valor: 'h2', etiqueta: 'T1', titulo: 'Título' },
  { valor: 'h3', etiqueta: 'T2', titulo: 'Subtítulo' },
  { valor: 'h4', etiqueta: 'T3', titulo: 'Encabezado menor' },
  { valor: 'vinetas', etiqueta: '•', titulo: 'Viñeta' },
  { valor: 'numerada', etiqueta: '1.', titulo: 'Lista numerada' },
]

/**
 * Lee un renglón del DOM.
 *
 * Recorre los nodos arrastrando el formato heredado de los ancestros, de modo
 * que `<strong>fractura <em>abierta</em></strong>` sale como dos fragmentos con
 * el formato correcto cada uno.
 */
function leerFragmentos(raiz: HTMLElement): Fragmento[] {
  const fragmentos: Fragmento[] = []

  const recorrer = (nodo: Node, negrita: boolean, cursiva: boolean) => {
    if (nodo.nodeType === Node.TEXT_NODE) {
      const texto = nodo.textContent ?? ''
      if (texto.length === 0) return
      const ultimo = fragmentos[fragmentos.length - 1]
      // Fragmentos contiguos con el mismo formato se funden: el navegador
      // parte el texto en muchos nodos al escribir, y guardarlos por separado
      // llenaría la base de trozos de una letra.
      if (ultimo && Boolean(ultimo.negrita) === negrita && Boolean(ultimo.cursiva) === cursiva) {
        ultimo.texto += texto
      } else {
        fragmentos.push({
          texto,
          ...(negrita ? { negrita: true } : {}),
          ...(cursiva ? { cursiva: true } : {}),
        })
      }
      return
    }

    if (nodo.nodeType !== Node.ELEMENT_NODE) return
    const elemento = nodo as HTMLElement
    const etiqueta = elemento.tagName.toLowerCase()
    if (etiqueta === 'br') {
      fragmentos.push({ texto: '\n' })
      return
    }
    const estilo = elemento.style?.fontWeight
    const masNegrita =
      negrita || etiqueta === 'b' || etiqueta === 'strong' || estilo === 'bold' || estilo === '700'
    const masCursiva = cursiva || etiqueta === 'i' || etiqueta === 'em'
    for (const hijo of Array.from(elemento.childNodes)) recorrer(hijo, masNegrita, masCursiva)
  }

  for (const hijo of Array.from(raiz.childNodes)) recorrer(hijo, false, false)
  return fragmentos.filter((f) => f.texto.length > 0)
}

/**
 * Escribe un renglón en el DOM, sin pasar por HTML en texto.
 *
 * Se construye con `createElement` y `createTextNode` a propósito: así no hay
 * ninguna cadena de marcado que escapar, y el editor mantiene la misma promesa
 * que el renderizador público —el contenido del autor es texto, nunca marcado.
 */
function pintarFragmentos(raiz: HTMLElement, fragmentos: Fragmento[]) {
  raiz.replaceChildren()
  for (const fragmento of fragmentos) {
    for (const [i, linea] of fragmento.texto.split('\n').entries()) {
      if (i > 0) raiz.appendChild(document.createElement('br'))
      if (linea.length === 0) continue
      const texto = document.createTextNode(linea)
      let nodo: Node = texto
      if (fragmento.cursiva) {
        const em = document.createElement('em')
        em.appendChild(nodo)
        nodo = em
      }
      if (fragmento.negrita) {
        const strong = document.createElement('strong')
        strong.appendChild(nodo)
        nodo = strong
      }
      raiz.appendChild(nodo)
    }
  }
}

interface RenglonConId extends Renglon {
  clave: string
}

let contador = 0
const nuevaClave = () => `r${++contador}`

export function EditorTextoRico({
  valor,
  alCambiar,
  etiqueta,
}: {
  valor: unknown
  alCambiar: (nuevo: unknown) => void
  etiqueta?: string
}) {
  const idBase = useId()
  const [renglones, setRenglones] = useState<RenglonConId[]>(() => {
    const iniciales = aRenglones(desdeLexical(valor))
    const lista = iniciales.length > 0 ? iniciales : [renglonNuevo()]
    return lista.map((r) => ({ ...r, clave: nuevaClave() }))
  })
  const [activo, setActivo] = useState<string | null>(null)
  const cajas = useRef(new Map<string, HTMLDivElement>())
  // Renglones cuyo contenido ya se volcó en el DOM. React llama al `ref` con
  // null y con el nodo otra vez en cada render cuando la función del ref es
  // nueva, de modo que sin esta marca el renglón se repintaría con su valor
  // inicial en cada tecla y el texto se borraría solo mientras se escribe.
  const pintados = useRef(new Set<string>())
  const aEnfocar = useRef<string | null>(null)

  /** Publica hacia arriba en el formato que se guarda. */
  const publicar = useCallback(
    (lista: RenglonConId[]) => {
      alCambiar(haciaLexical(desdeRenglones(lista.map(({ tipo, fragmentos }) => ({ tipo, fragmentos })))))
    },
    [alCambiar],
  )

  const actualizar = useCallback(
    (lista: RenglonConId[]) => {
      setRenglones(lista)
      publicar(lista)
    },
    [publicar],
  )

  // Tras insertar o borrar un renglón, el cursor debe quedar donde la persona
  // espera: en el renglón nuevo, o al final del anterior si borró uno.
  useEffect(() => {
    const clave = aEnfocar.current
    if (!clave) return
    aEnfocar.current = null
    const caja = cajas.current.get(clave)
    if (!caja) return
    caja.focus()
    const seleccion = window.getSelection()
    const rango = document.createRange()
    rango.selectNodeContents(caja)
    rango.collapse(false)
    seleccion?.removeAllRanges()
    seleccion?.addRange(rango)
  }, [renglones])

  const registrar = (clave: string, fragmentos: Fragmento[]) => (caja: HTMLDivElement | null) => {
    // Al desmontar no se olvida el nodo: React lo hace y lo deshace en el mismo
    // render, y borrar aquí haría creer al siguiente registro que el renglón es
    // nuevo. Los renglones que se van de verdad se limpian en `olvidar`.
    if (!caja) return
    cajas.current.set(clave, caja)
    if (!pintados.current.has(clave)) {
      // Solo la primera vez: después manda el DOM, no React. Volver a pintarlo
      // en cada render movería el cursor al principio en cada tecla.
      pintarFragmentos(caja, fragmentos)
      pintados.current.add(clave)
    }
  }

  /** Olvida un renglón que ya no existe, para no acumular nodos muertos. */
  const olvidar = (clave: string) => {
    cajas.current.delete(clave)
    pintados.current.delete(clave)
  }

  const leerTodo = (): RenglonConId[] =>
    renglones.map((renglon) => {
      const caja = cajas.current.get(renglon.clave)
      return caja ? { ...renglon, fragmentos: leerFragmentos(caja) } : renglon
    })

  const alEscribir = () => publicar(leerTodo())

  const cambiarTipo = (clave: string, tipo: TipoDeParrafo) => {
    actualizar(leerTodo().map((r) => (r.clave === clave ? { ...r, tipo } : r)))
  }

  const alTeclear = (clave: string) => (evento: React.KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      const lista = leerTodo()
      const indice = lista.findIndex((r) => r.clave === clave)
      const actual = lista[indice]
      // Un Enter en una viñeta sigue la lista; en un título vuelve a párrafo,
      // porque nadie escribe dos títulos seguidos.
      const tipoNuevo: TipoDeParrafo =
        actual.tipo === 'vinetas' || actual.tipo === 'numerada' ? actual.tipo : 'parrafo'
      const nuevo: RenglonConId = { tipo: tipoNuevo, fragmentos: [], clave: nuevaClave() }
      aEnfocar.current = nuevo.clave
      actualizar([...lista.slice(0, indice + 1), nuevo, ...lista.slice(indice + 1)])
      return
    }

    if (evento.key === 'Backspace') {
      const caja = cajas.current.get(clave)
      const vacio = (caja?.textContent ?? '').length === 0
      if (!vacio || renglones.length === 1) return
      evento.preventDefault()
      const lista = leerTodo()
      const indice = lista.findIndex((r) => r.clave === clave)
      aEnfocar.current = lista[Math.max(0, indice - 1)]?.clave ?? null
      olvidar(clave)
      actualizar(lista.filter((r) => r.clave !== clave))
    }
  }

  /**
   * Pegar entra siempre como texto llano.
   *
   * Lo que se pega en una ficha viene de Word o de un PDF y trae fuentes,
   * colores y tamaños que no pintan nada aquí: el aspecto de la plataforma vive
   * en el código, no en lo que el autor traiga pegado (D-011).
   */
  const alPegar = (evento: React.ClipboardEvent<HTMLDivElement>) => {
    evento.preventDefault()
    const texto = evento.clipboardData.getData('text/plain')
    if (!texto) return
    document.execCommand('insertText', false, texto.replace(/\r/g, ''))
    alEscribir()
  }

  const aplicarFormato = (comando: 'bold' | 'italic') => {
    document.execCommand(comando)
    alEscribir()
  }

  const mover = (clave: string, direccion: -1 | 1) => {
    const lista = leerTodo()
    const indice = lista.findIndex((r) => r.clave === clave)
    const destino = indice + direccion
    if (destino < 0 || destino >= lista.length) return
    const copia = [...lista]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    actualizar(copia)
  }

  return (
    <div className="rico" onBlur={alEscribir}>
      {etiqueta ? <span className="rico-etiqueta">{etiqueta}</span> : null}

      <div className="rico-barra" role="toolbar" aria-label="Formato del texto">
        <button
          type="button"
          className="rico-boton"
          title="Negrita (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicarFormato('bold')}
        >
          <strong>N</strong>
        </button>
        <button
          type="button"
          className="rico-boton"
          title="Cursiva (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => aplicarFormato('italic')}
        >
          <em>C</em>
        </button>
        <span className="rico-separador" />
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            className={`rico-boton${
              activo && renglones.find((r) => r.clave === activo)?.tipo === t.valor
                ? ' rico-boton-activo'
                : ''
            }`}
            title={t.titulo}
            disabled={!activo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => activo && cambiarTipo(activo, t.valor)}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <div className="rico-cuerpo">
        {renglones.map((renglon, i) => (
          <div
            key={renglon.clave}
            className={`rico-renglon rico-${renglon.tipo}${
              activo === renglon.clave ? ' rico-renglon-activo' : ''
            }`}
          >
            <span className="rico-marca" aria-hidden="true">
              {renglon.tipo === 'vinetas'
                ? '•'
                : renglon.tipo === 'numerada'
                  ? `${renglones.slice(0, i + 1).filter((r) => r.tipo === 'numerada').length}.`
                  : ''}
            </span>
            <div
              id={`${idBase}-${renglon.clave}`}
              ref={registrar(renglon.clave, renglon.fragmentos)}
              className="rico-caja"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="false"
              onInput={alEscribir}
              onFocus={() => setActivo(renglon.clave)}
              onKeyDown={alTeclear(renglon.clave)}
              onPaste={alPegar}
            />
            <span className="rico-acciones">
              <button
                type="button"
                title="Subir"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => mover(renglon.clave, -1)}
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                type="button"
                title="Bajar"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => mover(renglon.clave, 1)}
                disabled={i === renglones.length - 1}
              >
                ↓
              </button>
            </span>
          </div>
        ))}
      </div>

      <p className="rico-pie">
        Enter crea un renglón · Shift+Enter salta de línea dentro del mismo · lo que se pega entra
        como texto llano
      </p>
    </div>
  )
}
