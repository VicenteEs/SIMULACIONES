import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { largoDelOvalMm } from '@/lib/compresion'
import { agujerosDeLaPlacaRectaMm, medidasDeLaPlacaRecta, nombreDeLaPlacaRecta, type PlacaRecta } from '@/lib/placasRectas'

/**
 * El modelo 3D de una placa recta a medida (P-008 E3), generado en el navegador.
 *
 * Sale con la misma forma que un modelo de placa exportado de Blender (`scripts/instrumental/implantes.py`), porque lo
 * que viene después —apoyarla en el hueso, doblarla, atornillar— no distingue uno de otro: una raíz, un nodo
 * `implante` que declara los agujeros en `userData.th` y una malla `placa`, en metros; el ancho por X, el largo por −Z
 * (la Y de Blender) y el grosor por +Y, con la cara que toca el hueso en Y = 0.
 *
 * La lámina es el contorno de la placa con sus agujeros, extruido con un bisel que cierra hacia adentro: en las caras el
 * agujero queda más ancho que en el medio, que es el avellanado donde se asienta la cabeza del tornillo. Lo que no se
 * dibuja: los rebajes de la cara de abajo de las LC-DCP y la rosca de los combinados, que en la escena no se ven.
 */

/** Cada cuánto se toma un punto en los bordes largos. Fino a propósito: la mesa de modelado dobla la malla por sus vértices. */
const PASO_DEL_BORDE_MM = 0.5
const LADOS_DEL_REDONDO = 28
/** Como `suavizar(ob, 38)` en Blender: por debajo de ese ángulo la luz pasa suave de una cara a otra, y por encima hay arista. */
const ANGULO_DE_LA_ARISTA = (38 * Math.PI) / 180

type Punto = [number, number]

