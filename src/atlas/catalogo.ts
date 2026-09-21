/**
 * Consultas sobre el catálogo del atlas.
 *
 * Todo lo de aquí es puro: entra el catálogo, sale un dato. Se prueba sin
 * navegador y sin base de datos, que es importante porque de estas funciones
 * depende que «déjame solo la tibia derecha» encuentre la tibia derecha entre
 * 2.234 piezas, y que lo que se guarda como instancia sea siempre coherente.
 */

import {
  MAXIMO_DE_TRASLADO,
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
 * Hace falta porque el traumatólogo escribe «fémur» y en el catálogo la pieza
 * se llama «Left femur», y la ve en pantalla como «Fémur izquierdo». El
 * catálogo guarda el nombre ORIGINAL de BodyParts3D; el español que se enseña
 * sale de `src/atlas/nombres-es.json` (ver `src/atlas/nombres.ts`), y lo que
 * compara las dos cosas —`buscarEnEspanol`, en `arbolEnEspanol.ts`— normaliza
 * con esta misma función para que el nombre visible y el original se midan
 * igual.
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
 * Equivalencias español → inglés para buscar sobre el nombre original.
 *
 * `buscarPiezas` busca solo en el nombre que trae el catálogo, que es el
 * original en inglés. Cuando se escribió, era también el único que se
 * enseñaba; hoy la plataforma enseña los nombres traducidos al español
 * (`src/atlas/nombres.ts`, y la declaración en `public/atlas/ATRIBUCION.md`), y
 * buscar por el nombre en español lo hace `casaConLaBusqueda`. Estas
 * equivalencias siguen haciendo falta para lo que esa no alcanza: las
 * estructuras que todavía no tienen traducción —se enseñan en inglés, y
 * escribir «arteria» tiene que encontrarlas— y quien mezcla, escribiendo en
 * español una palabra de un nombre que solo existe en inglés. Quitarlas sería
 * que buscar en español dejara de funcionar justo donde no hay español.
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
        ...transformacionLimpia(bruta),
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

/**
 * El movimiento y el giro de una pieza, solo si llegan bien formados y dicen
 * algo.
 *
 * Llega del navegador, como todo lo demás de esta función. Un traslado con un
 * `NaN` dejaba la pieza sin dibujar —el sombreador suma el `NaN` a cada
 * vértice— y uno de kilómetros la sacaba de toda cámara posible; un cuaternión
 * sin normalizar no gira: deforma. Lo que no mueve nada no se guarda, para que
 * una preparación de dos mil piezas quietas pese lo que pesaba.
 */
function transformacionLimpia(bruta: unknown): Pick<ContenidoDeInstancia['piezas'][number], 'mover' | 'girar'> {
  if (!bruta || typeof bruta !== 'object') return {}
  const { mover, girar } = bruta as { mover?: unknown; girar?: unknown }
  const numeros = (valor: unknown, cuantos: number): number[] | null =>
    Array.isArray(valor) &&
    valor.length === cuantos &&
    valor.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (valor as number[])
      : null
  const redondo = (n: number, cifras: number) => {
    const escala = 10 ** cifras
    // El `|| 0` convierte el −0 en 0: en JSON se escribe «-0» y no se compara
    // igual que lo que se guardó.
    return Math.round(n * escala) / escala || 0
  }

  const salida: Pick<ContenidoDeInstancia['piezas'][number], 'mover' | 'girar'> = {}

  const t = numeros(mover, 3)
  if (t) {
    // A décimas de milímetro, que es más de lo que se distingue en pantalla.
    const acotado = t.map((n) =>
      redondo(Math.min(MAXIMO_DE_TRASLADO, Math.max(-MAXIMO_DE_TRASLADO, n)), 4),
    ) as [number, number, number]
    if (acotado.some((n) => n !== 0)) salida.mover = acotado
  }

  const q = numeros(girar, 4)
  if (q) {
    const largo = Math.hypot(q[0], q[1], q[2], q[3])
    if (largo > 1e-6) {
      // Con la W positiva: q y −q son el mismo giro, y así dos guardados del
      // mismo giro se escriben igual.
      const signo = q[3] < 0 ? -1 : 1
      const unitario = q.map((n) => redondo((n / largo) * signo, 6)) as [
        number,
        number,
        number,
        number,
      ]
      if (unitario[0] !== 0 || unitario[1] !== 0 || unitario[2] !== 0) salida.girar = unitario
    }
  }
  return salida
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

