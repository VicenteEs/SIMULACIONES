/**
 * Lo que se le exige a la piel del atlas (D-224), medido.
 *
 * Lo usan el guion que la escribe (`recalcular-piel.mjs`, que no escribe si no se cumple) y la prueba
 * que la vigila (`tests/unit/geometriaDePiel.test.ts`, que falla si alguien regenera el atlas y se
 * olvida de la piel). Las dos miden con esto mismo: si midieran distinto, el guion podría escribir una
 * piel que la prueba rechaza, o al revés, y ninguna de las dos diría por qué.
 *
 * Qué se exige:
 *
 * - **Lo de dentro queda dentro, con holgura.** Cada vértice y cada centro de triángulo (y en las fascias
 *   generadas, una rejilla de puntos de 3 mm por triángulo: `puntosDeLoDeDentro`) de lo que la piel cubre (`cubiertaPorElCuerpo`: todo menos ojos, labios, uñas y la oreja) está bajo la cáscara
 *   del cuerpo —o bajo la de una oreja— a `HOLGURA_MINIMA` por lo menos. Es la distancia de la malla
 *   interior a la piel, medida desde dentro: medirla desde los vértices de la piel no vería un hueso
 *   que asoma entre dos de ellos.
 * - **La oreja anatómica, dentro de su piel**, a `HOLGURA_DE_LA_OREJA`.
 * - **La cara de dentro de la piel tampoco toca nada**: lo de dentro queda bajo ella a
 *   `HOLGURA_BAJO_LA_CARA_DE_DENTRO`.
 * - **La fascia superficial, por dentro de la piel**, a `HOLGURA_DE_LA_FASCIA_SUPERFICIAL`. No empuja
 *   la piel —se calcula a partir de ella, ver `cubiertaPorElCuerpo`—, así que se mide aparte: si la piel
 *   se rehace y las fascias no, aquí se ve.
 */

import {
  NOMBRE_DE_LA_OREJA,
  SISTEMA_DE_LA_FASCIA_SUPERFICIAL,
  cascarasPorConectividad,
  crearBuscador,
  cubiertaPorElCuerpo,
  filtroDeCercania,
  profundidadBajoLaPiel,
  puntosDeLoDeDentro,
} from './geometriaDePiel.mjs'

/** Lo mínimo que lo de dentro queda bajo la piel del cuerpo. El guion apunta a 2 mm (`HOLGURA` allí). */
export const HOLGURA_MINIMA = 0.001
/** Bajo la piel de la oreja: se genera a 1,2 mm de la oreja, y el suavizado se come algo. */
export const HOLGURA_DE_LA_OREJA = 0.0005
/**
 * Bajo la cara de dentro. Se bajó a 0,1 mm por tres puntos que se quedaban entre 0,13 y 0,18 —dos vasos del índice
 * derecho y uno de la fascia temporal derecha— y con la fascia medida en rejilla uno quedó por encima. No era la cara
 * de dentro: los tres están entre las dos hojas de un pliegue de la de fuera, enterrado, y lo que se medía era su
 * copia. Sin mirar esa copia (ver `crearBuscador`) el más superficial queda a 0,65 mm, y se vuelve a pedir lo de antes.
 */
export const HOLGURA_BAJO_LA_CARA_DE_DENTRO = 0.0002
/**
 * La fascia superficial bajo la piel. `capas.py` la busca a un milímetro de ella, pero sobre una rejilla de 3 mm que
 * en los pliegues la deja asomar, y `fascias/bajo-la-piel.mjs` la hunde o la recorta donde lo hace; lo que se exige es
 * que no asome.
 */
export const HOLGURA_DE_LA_FASCIA_SUPERFICIAL = 0
/** Lo que está más hondo que esto bajo la piel no la toca. */
const ALCANCE = 0.03

/**
 * Separa la piel en sus cáscaras: la del cuerpo (la mayor de volumen positivo), las de las orejas (las
 * demás de volumen positivo) y la cara de dentro (volumen negativo: sus caras miran al cuerpo).
 */
export function cascarasDeLaPiel(pos, idx, vertices) {
  const todas = cascarasPorConectividad(pos, idx, vertices)
  const positivas = todas.filter((c) => c.volumen > 0)
  return {
    cuerpo: positivas[0]?.triangulos ?? new Uint32Array(0),
    orejas: positivas.slice(1).map((c) => c.triangulos),
    dentro: todas.find((c) => c.volumen < 0)?.triangulos ?? null,
  }
}

const darLaVuelta = (tri) => {
  const t = Uint32Array.from(tri)
  for (let i = 0; i < t.length; i += 3) [t[i + 1], t[i + 2]] = [t[i + 2], t[i + 1]]
  return t
}

