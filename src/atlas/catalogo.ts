/**
 * Consultas sobre el catálogo del atlas.
 *
 * Todo lo de aquí es puro: entra el catálogo, sale un dato. Se prueba sin
 * navegador y sin base de datos, que es importante porque de estas funciones
 * depende que «déjame solo la tibia derecha» encuentre la tibia derecha entre
 * 2.234 piezas, y que lo que se guarda como instancia sea siempre coherente.
 */

import {
  MAXIMO_PIEZAS,
  VISTA_INICIAL,
  type CatalogoDelAtlas,
  type ContenidoDeInstancia,
  type PiezaDelAtlas,
  type VistaDeInstancia,
} from './formato'

// ------------------------------------------------------------------ búsqueda

/**
 * Normaliza para comparar: sin acentos, sin mayúsculas, sin signos.
 *
 * Hace falta porque el traumatólogo escribe «fémur» y la pieza se llama
 * «Femur», y porque escribe «tibia derecha» y la pieza es «Right tibia».
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Equivalencias español → inglés para la búsqueda.
 *
 * Los nombres de las piezas están en su forma anatómica original y no se
 * traducen (ver `public/atlas/ATRIBUCION.md`). Pero buscar en la lengua en la
 * que uno piensa no es un lujo: sin esto, escribir «rodilla» no encuentra nada.
 *
 * La lista es corta a propósito. Cubre lateralidad, los huesos largos y las
 * regiones que se operan; el resto de la terminología anatómica es casi idéntica
 * en las dos lenguas y no necesita ayuda.
 */
const EQUIVALENCIAS: Record<string, string> = {
  derecho: 'right',
  derecha: 'right',
  izquierdo: 'left',
  izquierda: 'left',
  hueso: 'bone',
  femur: 'femur',
  tibia: 'tibia',
  perone: 'fibula',
  rotula: 'patella',
  humero: 'humerus',
  cubito: 'ulna',
  radio: 'radius',
  clavicula: 'clavicle',
  escapula: 'scapula',
  omoplato: 'scapula',
  pelvis: 'pelvis',
  cadera: 'hip',
  rodilla: 'knee',
  tobillo: 'ankle',
  hombro: 'shoulder',
  codo: 'elbow',
  muneca: 'wrist',
  mano: 'hand',
  pie: 'foot',
  craneo: 'skull',
  columna: 'vertebral',
  vertebra: 'vertebra',
  costilla: 'rib',
  esternon: 'sternum',
  musculo: 'muscle',
  arteria: 'artery',
  vena: 'vein',
  nervio: 'nerve',
  tendon: 'tendon',
  ligamento: 'ligament',
  cartilago: 'cartilage',
  corazon: 'heart',
  pulmon: 'lung',
  higado: 'liver',
  rinon: 'kidney',
  cerebro: 'brain',
  calcaneo: 'calcaneus',
  astragalo: 'talus',
  metatarsiano: 'metatarsal',
  metacarpiano: 'metacarpal',
  falange: 'phalanx',
}

/** Convierte la consulta en los términos con los que buscar de verdad. */
export function terminosDeBusqueda(consulta: string): string[] {
  return normalizar(consulta)
    .split(' ')
    .filter(Boolean)
    .map((palabra) => EQUIVALENCIAS[palabra] ?? palabra)
}

export interface ResultadoDeBusqueda {
  pieza: PiezaDelAtlas
  /** Cuanto más alto, más arriba aparece. */
  puntos: number
}

/**
 * Busca piezas por nombre.
 *
 * Exige que **todos** los términos aparezcan: «tibia derecha» no debe devolver
 * las cuarenta piezas que contienen «tibia». Puntúa mejor la coincidencia
 * exacta y el nombre corto, de modo que «Right tibia» gane a «Right anterior
 * tibial recurrent artery».
 */
export function buscarPiezas(
  catalogo: CatalogoDelAtlas,
  consulta: string,
  limite = 60,
): ResultadoDeBusqueda[] {
  const terminos = terminosDeBusqueda(consulta)
  if (terminos.length === 0) return []

  const resultados: ResultadoDeBusqueda[] = []

  for (const pieza of catalogo.piezas) {
    const nombre = normalizar(pieza.nombre)
    if (!terminos.every((t) => nombre.includes(t))) continue

    let puntos = 0
    // El nombre entero es justo lo buscado.
    if (nombre === terminos.join(' ')) puntos += 100
    // Empieza por el primer término: «Tibia…» antes que «…tibial…».
    if (nombre.startsWith(terminos[0])) puntos += 25
    // Coincidencia de palabra completa, no de trozo.
    const palabras = new Set(nombre.split(' '))
    puntos += terminos.filter((t) => palabras.has(t)).length * 10
    // A igualdad, gana el nombre más corto: suele ser la estructura principal.
    puntos -= Math.min(20, nombre.length / 4)

    resultados.push({ pieza, puntos })
  }

  return resultados.sort((a, b) => b.puntos - a.puntos).slice(0, limite)
}

// --------------------------------------------------------------------- árbol

export interface RamaDelArbol {
  id: string
  nombre: string
  /** Piezas colgadas directamente de esta rama. */
  piezas: PiezaDelAtlas[]
}

