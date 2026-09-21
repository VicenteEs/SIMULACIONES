/**
 * El otro lado del cuerpo: qué pieza es la contralateral de cada una, y cómo se
 * refleja lo que se le haya hecho (D-136).
 *
 * Sirve para armar una fractura en la pierna derecha y pasarla a la izquierda
 * sin rehacerla. Se apoya en dos cosas que el atlas cumple y que aquí se
 * comprueban en vez de darse por buenas: los nombres de BodyParts3D dicen el
 * lado («Right tibia», «Left tibia»), y el modelo es simétrico respecto del
 * plano X = 0, de modo que la caja de una pieza, reflejada, es la de su pareja.
 *
 * Sin three: lo usa el taller.
 */

import type { CatalogoDelAtlas, PiezaDelAtlas } from './formato'

/** El nombre con el lado cambiado, o `null` si el nombre no dice lado. */
export function nombreDelOtroLado(nombre: string): string | null {
  let cambiado = false
  const otro = nombre.replace(/\b(right|left)\b/gi, (lado) => {
    cambiado = true
    const aDerecha = lado.toLowerCase() === 'left'
    const nuevo = aDerecha ? 'right' : 'left'
    // Se respeta la mayúscula: «Right tibia» ↔ «Left tibia».
    return lado[0] === lado[0].toUpperCase() ? nuevo[0].toUpperCase() + nuevo.slice(1) : nuevo
  })
  return cambiado ? otro : null
}

/** Cuánto se parece la caja de `a`, reflejada en X, a la de `b`: la mayor diferencia entre sus seis caras, en metros. */
function diferenciaReflejada(a: PiezaDelAtlas, b: PiezaDelAtlas): number {
  const [aMin, aMax] = a.caja
  const [bMin, bMax] = b.caja
  return Math.max(
    Math.abs(-aMax[0] - bMin[0]),
    Math.abs(-aMin[0] - bMax[0]),
    Math.abs(aMin[1] - bMin[1]),
    Math.abs(aMax[1] - bMax[1]),
    Math.abs(aMin[2] - bMin[2]),
    Math.abs(aMax[2] - bMax[2]),
  )
}

/**
 * Hasta dónde se acepta que dos cajas «son la misma reflejada»: dos centímetros.
 *
 * Medido sobre el catálogo: las extremidades son espejos exactos —tibia, fémur,
 * húmero y rótula difieren en décimas de milímetro—, y 1.169 de las 1.744 piezas
 * con lado casan por debajo de medio centímetro. Con dos entran 142 más, que son
 * la misma estructura de un cuerpo que no es del todo simétrico. Por encima ya
 * no: los ojos y el tronco se apartan cinco centímetros de su reflejo, y ahí
 * «la pareja» sería otra cosa con el mismo nombre.
 */
const HOLGURA_DE_PAREJA = 0.02

/**
 * La pareja contralateral de cada pieza que la tiene.
 *
 * El nombre no basta: 243 nombres del catálogo se repiten («Dorsal digital
 * artery of foot», una por dedo), así que entre las candidatas por nombre se
 * elige la de caja reflejada más parecida, y si ninguna se parece lo bastante
 * no hay pareja. Lo que no tiene lado —el esternón, las vértebras— no aparece
 * en el mapa, y quien lo use lo deja donde está.
 */
export function parejasContralaterales(catalogo: CatalogoDelAtlas): Map<string, string> {
  const porNombre = new Map<string, PiezaDelAtlas[]>()
  for (const pieza of catalogo.piezas) {
    const lista = porNombre.get(pieza.nombre)
    if (lista) lista.push(pieza)
    else porNombre.set(pieza.nombre, [pieza])
  }
  const parejas = new Map<string, string>()
  for (const pieza of catalogo.piezas) {
    const otroNombre = nombreDelOtroLado(pieza.nombre)
    if (!otroNombre) continue
    let mejor: PiezaDelAtlas | null = null
    let menor = HOLGURA_DE_PAREJA
    for (const candidata of porNombre.get(otroNombre) ?? []) {
      const diferencia = diferenciaReflejada(pieza, candidata)
      if (diferencia <= menor) {
        menor = diferencia
        mejor = candidata
      }
    }
    if (mejor) parejas.set(pieza.id, mejor.id)
  }
  return parejas
}

type Trio = [number, number, number]
type Cuarteto = [number, number, number, number]

/** Un punto o un desplazamiento, al otro lado del plano X = 0. */
export const reflejarVector = ([x, y, z]: Readonly<Trio>): Trio => [-x || 0, y, z]

/**
 * Un giro, reflejado. Reflejar en X conjuga el giro con la reflexión: su eje
 * cambia de signo en Y y en Z y conserva la X —es un vector axial—, que en el
 * cuaternión [x, y, z, w] es negar y y z.
 */
export const reflejarGiro = ([x, y, z, w]: Readonly<Cuarteto>): Cuarteto => [x, -y || 0, -z || 0, w]
