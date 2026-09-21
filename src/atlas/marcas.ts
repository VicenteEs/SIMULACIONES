/**
 * Lo que se apunta sobre el modelo: rótulos, distancias y ángulos, y las vistas
 * con nombre de una preparación (D-135).
 *
 * Sin three: lo usan el servidor, para validar lo que se guarda, y el taller,
 * que no puede importar three de forma estática (ver `seleccion.ts`).
 *
 * Los puntos se guardan en el espacio del atlas, en metros, **donde estaban al
 * marcarlos**. No van atados a una pieza: si después se mueve el fragmento, la
 * marca se queda donde se puso. Es una limitación conocida y tiene arreglo
 * barato —marcar al final, que es cuando se mide—; atarlas pediría guardar el
 * punto en el espacio de cada pieza y rehacerlo con cada transformación.
 */

export type Punto = [number, number, number]

export type MarcaDeInstancia =
  | { tipo: 'rotulo'; punto: Punto; texto: string }
  | { tipo: 'distancia'; puntos: [Punto, Punto] }
  /** El vértice del ángulo es el punto del medio. */
  | { tipo: 'angulo'; puntos: [Punto, Punto, Punto] }

export interface VistaConNombre {
  nombre: string
  camara: Punto
  objetivo: Punto
}

export const MAXIMO_DE_MARCAS = 24
export const MAXIMO_DE_VISTAS = 8
export const LARGO_MAXIMO_DE_ROTULO = 80

/** Cuántos puntos pide cada herramienta de marcar. */
export const PUNTOS_POR_MARCA = { rotulo: 1, distancia: 2, angulo: 3 } as const

export function distanciaEnMilimetros(a: Punto, b: Punto): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000
}

/** El ángulo en `vertice`, en grados, entre los segmentos hacia `a` y hacia `b`. */
export function anguloEnGrados(a: Punto, vertice: Punto, b: Punto): number {
  const u = [a[0] - vertice[0], a[1] - vertice[1], a[2] - vertice[2]]
  const v = [b[0] - vertice[0], b[1] - vertice[1], b[2] - vertice[2]]
  const largos = Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2])
  if (largos < 1e-12) return 0
  const coseno = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / largos
  return (Math.acos(Math.max(-1, Math.min(1, coseno))) * 180) / Math.PI
}

/** Lo que se lee junto a una marca. Una sola función, para que el taller y la ficha digan lo mismo. */
export function textoDeLaMarca(marca: MarcaDeInstancia): string {
  if (marca.tipo === 'rotulo') return marca.texto
  if (marca.tipo === 'distancia') {
    return `${distanciaEnMilimetros(marca.puntos[0], marca.puntos[1]).toFixed(1).replace('.', ',')} mm`
  }
  return `${anguloEnGrados(marca.puntos[0], marca.puntos[1], marca.puntos[2]).toFixed(1).replace('.', ',')}°`
}

/** Dónde se escribe el texto de una marca: en el punto, a media distancia o en el vértice. */
export function anclaDeLaMarca(marca: MarcaDeInstancia): Punto {
  if (marca.tipo === 'rotulo') return marca.punto
  if (marca.tipo === 'angulo') return marca.puntos[1]
  const [a, b] = marca.puntos
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

const punto = (valor: unknown): Punto | null =>
  Array.isArray(valor) &&
  valor.length === 3 &&
  // Dentro de un cubo de diez metros: el cuerpo mide dos.
  valor.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10)
    ? (valor.map((n) => Math.round((n as number) * 1e5) / 1e5 || 0) as Punto)
    : null

/**
 * Las marcas que se dejan guardar. Llega del navegador: lo mal formado se
 * descarta pieza a pieza, sin tirar las demás.
 */
export function marcasValidas(brutas: unknown): MarcaDeInstancia[] {
  if (!Array.isArray(brutas)) return []
  const salida: MarcaDeInstancia[] = []
  for (const bruta of brutas) {
    if (!bruta || typeof bruta !== 'object') continue
    const { tipo, punto: uno, puntos, texto } = bruta as Record<string, unknown>
    if (tipo === 'rotulo') {
      const p = punto(uno)
      const limpio = typeof texto === 'string' ? texto.trim().slice(0, LARGO_MAXIMO_DE_ROTULO) : ''
      if (p && limpio) salida.push({ tipo, punto: p, texto: limpio })
    } else if (tipo === 'distancia' || tipo === 'angulo') {
      const cuantos = PUNTOS_POR_MARCA[tipo]
      const limpios = Array.isArray(puntos) ? puntos.map(punto) : []
      if (limpios.length === cuantos && limpios.every((p) => p !== null)) {
        salida.push({ tipo, puntos: limpios as never })
      }
    }
    if (salida.length >= MAXIMO_DE_MARCAS) break
  }
  return salida
}

export function vistasValidas(brutas: unknown): VistaConNombre[] {
  if (!Array.isArray(brutas)) return []
  const salida: VistaConNombre[] = []
  for (const bruta of brutas) {
    if (!bruta || typeof bruta !== 'object') continue
    const { nombre, camara, objetivo } = bruta as Record<string, unknown>
    const c = punto(camara)
    const o = punto(objetivo)
    const limpio = typeof nombre === 'string' ? nombre.trim().slice(0, 40) : ''
    if (c && o && limpio) salida.push({ nombre: limpio, camara: c, objetivo: o })
    if (salida.length >= MAXIMO_DE_VISTAS) break
  }
  return salida
}