function arco(cx: number, cy: number, r: number, desde: number, hasta: number, lados: number): Punto[] {
  const puntos: Punto[] = []
  for (let k = 0; k <= lados; k++) {
    const a = desde + ((hasta - desde) * k) / lados
    puntos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return puntos
}

/** El óvalo de un agujero DCP: dos medios círculos unidos por rectas, alargado a lo largo de la placa. */
function oval(x: number, y: number, ancho: number, largo: number): Punto[] {
  const r = ancho / 2
  const h = Math.max(0, largo / 2 - r)
  return [...arco(x, y + h, r, 0, Math.PI, 14), ...arco(x, y - h, r, Math.PI, 2 * Math.PI, 14)]
}

/**
 * El agujero combinado de una LCP: el redondo de rosca y el oval de compresión solapados, en un ocho. Es la unión de
 * dos círculos: de cada uno se toma el arco que queda fuera del otro.
 */
function ocho(x: number, y: number, tornilloMm: number, pasoMm: number): Punto[] {
  const ra = tornilloMm * 0.6
  const rb = tornilloMm * 0.5 + 0.25
  const ya = y - pasoMm * 0.12
  const yb = y + pasoMm * 0.12
  const yi = (ya + yb) / 2 + (ra * ra - rb * rb) / (2 * (yb - ya))
  const xi = Math.sqrt(ra * ra - (yi - ya) * (yi - ya))
  if (!Number.isFinite(xi) || xi <= 0) return oval(x, y, tornilloMm * 1.2, tornilloMm * 2)
  const enA = Math.atan2(yi - ya, xi)
  const enB = Math.atan2(yi - yb, xi)
  return [...arco(x, ya, ra, Math.PI - enA, 2 * Math.PI + enA, 22).slice(0, -1), ...arco(x, yb, rb, enB, Math.PI - enB, 22).slice(0, -1)]
}

/**
 * El ancho de la placa a la altura `y`. La de reconstrucción se adelgaza entre agujeros (las muescas por donde se dobla)
 * y vuelve a su ancho en cada agujero; las demás son parejas.
 */
function anchoEn(p: PlacaRecta, y: number, primero: number, ultimo: number): number {
  const s = p.sistema
  if (!s.muescas || y <= primero || y >= ultimo) return s.anchoMm
  const fase = ((y - primero) / p.pasoMm) % 1
  return s.anchoMm - 2.4 * 0.9 * (1 - Math.abs(Math.cos(Math.PI * fase)))
}

function contornoDeLaPlaca(p: PlacaRecta, agujeros: [number, number][]): Punto[] {
  const mitad = p.largoMm / 2
  const r = p.sistema.anchoMm / 2
  const primero = agujeros[0][1]
  const ultimo = agujeros[agujeros.length - 1][1]
  const tramos = Math.max(1, Math.ceil((p.largoMm - 2 * r) / PASO_DEL_BORDE_MM))
  const ys = Array.from({ length: tramos + 1 }, (_, k) => -mitad + r + ((p.largoMm - 2 * r) * k) / tramos)
  return [
    ...ys.map((y): Punto => [anchoEn(p, y, primero, ultimo) / 2, y]),
    ...arco(0, mitad - r, r, 0, Math.PI, 20).slice(1, -1),
    ...[...ys].reverse().map((y): Punto => [-anchoEn(p, y, primero, ultimo) / 2, y]),
    ...arco(0, -mitad + r, r, Math.PI, 2 * Math.PI, 20).slice(1, -1),
  ]
}

function contornoDelAgujero(p: PlacaRecta, x: number, y: number): Punto[] {
  const d = p.sistema.tornilloMm
  if (p.sistema.agujero === 'combi') return ocho(x, y, d, p.sistema.pasoMm)
  if (p.sistema.agujero === 'oval') return oval(x, y, d + 0.5, p.sistema.largoDelOvalMm ?? largoDelOvalMm(d))
  return arco(x, y, d / 2 + 0.25, 0, 2 * Math.PI, LADOS_DEL_REDONDO).slice(0, -1)
}

const vectores = (puntos: Punto[]) => puntos.map(([x, y]) => new THREE.Vector2(x, y))

/** La geometría de la placa, en metros y en el marco de un modelo exportado de Blender. */
export function geometriaDeLaPlacaRecta(p: PlacaRecta): THREE.BufferGeometry {
  const agujeros = agujerosDeLaPlacaRectaMm(p)
  const forma = new THREE.Shape(vectores(contornoDeLaPlaca(p, agujeros)))
  for (const [x, y] of agujeros) forma.holes.push(new THREE.Path(vectores(contornoDelAgujero(p, x, y))))
  const grosor = p.sistema.grosorMm
  // El bisel no puede comerse la placa: en la de tercio de caña, de 1 mm, se queda en dos décimas.
  const bisel = Math.min(0.35, grosor * 0.2)
  const extruida = new THREE.ExtrudeGeometry(forma, {
    depth: grosor - 2 * bisel,
    bevelEnabled: true,
    bevelThickness: bisel,
    bevelSize: bisel,
    // Hacia adentro: el contorno del medio es el de la placa, y en las caras el borde se recoge y el agujero se abre.
    bevelOffset: -bisel,
    bevelSegments: 2,
    steps: 1,
  })
  // De Z = −bisel … grosor − bisel a la cara de abajo en 0; y del plano XY de la forma al marco del modelo: (x, y, z) → (x, z, −y).
  extruida.translate(0, 0, bisel)
  extruida.rotateX(-Math.PI / 2)
  const radio = p.sistema.radioDeLaSeccionMm
  if (radio) {
    // La sección de un tercio de tubo: los bordes bajan hacia el hueso, como `radio_curva` en Blender.
    const posiciones = extruida.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < posiciones.count; i++) {
      const x = posiciones.getX(i)
      posiciones.setY(i, posiciones.getY(i) - (x * x) / (2 * radio))
    }
  }
  extruida.scale(0.001, 0.001, 0.001)
  const geometria = toCreasedNormals(extruida, ANGULO_DE_LA_ARISTA)
  extruida.dispose()
  geometria.computeBoundingBox()
  geometria.computeBoundingSphere()
  return geometria
}

/**
 * La placa entera, lista para `prepararHerramienta`: la raíz, el nodo `implante` con sus agujeros declarados como los
 * declara Blender (D-169) y la malla, de titanio como las del catálogo.
 */
export function crearPlacaRecta(p: PlacaRecta): THREE.Group {
  const raiz = new THREE.Group()
  const implante = new THREE.Object3D()
  implante.name = 'implante'
  implante.userData.th = JSON.stringify({
    instrumento: p.sistema.slug,
    nombre: nombreDeLaPlacaRecta(p),
    medidas: medidasDeLaPlacaRecta(p),
    articulaciones: [],
    notas: 'Placa recta generada a medida en el simulador (P-008 E3).',
    agujeros: agujerosDeLaPlacaRectaMm(p),
  })
  const malla = new THREE.Mesh(
    geometriaDeLaPlacaRecta(p),
    // El 'titanio' de `scripts/instrumental/lib.py`: el mismo gris, el mismo brillo.
    new THREE.MeshStandardMaterial({ name: 'titanio', color: '#8D939B', metalness: 1, roughness: 0.36 }),
  )
  malla.name = 'placa'
  implante.add(malla)
  raiz.add(implante)
  return raiz
}
