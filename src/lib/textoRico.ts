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
  // Un carácter de control en medio no es un enlace raro: es una dirección
  // disfrazada. El navegador borra tabulador, salto de línea y retorno de carro
  // al analizar una dirección, así que `/\t/evil.example.com` pasaba la
  // comprobación de ruta interna —el segundo carácter no es `/`— y terminaba
  // resolviéndose como `//evil.example.com`, o sea fuera de la plataforma.
  // `trim()` no basta: solo limpia los extremos.
  if (/[\u0000-\u001f\u007f]/.test(limpio)) return undefined
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
      // Un bloque dentro de otro —el segundo párrafo de una cita, o el párrafo
      // que envuelve el contenido de un punto de lista— se aplana, porque el
      // modelo de en medio no anida. Lo que no puede pasar es que el texto de
      // uno quede pegado al del siguiente: `compactar` une fragmentos contiguos
      // del mismo formato, y sin este salto «Reducir» seguido de «con tracción»
      // se guardaba como «Reducircon tracción». Perder el nivel es perder
      // forma; pegar las palabras es perder texto, y eso no se recupera.
      const dentro = fragmentosDeLexical(nodo.children, enlace)
      if (dentro.length === 0) continue
      if (fragmentos.length > 0) fragmentos.push({ texto: '\n' })
      fragmentos.push(...dentro)
    }
  }
  return compactar(fragmentos)
}

/**
 * Los puntos de una lista, con las sublistas convertidas en puntos propios.
 *
 * En Lexical una sublista cuelga de un `listitem`, y antes se aplanaba encima
 * del texto de ese punto padre. El modelo de en medio no anida a propósito
 * (`Parrafo` de tipo lista es `Fragmento[][]`, sin más niveles), así que la
 * sublista se despliega a la altura del resto en vez de fundirse con nadie. Si
 * algún día el modelo anida, este es el sitio por donde hay que empezar.
 */
