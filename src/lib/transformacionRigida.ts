/**
 * El movimiento rígido con que se guarda dónde va un trozo de hueso reducido, sin three (D-304).
 *
 * Vivía en `reduccionAutomatica.ts`, que trae three entero para encajar las caras de corte. Desde P-012 E1 lo escriben
 * también el exportador del atlas, que corre en el servidor, y las reglas de las piezas del caso, que se cargan en el
 * panel: ninguno de los dos dibuja nada, y traer three para validar siete números era pagar la escena por un `if`.
 * `reduccionAutomatica.ts` lo vuelve a exportar tal cual, así que quien ya lo importaba de allí no cambia.
 */

/** Un movimiento rígido: primero el giro (cuaternión) y después la traslación, en las unidades del modelo. */
export interface TransformacionRigida {
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
}

/** Lo que se considera ya en su sitio: no merece guardarse ni moverse. */
export const QUIETO_MM = 0.01
export const QUIETO_GRADOS = 0.01

export const IDENTIDAD: TransformacionRigida = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }

/**
 * La transformación guardada en una pieza del caso, o `null`.
 *
 * Lo que llega de la base no se da por bueno: una fila con un número de menos, o un cuaternión que no es un giro,
 * movería el trozo a cualquier parte, y el residente vería un hueso roto donde el editor dejó uno reducido. Mejor
 * ignorarla y que el trozo se quede donde está en el archivo.
 */
export function transformacionValida(valor: unknown): TransformacionRigida | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  const claves = ['x', 'y', 'z', 'qx', 'qy', 'qz', 'qw'] as const
  if (!claves.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null
  const t = Object.fromEntries(claves.map((k) => [k, v[k] as number])) as unknown as TransformacionRigida
  const largo = Math.hypot(t.qx, t.qy, t.qz, t.qw)
  if (Math.abs(largo - 1) > 1e-3) return null
  return { ...t, qx: t.qx / largo, qy: t.qy / largo, qz: t.qz / largo, qw: t.qw / largo }
}

/** Cuánto gira un cuaternión, en grados. */
export function gradosDelGiro(t: TransformacionRigida): number {
  return (2 * Math.acos(Math.min(1, Math.abs(t.qw))) * 180) / Math.PI
}

/** Si un movimiento guardado es, en la práctica, quedarse quieto: no merece guardarse. */
export function esCasiIdentidad(t: TransformacionRigida, milimetrosPorUnidad: number): boolean {
  return Math.hypot(t.x, t.y, t.z) * milimetrosPorUnidad < QUIETO_MM && gradosDelGiro(t) < QUIETO_GRADOS
}

// ------------------------------------------------- las cuentas, sin three

type Tres = readonly [number, number, number]

/** Gira un vector por el giro de `t` (un cuaternión unitario): v' = v + w·u + q×u, con u = 2·(q×v). */
export function girarConLa(t: Pick<TransformacionRigida, 'qx' | 'qy' | 'qz' | 'qw'>, v: Tres): [number, number, number] {
  const { qx, qy, qz, qw } = t
  const ux = 2 * (qy * v[2] - qz * v[1])
  const uy = 2 * (qz * v[0] - qx * v[2])
  const uz = 2 * (qx * v[1] - qy * v[0])
  return [v[0] + qw * ux + (qy * uz - qz * uy), v[1] + qw * uy + (qz * ux - qx * uz), v[2] + qw * uz + (qx * uy - qy * ux)]
}

/** Dónde acaba un punto: primero el giro y después la traslación, como se aplica en la consola. */
export function aplicarLa(t: TransformacionRigida, p: Tres): [number, number, number] {
  const g = girarConLa(t, p)
  return [g[0] + t.x, g[1] + t.y, g[2] + t.z]
}

/** `a` después de `b`: el punto pasa primero por `b`. */
export function componer(a: TransformacionRigida, b: TransformacionRigida): TransformacionRigida {
  // El producto de Hamilton a·b, y la traslación de b llevada por a.
  const qx = a.qw * b.qx + a.qx * b.qw + a.qy * b.qz - a.qz * b.qy
  const qy = a.qw * b.qy - a.qx * b.qz + a.qy * b.qw + a.qz * b.qx
  const qz = a.qw * b.qz + a.qx * b.qy - a.qy * b.qx + a.qz * b.qw
  const qw = a.qw * b.qw - a.qx * b.qx - a.qy * b.qy - a.qz * b.qz
  const [x, y, z] = aplicarLa(a, [b.x, b.y, b.z])
  const largo = Math.hypot(qx, qy, qz, qw) || 1
  return { x, y, z, qx: qx / largo, qy: qy / largo, qz: qz / largo, qw: qw / largo }
}

/** El movimiento que deshace `t`. */
export function invertir(t: TransformacionRigida): TransformacionRigida {
  const giro = { qx: -t.qx, qy: -t.qy, qz: -t.qz, qw: t.qw }
  const [x, y, z] = girarConLa(giro, [-t.x, -t.y, -t.z])
  return { x, y, z, ...giro }
}

/**
 * El movimiento como lo escribe el taller del atlas —`centro + mover + giro·(p − centro)`, ver `colocarMalla`— en la
 * forma de aquí: el giro es el mismo y la traslación, `centro + mover − giro·centro`.
 */
export function delTaller(centro: Tres, mover: Tres, giro: readonly [number, number, number, number]): TransformacionRigida {
  const largo = Math.hypot(giro[0], giro[1], giro[2], giro[3]) || 1
  const q = { qx: giro[0] / largo, qy: giro[1] / largo, qz: giro[2] / largo, qw: giro[3] / largo }
  const g = girarConLa(q, centro)
  return { x: centro[0] + mover[0] - g[0], y: centro[1] + mover[1] - g[1], z: centro[2] + mover[2] - g[2], ...q }
}

/**
 * El mismo movimiento, contado en un marco corrido `desplazamiento` (el archivo centrado: y' = y − desplazamiento). El
 * giro no cambia; la traslación pasa a `Q·d + t − d`.
 */
export function enUnMarcoCorrido(t: TransformacionRigida, desplazamiento: Tres): TransformacionRigida {
  const [x, y, z] = aplicarLa(t, desplazamiento)
  return { ...t, x: x - desplazamiento[0], y: y - desplazamiento[1], z: z - desplazamiento[2] }
}
