/**
 * Traducción entre los tres formatos del texto con formato.
 *
 * Hay tres, y cada uno está donde está por una razón:
 *
 *  - **Lexical** es lo que se guarda. Lo lee el renderizador público, que pinta
 *    el árbol con componentes propios y sin `dangerouslySetInnerHTML`: por eso
 *    un autor no puede inyectar comportamiento en la página aunque escriba
 *    etiquetas. Cambiarlo obligaría a migrar todo lo escrito y a rehacer ese
 *    renderizador, así que no se cambia.
 *  - **TipTap** es lo que edita el panel. Es el editor que ya se usa en la
 *    página de cursos, y traerlo evita inventar otro con menos oficio.
 *  - **El modelo de en medio** —párrafos con fragmentos— es de esta casa, y
 *    existe para que la conversión sea una sola pieza pura, probada sin
 *    navegador y sin base de datos, en lugar de dos traducciones cruzadas.
 *
 * Lo que este archivo sabe representar es exactamente lo que ofrece la barra
 * del editor. Un nodo que no esté aquí no sobrevive al viaje de ida y vuelta,
 * y eso es deliberado: es lo que impide que llegue a la base algo que el
 * renderizador público no sepa pintar.
 */

// ------------------------------------------------------------------ modelo

/** Un trozo de texto con su formato. */
export interface Fragmento {
  texto: string
  negrita?: boolean
  cursiva?: boolean
  subrayado?: boolean
  tachado?: boolean
  /** Dirección del enlace, si el trozo es un enlace. */
  enlace?: string
}

export type Alineacion = 'izquierda' | 'centro' | 'derecha' | 'justificado'

export type TipoDeParrafo = 'parrafo' | 'h2' | 'h3' | 'h4' | 'cita' | 'vinetas' | 'numerada'

export type Parrafo =
  | {
      tipo: 'parrafo' | 'h2' | 'h3' | 'h4' | 'cita'
      fragmentos: Fragmento[]
      alineacion?: Alineacion
    }
  | { tipo: 'vinetas' | 'numerada'; puntos: Fragmento[][] }

export const esListado = (
  p: Parrafo,
): p is { tipo: 'vinetas' | 'numerada'; puntos: Fragmento[][] } =>
  p.tipo === 'vinetas' || p.tipo === 'numerada'

/** Máscara de formato de Lexical: son bits, no una lista. */
const NEGRITA = 1
const CURSIVA = 2
const TACHADO = 4
const SUBRAYADO = 8

const A_LEXICAL: Record<Alineacion, string> = {
  izquierda: 'left',
  centro: 'center',
  derecha: 'right',
  justificado: 'justify',
}

const DESDE_LEXICAL: Record<string, Alineacion> = {
  left: 'izquierda',
  center: 'centro',
  right: 'derecha',
  justify: 'justificado',
}

const A_TIPTAP: Record<Alineacion, string> = A_LEXICAL
const DESDE_TIPTAP: Record<string, Alineacion> = DESDE_LEXICAL

/** Une fragmentos contiguos con el mismo formato. */
function compactar(fragmentos: Fragmento[]): Fragmento[] {
  const salida: Fragmento[] = []
  for (const fragmento of fragmentos) {
    if (fragmento.texto.length === 0) continue
    const ultimo = salida[salida.length - 1]
    const mismoFormato =
      ultimo &&
      Boolean(ultimo.negrita) === Boolean(fragmento.negrita) &&
      Boolean(ultimo.cursiva) === Boolean(fragmento.cursiva) &&
      Boolean(ultimo.subrayado) === Boolean(fragmento.subrayado) &&
      Boolean(ultimo.tachado) === Boolean(fragmento.tachado) &&
      ultimo.enlace === fragmento.enlace
    if (mismoFormato) ultimo.texto += fragmento.texto
    else salida.push({ ...fragmento })
  }
  return salida
}

