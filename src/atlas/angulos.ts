/**
 * Del cuaternión que se guarda a los tres ángulos que se leen, y vuelta (D-133).
 *
 * Sin three, a propósito: lo usa el panel de números del taller, que no puede
 * importar three de forma estática (ver `seleccion.ts`). Son las fórmulas de
 * siempre para el orden XYZ —el de Blender por omisión y el de `THREE.Euler`—,
 * de modo que un giro tecleado aquí es el mismo que daría three.
 *
 * Los ángulos de Euler no son únicos y cerca de ±90° en Y se degeneran (el
 * «bloqueo de cardán»): ahí dos de los tres ejes giran sobre lo mismo y la
 * descomposición reparte el giro entre X y Z como puede. No se intenta
 * arreglar: el giro guardado sigue siendo el cuaternión, que no tiene ese
 * problema, y estos números son solo su lectura.
 */

export type Cuaternion = readonly [number, number, number, number]
export type Grados = [number, number, number]

const A_RADIANES = Math.PI / 180

/** Cuaternión [x, y, z, w] de girar `x`, luego `y`, luego `z` grados, en ejes propios (orden XYZ). */
export function cuaternionDeGrados([gx, gy, gz]: Readonly<Grados>): [number, number, number, number] {
  const c1 = Math.cos((gx * A_RADIANES) / 2)
  const c2 = Math.cos((gy * A_RADIANES) / 2)
  const c3 = Math.cos((gz * A_RADIANES) / 2)
  const s1 = Math.sin((gx * A_RADIANES) / 2)
  const s2 = Math.sin((gy * A_RADIANES) / 2)
  const s3 = Math.sin((gz * A_RADIANES) / 2)
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

/** Los tres ángulos, en grados y orden XYZ, de un cuaternión unitario. */
export function gradosDeCuaternion([x, y, z, w]: Cuaternion): Grados {
  // Los tres elementos de la matriz de giro que hacen falta, sin montarla entera.
  const m11 = 1 - 2 * (y * y + z * z)
  const m12 = 2 * (x * y - z * w)
  const m13 = 2 * (x * z + y * w)
  const m22 = 1 - 2 * (x * x + z * z)
  const m23 = 2 * (y * z - x * w)
  const m32 = 2 * (y * z + x * w)
  const m33 = 1 - 2 * (x * x + y * y)

  const gy = Math.asin(Math.max(-1, Math.min(1, m13)))
  let gx: number
  let gz: number
  if (Math.abs(m13) < 0.9999999) {
    gx = Math.atan2(-m23, m33)
    gz = Math.atan2(-m12, m11)
  } else {
    gx = Math.atan2(m32, m22)
    gz = 0
  }
  // El `|| 0` quita el −0, que en un campo de formulario se lee «-0».
  const aGrados = (r: number) => Math.round((r / A_RADIANES) * 100) / 100 || 0
  return [aGrados(gx), aGrados(gy), aGrados(gz)]
}
