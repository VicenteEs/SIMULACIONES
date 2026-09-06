/**
 * Traducción entre el árbol que guarda Payload y el modelo que edita el panel.
 *
 * El contenido rico se almacena en el formato de Lexical, y así seguirá: el
 * renderizador público (`src/components/Bloques.tsx`) lo pinta con componentes
 * propios y sin `dangerouslySetInnerHTML`, que es la razón por la que un autor
 * no puede inyectar comportamiento en la página. Cambiar el formato de
 * almacenamiento para tener un editor más cómodo habría obligado a migrar todo
 * el contenido escrito y a rehacer ese renderizador.
 *
 * De modo que el editor propio trabaja sobre un modelo intermedio —párrafos
 * con fragmentos— y estas funciones lo convierten en las dos direcciones. Son
 * puras a propósito: se prueban sin navegador y sin base de datos, y son el
 * único lugar donde hay que mirar si algún día el formato de Lexical cambia.
 */

/** Un trozo de texto con su formato. Lexical guarda el formato como bits. */
export interface Fragmento {
  texto: string
  negrita?: boolean
  cursiva?: boolean
}

export type TipoDeParrafo = 'parrafo' | 'h2' | 'h3' | 'h4' | 'vinetas' | 'numerada'

export type Parrafo =
  | { tipo: 'parrafo' | 'h2' | 'h3' | 'h4'; fragmentos: Fragmento[] }
  | { tipo: 'vinetas' | 'numerada'; puntos: Fragmento[][] }

/** Máscara de formato de Lexical. Solo se usan los dos primeros bits. */
const NEGRITA = 1
const CURSIVA = 2

export const esListado = (p: Parrafo): p is { tipo: 'vinetas' | 'numerada'; puntos: Fragmento[][] } =>
  p.tipo === 'vinetas' || p.tipo === 'numerada'

// ------------------------------------------------------- Lexical -> modelo

interface NodoLexical {
  type?: string
  tag?: string
  listType?: string
  text?: string
  format?: number | string
  children?: NodoLexical[]
}

function fragmentosDe(nodos: NodoLexical[] | undefined): Fragmento[] {
  const fragmentos: Fragmento[] = []
  for (const nodo of nodos ?? []) {
    if (nodo.type === 'text' && typeof nodo.text === 'string') {
      const formato = typeof nodo.format === 'number' ? nodo.format : 0
      fragmentos.push({
        texto: nodo.text,
        ...((formato & NEGRITA) === NEGRITA ? { negrita: true } : {}),
        ...((formato & CURSIVA) === CURSIVA ? { cursiva: true } : {}),
      })
    } else if (nodo.type === 'linebreak') {
      fragmentos.push({ texto: '\n' })
    } else if (nodo.children) {
      // Enlaces y demás nodos que envuelven texto: se conserva el texto y se
      // pierde el envoltorio. Es una simplificación consciente; el editor no
      // ofrece enlaces y guardar un envoltorio que nadie puede editar sería
      // guardar algo que se rompe al primer cambio.
      fragmentos.push(...fragmentosDe(nodo.children))
    }
  }
  return fragmentos
}

/**
 * Convierte lo que hay guardado en párrafos editables.
 *
 * Tolera cualquier cosa: contenido nulo, un árbol de una versión anterior o un
 * nodo que el editor no sabe representar. Nunca lanza, porque un contenido
 * inesperado debe poder abrirse para corregirlo, no impedir que se abra.
 */
export function desdeLexical(valor: unknown): Parrafo[] {
  const raiz = (valor as { root?: NodoLexical } | null)?.root
  if (!raiz?.children?.length) return []

  const parrafos: Parrafo[] = []
  for (const nodo of raiz.children) {
    if (nodo.type === 'heading' && (nodo.tag === 'h2' || nodo.tag === 'h3' || nodo.tag === 'h4')) {
      parrafos.push({ tipo: nodo.tag, fragmentos: fragmentosDe(nodo.children) })
    } else if (nodo.type === 'list') {
      parrafos.push({
        tipo: nodo.listType === 'number' ? 'numerada' : 'vinetas',
        puntos: (nodo.children ?? []).map((item) => fragmentosDe(item.children)),
      })
    } else {
      parrafos.push({ tipo: 'parrafo', fragmentos: fragmentosDe(nodo.children) })
    }
  }
  return parrafos
}

// ------------------------------------------------------- modelo -> Lexical

const nodoTexto = (f: Fragmento) => ({
  type: 'text',
  detail: 0,
  format: (f.negrita ? NEGRITA : 0) | (f.cursiva ? CURSIVA : 0),
  mode: 'normal',
  style: '',
  text: f.texto,
  version: 1,
})