export interface ArbolDelAtlas {
  id: string
  nombre: string
  color?: string
  total: number
  ramas: RamaDelArbol[]
}

/**
 * Arma el árbol con el que se navegan las 2.234 piezas.
 *
 * Dos ejes posibles porque responden a dos preguntas distintas: por región
 * —«quiero el miembro inferior derecho»— es como se prepara una operación; por
 * sistema —«quiero solo el esqueleto»— es como se estudia.
 */
export function armarArbol(
  catalogo: CatalogoDelAtlas,
  eje: 'region' | 'sistema',
): ArbolDelAtlas[] {
  const principal = eje === 'region' ? catalogo.regiones : catalogo.sistemas
  const secundario = eje === 'region' ? catalogo.sistemas : catalogo.regiones

  const nombreSecundario = new Map(secundario.map((s) => [s.id, s.nombre]))
  const colores = new Map(catalogo.sistemas.map((s) => [s.id, s.color]))

  return principal
    .map((grupo) => {
      const suyas = catalogo.piezas.filter((p) => p[eje] === grupo.id)
      const porSecundario = new Map<string, PiezaDelAtlas[]>()

      for (const pieza of suyas) {
        const clave = eje === 'region' ? pieza.sistema : pieza.region
        const lista = porSecundario.get(clave) ?? []
        lista.push(pieza)
        porSecundario.set(clave, lista)
      }

      return {
        id: grupo.id,
        nombre: grupo.nombre,
        color: colores.get(grupo.id),
        total: suyas.length,
        ramas: secundario
          .filter((s) => porSecundario.has(s.id))
          .map((s) => ({
            id: s.id,
            nombre: nombreSecundario.get(s.id) ?? s.id,
            piezas: (porSecundario.get(s.id) ?? []).sort((a, b) =>
              a.nombre.localeCompare(b.nombre, 'es'),
            ),
          })),
      }
    })
    .filter((g) => g.total > 0)
}

// ---------------------------------------------------------------- instancias

/**
 * Deja una selección en forma de guardarse.
 *
 * Es la última barrera antes de la base: quita duplicados, descarta
 * identificadores que no existen en el catálogo, pone techo y ordena. Se aplica
 * también en el servidor, porque una acción de servidor es un extremo HTTP y lo
 * que llega es lo que el navegador quiso enviar, no lo que la interfaz ofreció.
 */
export function normalizarSeleccion(
  catalogo: CatalogoDelAtlas,
  piezas: unknown,
  vista: unknown,
): ContenidoDeInstancia {
  const conocidas = new Set(catalogo.piezas.map((p) => p.id))
  const vistas = new Set<string>()
  const salida: ContenidoDeInstancia['piezas'] = []

  if (Array.isArray(piezas)) {
    for (const bruta of piezas) {
      const id =
        typeof bruta === 'string'
          ? bruta
          : bruta && typeof bruta === 'object' && typeof (bruta as { id?: unknown }).id === 'string'
            ? (bruta as { id: string }).id
            : null
      if (!id || vistas.has(id) || !conocidas.has(id)) continue
      vistas.add(id)

      const color =
        bruta && typeof bruta === 'object' ? (bruta as { color?: unknown }).color : undefined
      salida.push({
        id,
        ...(typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}),
      })
      if (salida.length >= MAXIMO_PIEZAS) break
    }
  }

  return {
    version: 1,
    atlas: catalogo.version,
    piezas: salida,
    vista: normalizarVista(vista),
  }
}

/** Una cámara con números finitos, o la de por omisión. */
export function normalizarVista(bruta: unknown): VistaDeInstancia {
  const trio = (valor: unknown, porOmision: [number, number, number]): [number, number, number] => {
    if (!Array.isArray(valor) || valor.length !== 3) return porOmision
    const nums = valor.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
    return nums.every((n) => n !== null)
      ? (nums as [number, number, number])
      : porOmision
  }

  const objeto = (bruta ?? {}) as Record<string, unknown>
  const separacion = objeto.separacion
  return {
    camara: trio(objeto.camara, VISTA_INICIAL.camara),
    objetivo: trio(objeto.objetivo, VISTA_INICIAL.objetivo),
    separacion:
      typeof separacion === 'number' && Number.isFinite(separacion)
        ? Math.min(1, Math.max(0, separacion))
        : 0,
  }
}

/**
 * Qué piezas de una instancia guardada ya no existen en el catálogo actual.
 *
 * Solo puede pasar si se regenera el atlas. Se avisa en vez de descartarlas en
 * silencio: una ficha que pierde media pierna sin decir nada es peor que un
 * aviso.
 */
export function piezasPerdidas(
  catalogo: CatalogoDelAtlas,
  contenido: ContenidoDeInstancia,
): string[] {
  const conocidas = new Set(catalogo.piezas.map((p) => p.id))
  return contenido.piezas.map((p) => p.id).filter((id) => !conocidas.has(id))
}

/** Índice rápido por identificador, para el visor. */
export function indexarPiezas(catalogo: CatalogoDelAtlas): Map<string, PiezaDelAtlas> {
  return new Map(catalogo.piezas.map((p) => [p.id, p]))
}
