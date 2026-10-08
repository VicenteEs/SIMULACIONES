/**
 * Lo que un modelo de instrumental lleva escrito dentro (D-165).
 *
 * Cada `.glb` que sale de `scripts/instrumental/` trae, en el `extras` de sus
 * nodos, una cadena JSON bajo la clave `th`:
 *
 *  - en la **raíz**: de qué instrumento es, sus medidas y las articulaciones que
 *    declara («Apertura», 0 a 42°);
 *  - en cada **pivote**: a qué articulación obedece, sobre qué eje, con qué
 *    factor y de qué tipo (gira o se desliza).
 *
 * Una cadena y no un objeto porque el exportador de glTF trata distinto, según
 * la versión de Blender, los diccionarios anidados de las propiedades
 * personalizadas; una cadena viaja igual en todas.
 *
 * Aquí está la lectura y la matemática, sin three: la usan el taller (para
 * dibujar los deslizadores), el visor del simulador y las pruebas. El eje viene
 * ya en las coordenadas de glTF (Y arriba), y el nodo gira alrededor de su propio
 * origen, que es el eje de la articulación: no hay cuentas de posición que hacer.
 */

export type Vector3 = [number, number, number]
export type Cuaternion = [number, number, number, number]

export interface ArticulacionDeclarada {
  nombre: string
  etiqueta: string
  min: number
  max: number
  unidad: '°' | 'mm'
  inicial: number
}

export interface MetaDeRaiz {
  instrumento: string
  nombre: string
  medidas: string
  articulaciones: ArticulacionDeclarada[]
  notas: string
}

export interface MetaDeNodo {
  /** La articulación a la que obedece. */
  mueve: string
  tipo: 'giro' | 'desliza'
  /** Unitario, en las coordenadas del archivo. */
  eje: Vector3
  /** Cuánto de la articulación recibe, con signo: dos ramas de una pinza van con +0,5 y −0,5. */
  factor: number
}

