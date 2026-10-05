import { hojasDe, piezaDe, type CorteDePieza } from './formato'

/**
 * Qué trozos de las piezas partidas están apagados (D-141).
 *
 * Un hueso recortado deja de ser una malla y pasa a ser trozos —«Tibia
 * derecha_1», «Tibia derecha_2»—, y recortar es quedarse con unos y apagar los
 * otros. Lo apagado de cada pieza se guarda aparte de lo encendido
 * (`apagados`), porque la pieza sigue encendida aunque uno de sus trozos no se
 * vea.
 *
 * Esto vivía dentro del taller. Se saca a un módulo para poder probarlo, porque
 * el fallo que se arregla aquí no da ningún error: la malla vuelve, y entera.
 */

/**
 * Los trozos apagados en su forma buena (D-141): solo trozos que existen, de
 * piezas encendidas, y ninguna pieza con TODOS sus trozos apagados —esa se
 * apaga entera, para que encenderla en el árbol la devuelva completa en vez de
 * encender un hueso que no enseña nada—.
 */
export function ordenarLoEncendido(
  piezas: Set<string>,
  trozos: ReadonlySet<string>,
  cortes: readonly CorteDePieza[],
): { piezas: Set<string>; trozos: Set<string> } {
  if (trozos.size === 0) return { piezas, trozos: new Set() }
  const quedan = new Set<string>()
  const apagadasDelTodo = new Set<string>()
  for (const pieza of new Set([...trozos].map(piezaDe))) {
    if (!piezas.has(pieza)) continue
    const hojas = hojasDe(cortes, pieza)
    const suyas = hojas.filter((hoja) => trozos.has(hoja) && hoja !== pieza)
    if (suyas.length === 0) continue
    if (suyas.length === hojas.length) apagadasDelTodo.add(pieza)
    else for (const hoja of suyas) quedan.add(hoja)
  }
  return {
    piezas:
      apagadasDelTodo.size > 0 ? new Set([...piezas].filter((id) => !apagadasDelTodo.has(id))) : piezas,
    trozos: quedan,
  }
}

/**
 * Los trozos apagados de las piezas que se apagan, para que no se olviden.
 *
 * Es el arreglo de un fallo que contó quien usa el taller: «cuando activo el
 * hueso de nuevo se renueva completo y no solo lo que había recortado». Se
 * recortaba un hueso, se apagaba por su casilla y se volvía a encender, y
 * volvía la malla original entera. La causa está en `ordenarLoEncendido`:
 * descarta los trozos apagados de toda pieza que no está encendida —con razón,
 * para no arrastrar identificadores de piezas que no están—, y con ello también
 * el recuerdo de lo que se había recortado. Al encenderla, ya no había nada
 * apagado.
 *
 * Aquí se devuelven los de las piezas que **pidió apagar** quien llama: las que
 * no están en `pedidas`. No los de una pieza que `ordenarLoEncendido` apaga por
 * sí sola por tener todos sus trozos apagados: esa se apaga entera a propósito y
 * encenderla tiene que devolverla completa.
 *
 * Lo que se guarda en la preparación no cambia: `guardar()` filtra los apagados
 * por las piezas encendidas, así que la copia de la base sigue sin llevar nada
 * de lo que no está.
 */
export function trozosDeLoApagado(
  anteriores: ReadonlySet<string>,
  pedidas: ReadonlySet<string>,
): Set<string> {
  const retenidos = new Set<string>()
  for (const trozo of anteriores) {
    if (!pedidas.has(piezaDe(trozo))) retenidos.add(trozo)
  }
  return retenidos
}

/**
 * Lo encendido y lo apagado tras un cambio, sin olvidar lo recortado de lo que
 * se apaga: `ordenarLoEncendido` más los trozos de `trozosDeLoApagado`.
 */
export function ordenarConMemoria(
  piezas: Set<string>,
  trozos: ReadonlySet<string>,
  cortes: readonly CorteDePieza[],
  anteriores: ReadonlySet<string>,
): { piezas: Set<string>; trozos: Set<string> } {
  const orden = ordenarLoEncendido(piezas, trozos, cortes)
  const retenidos = trozosDeLoApagado(anteriores, piezas)
  if (retenidos.size === 0) return orden
  return { piezas: orden.piezas, trozos: new Set([...orden.trozos, ...retenidos]) }
}
