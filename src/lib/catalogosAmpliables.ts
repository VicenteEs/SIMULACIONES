/**
 * Los catálogos del simulador que el propio editor ensancha mientras escribe un
 * caso: huesos y segmentos, clasificación AO, técnica y fase.
 *
 * Antes eran un desplegable cerrado: si «Fijador externo» o «Fémur proximal» no
 * estaban, el editor tenía que dejar el caso, ir a Contenido, crear la fila,
 * volver y buscarla. En la práctica no lo hacía: elegía la más parecida o dejaba
 * el campo vacío, y el catálogo no crecía nunca (la petición de Cristóbal: «hay
 * distintos tipos de técnica, que nosotros escribamos»). Ahora el campo se
 * escribe, se filtra la lista con lo escrito y, si lo escrito no está, ofrece
 * agregarlo ahí mismo. Lo agregado queda en la base y sale la próxima vez para
 * todos los editores.
 *
 * Es puro y sin imports: lo leen el control del formulario (navegador), la acción
 * que crea la fila (servidor) y las pruebas. Que los dos extremos comparen con la
 * **misma** función es lo que impide que el control diga «no está» de algo que la
 * acción luego encuentra repetido, o al revés.
 */

export interface CampoExtra {
  /** Nombre del campo en la colección. */
  nombre: 'codigo'
  etiqueta: string
  ayuda: string
  requerido: boolean
  maximo: number
}

export interface CatalogoAmpliable {
  /** «hueso», «técnica»…: para frases como «Agregar la técnica…». */
  singular: string
  /** «el» o «la»: el del singular, para esas mismas frases. */
  articulo: 'el' | 'la'
  /** Con artículo, para las frases del control («una técnica», «un hueso»). */
  conArticulo: string
  /** El nombre propio que se escribe en el cuadro principal. */
  etiquetaDelNombre: string
  /** Un campo más que acompaña al nombre, si el catálogo lo necesita. */
  extra?: CampoExtra
}

export const CATALOGOS_AMPLIABLES: Readonly<Record<string, CatalogoAmpliable>> = {
  'huesos-ao': {
    singular: 'hueso',
    articulo: 'el',
    conArticulo: 'un hueso o segmento',
    etiquetaDelNombre: 'Hueso o segmento',
    // Sin el número AO el código del caso se compone a medias («A2» en vez de
    // «42-A2»); por eso se pide, aunque no se obliga: un hueso sin número es
    // mejor que ningún hueso, y se completa luego en Contenido.
    extra: {
      nombre: 'codigo',
      etiqueta: 'Número AO',
      ayuda: 'El primero del código: 42 para la diáfisis de la tibia. Se puede dejar para después.',
      requerido: false,
      maximo: 12,
    },
  },
  'clasificaciones-ao': {
    singular: 'clasificación',
    articulo: 'la',
    conArticulo: 'una clasificación',
    etiquetaDelNombre: 'Nombre del trazo',
    extra: {
      nombre: 'codigo',
      etiqueta: 'Código',
      ayuda: '«A2», «B1», «C3»: el tipo y el grupo, sin el número del hueso.',
      requerido: true,
      maximo: 12,
    },
  },
  'tecnicas-quirurgicas': {
    singular: 'técnica',
    articulo: 'la',
    conArticulo: 'una técnica',
    etiquetaDelNombre: 'Nombre de la técnica',
  },
  'fases-quirurgicas': {
    singular: 'fase',
    articulo: 'la',
    conArticulo: 'una fase',
    etiquetaDelNombre: 'Nombre de la fase',
  },
  // Los dos que pidió Cristóbal para Patologías y Maniobras (P-003, E1): el segmento anatómico y el tipo
  // (trauma, ortopedia…). Ninguno lleva campo extra: se identifican por su nombre, como la técnica o la fase.
  segmentos: {
    singular: 'segmento',
    articulo: 'el',
    conArticulo: 'un segmento anatómico',
    etiquetaDelNombre: 'Nombre del segmento',
  },
  'tipos-de-ficha': {
    singular: 'tipo',
    articulo: 'el',
    conArticulo: 'un tipo de ficha',
    etiquetaDelNombre: 'Nombre del tipo',
  },
}

export const esCatalogoAmpliable = (coleccion: unknown): coleccion is string =>
  typeof coleccion === 'string' && Object.prototype.hasOwnProperty.call(CATALOGOS_AMPLIABLES, coleccion)

/**
 * Los catálogos de los que cuelga un aviso de fila nueva: son los mismos que se pueden ampliar, y de esta lista
 * sale el enumerado de `comentarios.coleccion`. Agregar un catálogo ampliable agrega su valor al enumerado, y eso
 * pide una migración (`tests/unit/migraciones.test.ts` lo comprueba).
 */
export const CATALOGOS_CON_AVISO: readonly string[] = Object.keys(CATALOGOS_AMPLIABLES)

/**
 * Lo que se compara al buscar y al detectar repetidos: sin tildes, en minúsculas
 * y con los espacios juntos. «Fémur », «femur» y «FÉMUR» son el mismo hueso para
 * quien escribe, y tienen que serlo también para quien lo guarda.
 */