/**
 * Deja una dirección de enlace en algo seguro de publicar.
 *
 * Solo http, https, mailto y tel. Sin esto, un `javascript:` escrito a mano en
 * el cuadro de enlace se guardaría y el renderizador lo pintaría como un enlace
 * que ejecuta código al pulsarlo.
 */
export function enlaceSeguro(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const limpio = valor.trim()
  if (limpio.length === 0 || limpio.length > 2000) return undefined
  if (/^(https?:|mailto:|tel:)/i.test(limpio)) return limpio
  // Una ruta interna también vale; lo que no vale es un esquema raro.
  if (/^\/[^/\\]/.test(limpio)) return limpio
  return undefined
}

// ------------------------------------------------------- Lexical -> modelo

interface NodoLexical {
  type?: string
  tag?: string
  listType?: string
  text?: string
  format?: number | string
  fields?: { url?: string }
  children?: NodoLexical[]
}

function fragmentosDeLexical(nodos: NodoLexical[] | undefined, enlace?: string): Fragmento[] {
  const fragmentos: Fragmento[] = []
  for (const nodo of nodos ?? []) {
    if (nodo.type === 'text' && typeof nodo.text === 'string') {
      const formato = typeof nodo.format === 'number' ? nodo.format : 0
      fragmentos.push({
        texto: nodo.text,
        ...((formato & NEGRITA) === NEGRITA ? { negrita: true } : {}),
        ...((formato & CURSIVA) === CURSIVA ? { cursiva: true } : {}),
        ...((formato & TACHADO) === TACHADO ? { tachado: true } : {}),
        ...((formato & SUBRAYADO) === SUBRAYADO ? { subrayado: true } : {}),
        ...(enlace ? { enlace } : {}),
      })
    } else if (nodo.type === 'linebreak') {
      fragmentos.push({ texto: '\n' })
    } else if (nodo.type === 'link' || nodo.type === 'autolink') {
      const url = enlaceSeguro(nodo.fields?.url)
      fragmentos.push(...fragmentosDeLexical(nodo.children, url ?? enlace))
    } else if (nodo.children) {
      fragmentos.push(...fragmentosDeLexical(nodo.children, enlace))
    }
  }
  return compactar(fragmentos)
}

const alineacionDe = (nodo: NodoLexical): Alineacion | undefined =>
  typeof nodo.format === 'string' ? DESDE_LEXICAL[nodo.format] : undefined