function puntosDeListaLexical(items: NodoLexical[] | undefined): Fragmento[][] {
  const puntos: Fragmento[][] = []
  for (const item of items ?? []) {
    // Hay árboles con la sublista colgando de la lista y no del punto.
    if (item.type === 'list') {
      puntos.push(...puntosDeListaLexical(item.children))
      continue
    }
    const hijos = item.children ?? []
    const sublistas = hijos.filter((h) => h.type === 'list')
    if (sublistas.length === 0) {
      puntos.push(fragmentosDeLexical(hijos))
      continue
    }
    // El punto que solo existe para colgar la sublista no deja un punto vacío.
    const propios = fragmentosDeLexical(hijos.filter((h) => h.type !== 'list'))
    if (propios.length > 0) puntos.push(propios)
    for (const sublista of sublistas) puntos.push(...puntosDeListaLexical(sublista.children))
  }
  return puntos
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
        puntos: puntosDeListaLexical(nodo.children),
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

/**
 * Los nodos de Lexical de un fragmento, con los saltos simples aparte.
 *
 * Un salto va como nodo `linebreak` y no como `\n` dentro del texto. El
 * renderizador público pinta `linebreak` como `<br>`, pero un `\n` dentro de un
 * nodo `text` sale al HTML tal cual y el HTML lo colapsa a un espacio: las
 * cuatro fases de una maniobra escritas con Mayús+Intro se leían fundidas en un
 * párrafo corrido. No se veía desde el panel porque el editor reconstruye el
 * salto en los dos casos —`hijosTipTap` parte por `\n`—, así que el autor daba
 * el trabajo por terminado. `fragmentosDeLexical` ya sabe leer `linebreak`, de
 * modo que el viaje de ida y vuelta no cambia.
 */
const nodosDeFragmento = (f: Fragmento): unknown[] =>
  f.texto.split('\n').flatMap((linea, i) => [
    ...(i > 0 ? [{ type: 'linebreak', version: 1 }] : []),
    ...(linea.length > 0 ? [nodoTextoLexical({ ...f, texto: linea })] : []),
  ])

/** Envuelve en nodos de enlace los fragmentos que lo llevan. */
function hijosLexical(fragmentos: Fragmento[]): unknown[] {
  const hijos: unknown[] = []
  let i = 0
  while (i < fragmentos.length) {
    const enlace = fragmentos[i].enlace
    if (!enlace) {
      hijos.push(...nodosDeFragmento(fragmentos[i]))
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
      // Una ficha de la propia plataforma no abre pestaña nueva: quien la sigue
      // pierde el «atrás» y se queda con dos ventanas de lo mismo. Fuera de
      // aquí sí, que es a donde se va y no se vuelve.
      fields: { linkType: 'custom', newTab: !enlace.startsWith('/'), url: enlace },
      children: grupo.flatMap(nodosDeFragmento),
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
    // Un párrafo dentro de un punto de lista o de una cita: se aplana, porque
    // el modelo de en medio no anida. Entre dos bloques hermanos va un salto:
    // sin él, `compactar` los unía y dos párrafos de una cita salían con la
    // última palabra de uno pegada a la primera del otro.
    if (nodo.content) {
      const dentro = fragmentosDeTipTap(nodo.content)
      if (dentro.length === 0) continue
      if (fragmentos.length > 0) fragmentos.push({ texto: '\n' })
      fragmentos.push(...dentro)
    }
  }
  return compactar(fragmentos)
}

const esListaTipTap = (tipo?: string): boolean => tipo === 'bulletList' || tipo === 'orderedList'

/**
 * Los puntos de una lista de TipTap, con las sublistas desplegadas.
 *
 * `ListItem` de TipTap admite `paragraph block*`, así que el tabulador mete una
 * sublista dentro del punto. El modelo no anida, y aplanarla dentro del padre
 * pegaba las palabras: «Reducir» con los subpuntos «con tracción» y «bajo
 * anestesia» se guardaba como un único «Reducircon traccionbajo anestesia», y
 * el autor no tenía cómo recuperar lo escrito porque nunca vio romperse nada.
 * El editor ya no deja crear la sublista (`SinSublistas`, en
 * `EditorTextoRico.tsx`), pero esto sigue haciendo falta: lo que se pega desde
 * Word trae listas anidadas, y en la base ya hay contenido con ellas.
 */
function puntosDeListaTipTap(items: NodoTipTap[] | undefined): Fragmento[][] {
  const puntos: Fragmento[][] = []
  for (const item of items ?? []) {
    if (esListaTipTap(item.type)) {
      puntos.push(...puntosDeListaTipTap(item.content))
      continue
    }
    const hijos = item.content ?? []
    const sublistas = hijos.filter((h) => esListaTipTap(h.type))
    if (sublistas.length === 0) {
      puntos.push(fragmentosDeTipTap(hijos))
      continue
    }
    // El punto que solo existe para colgar la sublista no deja un punto vacío.
    const propios = fragmentosDeTipTap(hijos.filter((h) => !esListaTipTap(h.type)))
    if (propios.length > 0) puntos.push(propios)
    for (const sublista of sublistas) puntos.push(...puntosDeListaTipTap(sublista.content))
  }
  return puntos
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
      // La alineación de una cita vive en su párrafo interior, no en ella:
      // `TextAlign` está configurado para `heading` y `paragraph` (ver
      // `EditorTextoRico.tsx`), así que un `blockquote` nunca lleva `textAlign`
      // y `haciaTipTap` la deja dentro. Buscarla solo en el nodo de primer
      // nivel enderezaba toda cita centrada en el siguiente guardado, aunque
      // nadie la hubiese tocado: el editor serializa el documento entero a cada
      // tecla.
      const interna = nodo.content?.[0]?.attrs?.textAlign
      const deLaCita = alineacion ?? (interna ? DESDE_TIPTAP[interna] : undefined)
      parrafos.push({
        tipo: 'cita',
        fragmentos: fragmentosDeTipTap(nodo.content),
        ...(deLaCita ? { alineacion: deLaCita } : {}),
      })
    } else if (esListaTipTap(nodo.type)) {
      parrafos.push({
        tipo: nodo.type === 'orderedList' ? 'numerada' : 'vinetas',
        puntos: puntosDeListaTipTap(nodo.content),
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

/**
 * Tipos de Lexical que por sí solos no pintan nada: lo que valen es su texto.
 *
 * Cualquier otro —`upload`, `horizontalrule`, `relationship`, un bloque— sí
 * pinta algo aunque no aporte una sola letra, y el renderizador de Payload sabe
 * hacerlo con sus convertidores por omisión.
 */
const SIN_TEXTO_NO_PINTAN = new Set([
  'paragraph',
  'heading',
  'quote',
  'list',
  'listitem',
  'link',
  'autolink',
  'text',
  'linebreak',
  'tab',
])

const algoQuePintar = (nodo: NodoLexical): boolean => {
  if (nodo.type === 'text') return typeof nodo.text === 'string' && nodo.text.trim().length > 0
  if (!SIN_TEXTO_NO_PINTAN.has(nodo.type ?? '')) return true
  return (nodo.children ?? []).some(algoQuePintar)
}

/**
 * ¿El contenido rico está realmente vacío? Un párrafo en blanco lo está.
 *
 * Mira el árbol y no su texto llano. Medirlo con `textoPlano` daba «vacío» a un
 * campo cuyo contenido fuese una radiografía insertada o una línea divisoria
 * —`desdeLexical` no los sabe leer y los deja fuera del texto—, así que `Rico`
 * devolvía `null` y la nota entera desaparecía de la ficha pública sin aviso.
 * `textoPlano` se queda como está: para un resumen, un nodo sin letras no
 * aporta nada.
 */
export const estaVacio = (valor: unknown): boolean => {
  const raiz = (valor as { root?: NodoLexical } | null)?.root
  if (!raiz?.children?.length) return true
  return !raiz.children.some(algoQuePintar)
}

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
      // Los saltos simples se respetan tal cual. Aquí hubo un `replace` de
      // salto de línea por salto de línea: no cambiaba absolutamente nada.
      fragmentos: [{ texto: trozo }],
    }))
}

/** El mismo camino, ya en el formato que se guarda. */
export const textoLlanoALexical = (texto: string): unknown => haciaLexical(desdeTextoLlano(texto))