/**
 * Si la cara de dentro (ya vuelta) es la de fuera con los vértices corridos, cara a cara y en el mismo orden, que es
 * como la escribe `recalcular-piel.mjs`. Solo entonces la cara `t` de una es la de la otra; una piel hecha de otra
 * manera se mide sin esa ayuda, y la prueba dirá si le hacía falta.
 */
function copiaCaraACara(fuera, dentro) {
  if (fuera.length !== dentro.length || !fuera.length) return false
  const corrimiento = dentro[0] - fuera[0]
  for (let i = 0; i < fuera.length; i++) if (dentro[i] - fuera[i] !== corrimiento) return false
  return true
}

/**
 * Mide la piel `pieza` (posiciones, índices y cuántos vértices) contra las `piezas` del catálogo, que
 * se leen con `leer(pieza) → { pos, idx }`. Devuelve si cumple, las líneas que lo cuentan y las medidas.
 *
 * `conLaFasciaSuperficial = false` deja fuera la fascia superficial: lo pide `recalcular-piel.mjs`, que escribe la
 * piel antes de que la fascia se rehaga sobre ella, cuando la que hay en el atlas es todavía la de la piel anterior.
 */
export function comprobarLaPiel({ pieza, piezas, leer, conLaFasciaSuperficial = true }) {
  const { pos, idx, vertices } = pieza
  const { cuerpo, orejas, dentro } = cascarasDeLaPiel(pos, idx, vertices)
  const lineas = []
  const fallos = []

  const verticesDe = (tri) => {
    const usados = new Uint8Array(vertices)
    for (const i of tri) usados[i] = 1
    const p = []
    for (let v = 0; v < vertices; v++) if (usados[v]) p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
    return Float32Array.from(p)
  }
  const verticesDelCuerpo = verticesDe(cuerpo)
  const cerca = filtroDeCercania(verticesDelCuerpo, verticesDelCuerpo.length / 3, ALCANCE)
  const { puntos, origen } = puntosDeLoDeDentro(piezas, leer, cubiertaPorElCuerpo, cerca)
  const n = puntos.length / 3

  const delCuerpo = crearBuscador(pos, cuerpo, { celda: 0.006 })
  const deLasOrejas = orejas.map((tri) => crearBuscador(pos, tri, { celda: 0.004 }))
  // La cara de dentro mira al cuerpo: con las caras al revés, «por debajo» quiere decir lo mismo que en la de fuera.
  // Y no mira lo que copia una cara de fuera enterrada, que está dentro de la piel igual (ver `crearBuscador`).
  const vuelta = dentro ? darLaVuelta(dentro) : null
  const deDentro = vuelta ? crearBuscador(pos, vuelta, { celda: 0.006, tambienEnterradas: copiaCaraACara(cuerpo, vuelta) ? delCuerpo.enterrada : null }) : null

  let peor = Infinity
  let peorBajoLaCaraDeDentro = Infinity
  const porPieza = new Map()
  for (let i = 0; i < n; i++) {
    const x = puntos[i * 3], y = puntos[i * 3 + 1], z = puntos[i * 3 + 2]
    const r = profundidadBajoLaPiel(delCuerpo, x, y, z, ALCANCE, HOLGURA_MINIMA)
    let profundidad = r ? r.profundidad : ALCANCE
    // Junto a la oreja, lo que no queda bajo la cáscara del cuerpo puede quedar bajo la de la oreja.
    // Entonces tampoco se mide contra la cara de dentro, que forra el cuerpo y no la oreja.
    let porLaOreja = false
    if (profundidad < HOLGURA_MINIMA) {
      for (const b of deLasOrejas) {
        const o = profundidadBajoLaPiel(b, x, y, z, ALCANCE, HOLGURA_MINIMA)
        if (o && o.profundidad > profundidad) {
          profundidad = o.profundidad
          porLaOreja = profundidad >= HOLGURA_MINIMA
        }
      }
    }
    peor = Math.min(peor, profundidad)
    if (profundidad < HOLGURA_MINIMA) {
      const nombre = piezas[origen[i]].nombre
      const e = porPieza.get(nombre) ?? { puntos: 0, peor: Infinity }
      e.puntos++
      e.peor = Math.min(e.peor, profundidad)
      porPieza.set(nombre, e)
    }
    if (deDentro && !porLaOreja) {
      const d = profundidadBajoLaPiel(deDentro, x, y, z, ALCANCE, HOLGURA_BAJO_LA_CARA_DE_DENTRO)
      const p = d ? d.profundidad : ALCANCE
      peorBajoLaCaraDeDentro = Math.min(peorBajoLaCaraDeDentro, p)
      if (p < HOLGURA_BAJO_LA_CARA_DE_DENTRO) {
        const e = porPieza.get('(bajo la cara de dentro) ' + piezas[origen[i]].nombre) ?? { puntos: 0, peor: Infinity }
        e.puntos++
        e.peor = Math.min(e.peor, p)
        porPieza.set('(bajo la cara de dentro) ' + piezas[origen[i]].nombre, e)
      }
    }
  }
  lineas.push(`Lo de dentro: ${n.toLocaleString('es-CL')} puntos a menos de ${ALCANCE * 1000} mm de la piel; el más superficial, a ${(peor * 1000).toFixed(2)} mm`)
  if (deDentro) lineas.push(`Bajo la cara de dentro, el más superficial a ${(peorBajoLaCaraDeDentro * 1000).toFixed(2)} mm`)
  for (const [nombre, e] of [...porPieza].sort((a, b) => b[1].puntos - a[1].puntos)) {
    fallos.push({ pieza: nombre, puntos: e.puntos, peor: e.peor })
  }
  for (const f of fallos.slice(0, 12)) lineas.push(`  falla ${f.pieza}: ${f.puntos} puntos, el peor a ${(f.peor * 1000).toFixed(2)} mm`)

  // La oreja anatómica, contra la piel de las orejas.
  let fueraDeLaOreja = 0
  let peorEnLaOreja = Infinity
  for (const p of piezas.filter((q) => q.nombre === NOMBRE_DE_LA_OREJA)) {
    const { pos: po } = leer(p)
    for (let i = 0; i < p.vertices; i++) {
      let mejor = -Infinity
      for (const b of deLasOrejas) {
        const o = profundidadBajoLaPiel(b, po[i * 3], po[i * 3 + 1], po[i * 3 + 2], ALCANCE, HOLGURA_DE_LA_OREJA)
        if (o) mejor = Math.max(mejor, o.profundidad)
      }
      peorEnLaOreja = Math.min(peorEnLaOreja, mejor)
      if (mejor < HOLGURA_DE_LA_OREJA) fueraDeLaOreja++
    }
  }
  lineas.push(`La oreja: ${orejas.length} cáscaras; su vértice más superficial a ${(peorEnLaOreja * 1000).toFixed(2)} mm, ${fueraDeLaOreja} sin ${HOLGURA_DE_LA_OREJA * 1000} mm`)
  if (fueraDeLaOreja > 0) fallos.push({ pieza: NOMBRE_DE_LA_OREJA, puntos: fueraDeLaOreja, peor: peorEnLaOreja })

  // La fascia superficial, contra la piel del cuerpo o la de una oreja, como lo de dentro.
  const superficial = puntosDeLoDeDentro(piezas, leer, (p) => conLaFasciaSuperficial && p.sistema === SISTEMA_DE_LA_FASCIA_SUPERFICIAL, cerca)
  let peorDeLaFascia = Infinity
  let fascia = 0
  for (let i = 0; i < superficial.puntos.length / 3; i++) {
    const x = superficial.puntos[i * 3], y = superficial.puntos[i * 3 + 1], z = superficial.puntos[i * 3 + 2]
    const r = profundidadBajoLaPiel(delCuerpo, x, y, z, ALCANCE, HOLGURA_MINIMA)
    let profundidad = r ? r.profundidad : ALCANCE
    if (profundidad < HOLGURA_DE_LA_FASCIA_SUPERFICIAL) {
      for (const b of deLasOrejas) {
        const o = profundidadBajoLaPiel(b, x, y, z, ALCANCE, HOLGURA_MINIMA)
        if (o) profundidad = Math.max(profundidad, o.profundidad)
      }
    }
    peorDeLaFascia = Math.min(peorDeLaFascia, profundidad)
    if (profundidad < HOLGURA_DE_LA_FASCIA_SUPERFICIAL) fascia++
  }
  if (superficial.puntos.length) {
    lineas.push(`La fascia superficial: ${(superficial.puntos.length / 3).toLocaleString('es-CL')} puntos cerca de la piel; el más superficial a ${(peorDeLaFascia * 1000).toFixed(2)} mm, ${fascia} por fuera`)
  }
  if (fascia > 0) {
    fallos.push({ pieza: '(fascia superficial)', puntos: fascia, peor: peorDeLaFascia })
    lineas.push(`  falla la fascia superficial: ${fascia} puntos por fuera de la piel (¿se pasó scripts/atlas/fascias/bajo-la-piel.mjs?)`)
  }

  return {
    cumple: fallos.length === 0 && orejas.length === 2 && !!dentro,
    lineas,
    medidas: { puntos: n, peor, peorBajoLaCaraDeDentro, peorEnLaOreja, peorDeLaFascia, orejas: orejas.length, fallos },
  }
}