/**
 * Convierte lo guardado en párrafos editables.
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
    const alineacion = alineacionDe(nodo)
    if (nodo.type === 'heading' && (nodo.tag === 'h2' || nodo.tag === 'h3' || nodo.tag === 'h4')) {
      parrafos.push({ tipo: nodo.tag, fragmentos: fragmentosDeLexical(nodo.children), ...(alineacion ? { alineacion } : {}) })
    } else if (nodo.type === 'quote') {
      parrafos.push({ tipo: 'cita', fragmentos: fragmentosDeLexical(nodo.children), ...(alineacion ? { alineacion } : {}) })
    } else if (nodo.type === 'list') {
      parrafos.push({
        tipo: nodo.listType === 'number' ? 'numerada' : 'vinetas',
        puntos: (nodo.children ?? []).map((item) => fragmentosDeLexical(item.children)),
      })
    } else {
      parrafos.push({ tipo: 'parrafo', fragmentos: fragmentosDeLexical(nodo.children), ...(alineacion ? { alineacion } : {}) })
    }
  }
  return parrafos
}

// ------------------------------------------------------- modelo -> Lexical

const nodoTextoLexical = (f: Fragmento) => ({
  type: 'text',
  detail: 0,
  format:
    (f.negrita ? NEGRITA : 0) |
    (f.cursiva ? CURSIVA : 0) |
    (f.tachado ? TACHADO : 0) |
    (f.subrayado ? SUBRAYADO : 0),
  mode: 'normal',
  style: '',
  text: f.texto,
  version: 1,
})

const comunes = { format: '', indent: 0, version: 1, direction: 'ltr' as const }

/** Envuelve en nodos de enlace los fragmentos que lo llevan. */
function hijosLexical(fragmentos: Fragmento[]): unknown[] {
  const hijos: unknown[] = []
  let i = 0
  while (i < fragmentos.length) {
    const enlace = fragmentos[i].enlace
    if (!enlace) {
      hijos.push(nodoTextoLexical(fragmentos[i]))
      i += 1
      continue
    }
    // Fragmentos seguidos con el mismo enlace comparten un solo nodo.
    const grupo: Fragmento[] = []
    while (i < fragmentos.length && fragmentos[i].enlace === enlace) {
      grupo.push(fragmentos[i])
      i += 1
    }
    hijos.push({
      type: 'link',
      ...comunes,
      fields: { linkType: 'custom', newTab: true, url: enlace },
      children: grupo.map(nodoTextoLexical),
    })
  }
  return hijos
}

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
          children: hijosLexical(punto),
        })),
      }
    }

    const formato = p.alineacion ? A_LEXICAL[p.alineacion] : ''
    const base = { ...comunes, format: formato, children: hijosLexical(p.fragmentos) }

    if (p.tipo === 'parrafo') return { type: 'paragraph', ...base, textFormat: 0 }
    if (p.tipo === 'cita') return { type: 'quote', ...base }
    return { type: 'heading', ...base, tag: p.tipo }
  })

  return {
    root: { type: 'root', ...comunes, children: hijos.length > 0 ? hijos : [PARRAFO_VACIO] },
  }
}

// -------------------------------------------------------- TipTap <-> modelo

interface NodoTipTap {
  type?: string
  text?: string
  attrs?: { level?: number; textAlign?: string; href?: string }
  marks?: { type?: string; attrs?: { href?: string } }[]
  content?: NodoTipTap[]
}

function fragmentosDeTipTap(nodos: NodoTipTap[] | undefined): Fragmento[] {
  const fragmentos: Fragmento[] = []
  for (const nodo of nodos ?? []) {
    if (nodo.type === 'hardBreak') {
      fragmentos.push({ texto: '\n' })
      continue
    }
    if (nodo.type === 'text' && typeof nodo.text === 'string') {
      const marcas = new Set((nodo.marks ?? []).map((m) => m.type))
      const enlace = enlaceSeguro(nodo.marks?.find((m) => m.type === 'link')?.attrs?.href)
      fragmentos.push({
        texto: nodo.text,
        ...(marcas.has('bold') ? { negrita: true } : {}),
        ...(marcas.has('italic') ? { cursiva: true } : {}),
        ...(marcas.has('underline') ? { subrayado: true } : {}),
        ...(marcas.has('strike') ? { tachado: true } : {}),
        ...(enlace ? { enlace } : {}),
      })
      continue
    }
    // Un párrafo dentro de un punto de lista o de una cita: se aplana.
    if (nodo.content) fragmentos.push(...fragmentosDeTipTap(nodo.content))
  }
  return compactar(fragmentos)
}

