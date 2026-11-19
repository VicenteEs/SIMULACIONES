/**
 * El pabellón entero alrededor de la camilla (pedido del dueño): paredes, techo, piso y el equipo de una sala de
 * operaciones, de `public/pabellon/sala.glb` (lo hace `scripts/pabellon/sala.py`).
 *
 * Aquí está lo que no necesita three ni navegador y por eso se prueba suelto: la tabla de pintura, la cuenta de
 * qué cuelga de qué nombre y la regla que aparta de la vista lo que cuelga del techo cuando se interpone.
 */

/**
 * Cómo se repinta el pabellón sin tocar Blender: nombre del material del `.glb` → color. Lo que no está aquí queda
 * como lo pintó el guion, y los colores de fábrica viven en la tabla `PINTURA` de `scripts/pabellon/sala.py`.
 *
 * Los materiales repintables empiezan por `pintura-` (`pintura-pared`, `pintura-zocalo`, `pintura-techo`,
 * `pintura-puerta`, `pintura-mueble`…). Se puede repintar cualquier otro por su nombre, pero un acero o un vidrio
 * llevan además rugosidad y reflejo, y cambiarles solo el color rara vez da lo que se quiere.
 *
 * Es una tabla y no una pantalla de ajustes porque es una decisión de quien mantiene la plataforma: pintar una pared
 * de otro color es una línea, y un cambio de color que cada residente fuera tocando haría que dos pantallas del mismo
 * caso no se parecieran.
 */
export const PINTURA_DEL_PABELLON: Readonly<Record<string, string>> = {}

/** El color con que hay que pintar ese material, o `undefined` si se queda como viene del archivo. */
export function colorDeLaPintura(material: string, tabla: Readonly<Record<string, string>> = PINTURA_DEL_PABELLON): string | undefined {
  const color = tabla[material]
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined
}

/** Lo que cuelga del techo (cialíticas, brazos, columnas con monitores) se llama así en el `.glb`. */
export const PREFIJO_DE_LO_QUE_CUELGA = 'colgante-'

/** Los materiales que reciben la sombra de la lámpara: el piso (lo demás no, y ninguno la echa). */
export function recibeSombra(material: string): boolean {
  return material.startsWith('piso')
}

/**
 * Si algo que cuelga del techo estorba, mirando desde la cámara al punto que se mira. Una cialítica sobre la camilla
 * es lo que hay en un pabellón, pero con la vista cenital el cabezal de medio metro queda justo entre el ojo y la
 * herida. Se aparta cuando el segmento de la cámara al punto pasa a menos de su radio, y no se vuelve a poner hasta
 * que pasa a bastante más: sin esa holgura, un cabezal en el borde del cono parpadearía con cada píxel de arrastre.
 *
 * Todo en las mismas unidades (metros de la sala). Devuelve la distancia del centro al segmento.
 */
export function distanciaAlSegmento(
  centro: readonly [number, number, number],
  desde: readonly [number, number, number],
  hasta: readonly [number, number, number],
): number {
  const dx = hasta[0] - desde[0]
  const dy = hasta[1] - desde[1]
  const dz = hasta[2] - desde[2]
  const largo2 = dx * dx + dy * dy + dz * dz
  // Sin segmento (la cámara en el punto que mira) no hay nada entre los dos.
  const t = largo2 > 0 ? Math.min(1, Math.max(0, ((centro[0] - desde[0]) * dx + (centro[1] - desde[1]) * dy + (centro[2] - desde[2]) * dz) / largo2)) : 0
  return Math.hypot(centro[0] - (desde[0] + dx * t), centro[1] - (desde[1] + dy * t), centro[2] - (desde[2] + dz * t))
}

/** Cuánto más allá del radio hay que estar para que vuelva a verse: ver `distanciaAlSegmento`. */
export const HOLGURA_PARA_VOLVER = 1.35
/** Cuánto antes del radio se aparta: una cialítica rozando el borde de la imagen ya estorba. */
export const HOLGURA_PARA_APARTAR = 1.05

/** ¿Debe estar apartado ahora? Con la distancia al segmento, el radio de lo que cuelga y si ya lo estaba. */
export function debeApartarse(distancia: number, radio: number, apartado: boolean): boolean {
  return apartado ? distancia < radio * HOLGURA_PARA_VOLVER : distancia < radio * HOLGURA_PARA_APARTAR
}