function leerTh(extras: unknown): Record<string, unknown> | null {
  if (!extras || typeof extras !== 'object') return null
  const cruda = (extras as { th?: unknown }).th
  if (typeof cruda !== 'string') return null
  try {
    const valor = JSON.parse(cruda)
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const numero = (v: unknown, defecto = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : defecto)

export function metaDeRaiz(extras: unknown): MetaDeRaiz | null {
  const th = leerTh(extras)
  if (!th || typeof th.instrumento !== 'string') return null
  const articulaciones = Array.isArray(th.articulaciones)
    ? (th.articulaciones as unknown[]).flatMap((a): ArticulacionDeclarada[] => {
        if (!a || typeof a !== 'object') return []
        const x = a as Record<string, unknown>
        if (typeof x.nombre !== 'string') return []
        return [
          {
            nombre: x.nombre,
            etiqueta: typeof x.etiqueta === 'string' ? x.etiqueta : x.nombre,
            min: numero(x.min, 0),
            max: numero(x.max, 1),
            unidad: x.unidad === 'mm' ? 'mm' : '°',
            inicial: numero(x.inicial, 0),
          },
        ]
      })
    : []
  return {
    instrumento: th.instrumento,
    nombre: typeof th.nombre === 'string' ? th.nombre : th.instrumento,
    medidas: typeof th.medidas === 'string' ? th.medidas : '',
    articulaciones,
    notas: typeof th.notas === 'string' ? th.notas : '',
  }
}

export function metaDeNodo(extras: unknown): MetaDeNodo | null {
  const th = leerTh(extras)
  if (!th || typeof th.mueve !== 'string') return null
  const eje = Array.isArray(th.eje) && th.eje.length === 3 ? (th.eje as unknown[]).map((v) => numero(v)) : null
  if (!eje) return null
  const largo = Math.hypot(eje[0], eje[1], eje[2])
  if (largo < 1e-9) return null
  return {
    mueve: th.mueve,
    tipo: th.tipo === 'desliza' ? 'desliza' : 'giro',
    eje: [eje[0] / largo, eje[1] / largo, eje[2] / largo],
    factor: numero(th.factor, 1),
  }
}

/** Cuaternión de un giro de `radianes` alrededor de un eje unitario. */
export function cuaternionDeEje(eje: Vector3, radianes: number): Cuaternion {
  const s = Math.sin(radianes / 2)
  return [eje[0] * s, eje[1] * s, eje[2] * s, Math.cos(radianes / 2)]
}

/** Producto de cuaterniones: primero `b`, después `a`. */
export function multiplicarCuaterniones(a: Cuaternion, b: Cuaternion): Cuaternion {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/**
 * Cuánto se mueve un nodo cuando su articulación vale `valor`.
 *
 * Un giro, en grados, da un cuaternión alrededor del eje del nodo; un
 * desplazamiento, en milímetros, da metros a lo largo del eje. El resultado se
 * **suma** a la pose con que el nodo viene en el archivo: el giro se compone a
 * la izquierda y el desplazamiento se añade a su posición.
 */
export function movimientoDelNodo(
  meta: MetaDeNodo,
  valor: number,
): { girar: Cuaternion; mover: Vector3 } {
  const v = valor * meta.factor
  if (meta.tipo === 'desliza') {
    const m = v / 1000
    return { girar: [0, 0, 0, 1], mover: [meta.eje[0] * m, meta.eje[1] * m, meta.eje[2] * m] }
  }
  return { girar: cuaternionDeEje(meta.eje, (v * Math.PI) / 180), mover: [0, 0, 0] }
}

// ------------------------------------------------------------------ retoques

/**
 * Lo que el administrador corrige de un modelo en el taller y se guarda con el
 * instrumento (`instrumental.ajustes`).
 *
 * Se guarda por **nombre de nodo** y no por posición: el archivo se puede
 * volver a subir con otro orden de nodos y el retoque sigue valiendo, mientras
 * la pieza se llame igual.
 */
export interface RetoqueDeParte {
  /** La parte no se dibuja: una ranura que sobra, un cable que estorba. */
  ocultar?: boolean
  /** Color propio, `#rrggbb`. */
  color?: string
  /** Cuánto se corrió respecto del archivo, en metros. */
  mover?: Vector3
  /** Giro adicional sobre su origen, cuaternión unitario. */
  girar?: Cuaternion
}

export interface AjustesDeInstrumento {
  partes?: Record<string, RetoqueDeParte>
  /** El valor con que se abre cada articulación, en su unidad. */
  articulaciones?: Record<string, number>
}

export const MAXIMO_DE_PARTES_RETOCADAS = 200
const MAXIMO_DE_TRASLADO_DE_PARTE = 0.5 // metros: un instrumento mide menos que eso

/** Deja los ajustes en forma de guardarse; lo que no sirve se descarta. Llega del navegador: no se le cree. */
export function ajustesValidos(bruto: unknown): AjustesDeInstrumento {
  if (!bruto || typeof bruto !== 'object') return {}
  const entrada = bruto as { partes?: unknown; articulaciones?: unknown }
  const salida: AjustesDeInstrumento = {}

  if (entrada.partes && typeof entrada.partes === 'object' && !Array.isArray(entrada.partes)) {
    const partes: Record<string, RetoqueDeParte> = {}
    for (const [nombre, valor] of Object.entries(entrada.partes as Record<string, unknown>)) {
      if (Object.keys(partes).length >= MAXIMO_DE_PARTES_RETOCADAS) break
      if (!nombre || nombre.length > 120 || !valor || typeof valor !== 'object') continue
      const v = valor as Record<string, unknown>
      const retoque: RetoqueDeParte = {}
      if (v.ocultar === true) retoque.ocultar = true
      if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) retoque.color = v.color.toLowerCase()
      if (
        Array.isArray(v.mover) &&
        v.mover.length === 3 &&
        v.mover.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAXIMO_DE_TRASLADO_DE_PARTE)
      ) {
        const m = v.mover as Vector3
        if (m.some((n) => Math.abs(n) > 1e-7)) retoque.mover = m
      }
      if (Array.isArray(v.girar) && v.girar.length === 4 && v.girar.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        const q = v.girar as Cuaternion
        const largo = Math.hypot(q[0], q[1], q[2], q[3])
        if (largo > 1e-6) {
          const u: Cuaternion = [q[0] / largo, q[1] / largo, q[2] / largo, q[3] / largo]
          if (Math.abs(u[0]) + Math.abs(u[1]) + Math.abs(u[2]) > 1e-6) retoque.girar = u
        }
      }
      if (Object.keys(retoque).length > 0) partes[nombre] = retoque
    }
    if (Object.keys(partes).length > 0) salida.partes = partes
  }

  if (entrada.articulaciones && typeof entrada.articulaciones === 'object' && !Array.isArray(entrada.articulaciones)) {
    const art: Record<string, number> = {}
    for (const [nombre, valor] of Object.entries(entrada.articulaciones as Record<string, unknown>)) {
      if (Object.keys(art).length >= 20) break
      if (nombre && nombre.length <= 60 && typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= 1e4) art[nombre] = valor
    }
    if (Object.keys(art).length > 0) salida.articulaciones = art
  }
  return salida
}

/** ¿Hay algo retocado? Para el contador del listado y para no guardar un objeto vacío. */
export function hayRetoques(a: AjustesDeInstrumento | null | undefined): boolean {
  return !!a && (Object.keys(a.partes ?? {}).length > 0 || Object.keys(a.articulaciones ?? {}).length > 0)
}