export const paraComparar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export interface OpcionBuscable {
  id: string
  etiqueta: string
}

/**
 * Las opciones que contienen **todas** las palabras escritas, en cualquier orden.
 *
 * Por palabras y no por frase literal: quien busca «tibia diaf» o «placa
 * compresión» no tiene por qué recordar el orden en que está escrito el nombre.
 * Con la búsqueda vacía devuelve la lista entera, en su orden.
 */
export function filtrarOpciones<T extends OpcionBuscable>(opciones: readonly T[], escrito: string): T[] {
  const palabras = paraComparar(escrito).split(' ').filter(Boolean)
  if (palabras.length === 0) return [...opciones]
  return opciones.filter((o) => {
    const texto = paraComparar(o.etiqueta)
    return palabras.every((p) => texto.includes(p))
  })
}

/** La opción cuyo nombre es exactamente lo escrito (sin tildes ni mayúsculas), si existe. */
export function opcionIgualA<T extends OpcionBuscable>(opciones: readonly T[], escrito: string): T | undefined {
  const buscado = paraComparar(escrito)
  if (!buscado) return undefined
  return opciones.find((o) => paraComparar(o.etiqueta) === buscado)
}

/**
 * ¿Hay que ofrecer «¿No está? Agregar»? Cuando hay algo escrito y no coincide
 * del todo con ninguna opción. Si coincide, lo que corresponde es elegirla, no
 * duplicarla.
 */
export const hayQueOfrecerAgregar = (opciones: readonly OpcionBuscable[], escrito: string): boolean =>
  paraComparar(escrito) !== '' && !opcionIgualA(opciones, escrito)

/**
 * De dónde se agregó una fila: la ficha que estaba abierta y el campo desde el que se pulsó «¿No está? Agregar».
 *
 * `documentoId` es `null` cuando la ficha es nueva y todavía no se guardó: no tiene número al que apuntar, y el
 * aviso lo dice con esas palabras en vez de dejar una referencia rota.
 */
export interface OrigenDelAgregado {
  coleccion: string
  documentoId: string | null
  campo: string
}

/**
 * El texto del comentario que avisa de una fila nueva en un catálogo (P-003, E1).
 *
 * El equipo agrega huesos, técnicas, segmentos y tipos mientras escribe un caso, y nadie más se entera: dos
 * editores que escriben «Fijador externo» y «Fijador Externo (Ilizarov)» dejan dos filas que significan lo
 * mismo, y el catálogo se ensucia sin que la administración lo vea. El comentario cuelga de la fila nueva, no de
 * la ficha: es sobre la fila que hay que actuar (renombrarla, fusionarla o dejarla), y la fila siempre existe,
 * mientras que la ficha puede estar todavía sin guardar.
 *
 * Es puro y está aquí, junto a la tabla de catálogos, para que se pruebe sin base de datos.
 */
export function textoDelAvisoDeCatalogo(p: {
  quien: string
  catalogo: Pick<CatalogoAmpliable, 'articulo' | 'singular'>
  nombre: string
  codigo?: string
  /** La etiqueta del campo desde el que se agregó; sin ella (la acción se llamó sin origen) solo se dice «una ficha». */
  campo: string | null
  /** La ficha abierta, si ya tiene número: «la patología «Principios de…»». Sin ella, es una ficha nueva. */
  ficha: { articulo: 'el' | 'la'; singular: string; titulo: string | null } | null
  /**
   * Para una ficha nueva: «una patología», «un caso»… Sin ella ni `ficha`, el aviso no dice de qué ficha se
   * trató (la acción se llamó sin saberlo) y se queda en el campo.
   */
  fichaNueva: string | null
}): string {
  const que = `${p.catalogo.articulo} ${p.catalogo.singular} «${p.nombre}»${p.codigo ? ` (${p.codigo})` : ''}`
  // «de la patología», pero «del caso»: la contracción se escribe aquí y no en quien llama.
  const donde = p.ficha
    ? `${p.ficha.articulo === 'el' ? 'del' : 'de la'} ${p.ficha.singular}${p.ficha.titulo ? ` «${p.ficha.titulo}»` : ''}`
    : p.fichaNueva
      ? `de ${p.fichaNueva} nueva, todavía sin guardar`
      : null
  const desde = p.campo ? `desde el campo «${p.campo}»${donde ? ` ${donde}` : ''}` : 'desde una ficha'
  return `${p.quien} agregó ${que} al catálogo ${desde}. Revise que no sea el mismo de otro que ya estaba con distinto nombre.`
}

/** El tipo AO («A», «B», «C») que sugiere un código de clasificación como «B2». */
export function tipoDeLaClasificacion(codigo: string): 'A' | 'B' | 'C' | undefined {
  const inicial = codigo.trim().charAt(0).toUpperCase()
  return inicial === 'A' || inicial === 'B' || inicial === 'C' ? inicial : undefined
}