export function desdeTipTap(documento: unknown): Parrafo[] {
  const contenido = (documento as NodoTipTap | null)?.content
  if (!Array.isArray(contenido)) return []

  const parrafos: Parrafo[] = []
  for (const nodo of contenido) {
    const alineacion = nodo.attrs?.textAlign ? DESDE_TIPTAP[nodo.attrs.textAlign] : undefined
    const conAlineacion = alineacion ? { alineacion } : {}

    if (nodo.type === 'heading') {
      const nivel = nodo.attrs?.level ?? 2
      // La plataforma reserva el h1 para el título de la página: un encabezado
      // de nivel 1 dentro del contenido se guarda como el mayor disponible.
      const tag = nivel <= 2 ? 'h2' : nivel === 3 ? 'h3' : 'h4'
      parrafos.push({ tipo: tag, fragmentos: fragmentosDeTipTap(nodo.content), ...conAlineacion })
    } else if (nodo.type === 'blockquote') {
      parrafos.push({ tipo: 'cita', fragmentos: fragmentosDeTipTap(nodo.content), ...conAlineacion })
    } else if (nodo.type === 'bulletList' || nodo.type === 'orderedList') {
      parrafos.push({
        tipo: nodo.type === 'orderedList' ? 'numerada' : 'vinetas',
        puntos: (nodo.content ?? []).map((item) => fragmentosDeTipTap(item.content)),
      })
    } else if (nodo.type === 'horizontalRule') {
      continue
    } else {
      parrafos.push({ tipo: 'parrafo', fragmentos: fragmentosDeTipTap(nodo.content), ...conAlineacion })
    }
  }
  return parrafos
}

function hijosTipTap(fragmentos: Fragmento[]): NodoTipTap[] {
  const hijos: NodoTipTap[] = []
  for (const fragmento of fragmentos) {
    for (const [i, linea] of fragmento.texto.split('\n').entries()) {
      if (i > 0) hijos.push({ type: 'hardBreak' })
      if (linea.length === 0) continue
      const marks: NodoTipTap['marks'] = []
      if (fragmento.negrita) marks.push({ type: 'bold' })
      if (fragmento.cursiva) marks.push({ type: 'italic' })
      if (fragmento.subrayado) marks.push({ type: 'underline' })
      if (fragmento.tachado) marks.push({ type: 'strike' })
      if (fragmento.enlace) marks.push({ type: 'link', attrs: { href: fragmento.enlace } })
      hijos.push({ type: 'text', text: linea, ...(marks.length > 0 ? { marks } : {}) })
    }
  }
  return hijos
}

export function haciaTipTap(parrafos: Parrafo[]): unknown {
  const contenido: NodoTipTap[] = parrafos.map((p) => {
    if (esListado(p)) {
      return {
        type: p.tipo === 'numerada' ? 'orderedList' : 'bulletList',
        content: p.puntos.map((punto) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: hijosTipTap(punto) }],
        })),
      }
    }

    const attrs = p.alineacion ? { textAlign: A_TIPTAP[p.alineacion] } : {}
    const hijos = hijosTipTap(p.fragmentos)

    if (p.tipo === 'parrafo') return { type: 'paragraph', attrs, content: hijos }
    if (p.tipo === 'cita') {
      return { type: 'blockquote', content: [{ type: 'paragraph', attrs, content: hijos }] }
    }
    const nivel = p.tipo === 'h2' ? 2 : p.tipo === 'h3' ? 3 : 4
    return { type: 'heading', attrs: { ...attrs, level: nivel }, content: hijos }
  })

  return { type: 'doc', content: contenido.length > 0 ? contenido : [{ type: 'paragraph' }] }
}

/** Atajos de un formato al otro, que es lo que usa el editor. */
export const lexicalATipTap = (valor: unknown): unknown => haciaTipTap(desdeLexical(valor))
export const tipTapALexical = (documento: unknown): unknown => haciaLexical(desdeTipTap(documento))

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
 * Convierte texto llano en contenido rico.
 *
 * Es lo que usa la migración de los campos que antes eran un área de texto
 * simple: cada línea en blanco separa párrafos y el resto se respeta tal cual,
 * sin inventar formato que el autor no pidió.
 */
export function desdeTextoLlano(texto: string): Parrafo[] {
  return texto
    .split(/\n{2,}/)
    .map((trozo) => trozo.trim())
    .filter(Boolean)
    .map((trozo) => ({
      tipo: 'parrafo' as const,
      fragmentos: [{ texto: trozo.replace(/\n/g, '\n') }],
    }))
}

/** El mismo camino, ya en el formato que se guarda. */
export const textoLlanoALexical = (texto: string): unknown => haciaLexical(desdeTextoLlano(texto))