const comunes = { format: '', indent: 0, version: 1, direction: 'ltr' as const }

/** Un párrafo vacío: es lo que Lexical espera de un contenido en blanco. */
const PARRAFO_VACIO = { type: 'paragraph', ...comunes, textFormat: 0, children: [] }

export function haciaLexical(parrafos: Parrafo[]): unknown {
  const hijos = parrafos.map((p) => {
    if (esListado(p)) {
      return {
        type: 'list',
        ...comunes,
        listType: p.tipo === 'numerada' ? 'number' : 'bullet',
        start: 1,
        tag: p.tipo === 'numerada' ? 'ol' : 'ul',
        children: p.puntos.map((punto, i) => ({
          type: 'listitem',
          ...comunes,
          value: i + 1,
          checked: undefined,
          children: punto.map(nodoTexto),
        })),
      }
    }
    if (p.tipo === 'parrafo') {
      return { type: 'paragraph', ...comunes, textFormat: 0, children: p.fragmentos.map(nodoTexto) }
    }
    return { type: 'heading', ...comunes, tag: p.tipo, children: p.fragmentos.map(nodoTexto) }
  })

  return {
    root: {
      type: 'root',
      ...comunes,
      children: hijos.length > 0 ? hijos : [PARRAFO_VACIO],
    },
  }
}

// ------------------------------------------------------------- utilidades

/** Texto llano, para buscadores, resúmenes y la vista plegada de un bloque. */
export function textoPlano(valor: unknown): string {
  return desdeLexical(valor)
    .map((p) =>
      esListado(p)
        ? p.puntos.map((punto) => punto.map((f) => f.texto).join('')).join(' · ')
        : p.fragmentos.map((f) => f.texto).join(''),
    )
    .filter((linea) => linea.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿El contenido rico está realmente vacío? Un párrafo en blanco lo está. */
export const estaVacio = (valor: unknown): boolean => textoPlano(valor).length === 0

/** Contenido rico recién creado, listo para escribir encima. */
export const contenidoNuevo = (): unknown => haciaLexical([])

/**
 * Parte un texto llano en párrafos.
 *
 * Es lo que se usa al pegar: una línea en blanco separa párrafos y el resto se
 * respeta tal cual, sin inventar formato que el autor no pidió.
 */
export function desdeTextoLlano(texto: string): Parrafo[] {
  return texto
    .split(/\n{2,}/)
    .map((trozo) => trozo.trim())
    .filter(Boolean)
    .map((trozo) => ({ tipo: 'parrafo' as const, fragmentos: [{ texto: trozo }] }))
}

// --------------------------------------------------- párrafos <-> renglones

/**
 * Renglón del editor: una línea escribible.
 *
 * El modelo de Lexical agrupa los puntos de una lista dentro de un nodo
 * `list`, pero quien escribe no piensa en «una lista con tres puntos» sino en
 * tres renglones seguidos con viñeta. El editor trabaja con renglones planos y
 * estas dos funciones hacen el viaje de ida y vuelta: al guardar, los renglones
 * consecutivos del mismo tipo de lista se funden en un solo nodo.
 */
export interface Renglon {
  tipo: TipoDeParrafo
  fragmentos: Fragmento[]
}

export function aRenglones(parrafos: Parrafo[]): Renglon[] {
  return parrafos.flatMap((p): Renglon[] =>
    esListado(p)
      ? p.puntos.map((punto) => ({ tipo: p.tipo, fragmentos: punto }))
      : [{ tipo: p.tipo, fragmentos: p.fragmentos }],
  )
}

export function desdeRenglones(renglones: Renglon[]): Parrafo[] {
  const parrafos: Parrafo[] = []
  for (const renglon of renglones) {
    if (renglon.tipo === 'vinetas' || renglon.tipo === 'numerada') {
      const anterior = parrafos[parrafos.length - 1]
      if (anterior && anterior.tipo === renglon.tipo && esListado(anterior)) {
        anterior.puntos.push(renglon.fragmentos)
      } else {
        parrafos.push({ tipo: renglon.tipo, puntos: [renglon.fragmentos] })
      }
    } else {
      parrafos.push({ tipo: renglon.tipo, fragmentos: renglon.fragmentos })
    }
  }
  return parrafos
}

/** Un renglón vacío, que es con lo que empieza un contenido en blanco. */
export const renglonNuevo = (): Renglon => ({ tipo: 'parrafo', fragmentos: [] })
