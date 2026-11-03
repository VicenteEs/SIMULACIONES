/**
 * Dónde mirar, dentro del esqueleto del atlas, para enseñar un segmento en la
 * cabecera de una tarjeta (P-007 E4, D-237).
 *
 * Las tarjetas de la biblioteca de Penpot llevan arriba un recorte del atlas
 * por segmento —el hombro, la rodilla, el pie—. En vez de doce capturas, es una
 * sola, la del esqueleto entero (`capa-hueso.webp`), agrandada y desplazada
 * hasta el segmento: el navegador la descarga una vez para todas las tarjetas,
 * y un segmento que se agregue mañana solo necesita su fila aquí.
 *
 * `x` e `y` son el centro del recorte, en fracciones del ancho y del alto de la
 * captura (0,5 y 0,5 es el ombligo); `zoom`, cuántas veces el ancho de la
 * tarjeta mide la captura. Se ajustaron mirando los recortes sobre la captura
 * de 690 × 1736, en la proporción de la cabecera de la tarjeta (345 × 150): si
 * se rehace cualquiera de las dos, se rehacen también estos números. El lado
 * es el derecho del paciente, que en la captura de frente queda a la izquierda.
 *
 * El zoom es moderado a propósito. La cabecera es ancha y baja, y un hueso
 * largo es alto y estrecho: con más zoom la pierna era dos franjas blancas que
 * no se reconocían. Un poco más de contexto —la otra pierna, la pelvis junto
 * al antebrazo— es lo que hace que se lea de un vistazo qué segmento es.
 *
 * Se busca por nombre sin tildes ni mayúsculas, como `regiones.ts`, porque el
 * nombre del segmento lo escribe una persona. Lo que no está en la tabla no
 * lleva recorte: la tarjeta sale sin cabecera, que es mejor que un recorte del
 * sitio equivocado.
 */
export interface Encuadre {
  x: number
  y: number
  zoom: number
}

const ENCUADRES: Record<string, Encuadre> = {
  hombro: { x: 0.32, y: 0.19, zoom: 1.6 },
  brazo: { x: 0.25, y: 0.27, zoom: 1.4 },
  codo: { x: 0.21, y: 0.34, zoom: 1.6 },
  antebrazo: { x: 0.17, y: 0.42, zoom: 1.4 },
  'muneca y mano': { x: 0.12, y: 0.5, zoom: 1.8 },
  cadera: { x: 0.5, y: 0.46, zoom: 1.3 },
  muslo: { x: 0.43, y: 0.58, zoom: 1.4 },
  rodilla: { x: 0.42, y: 0.71, zoom: 1.6 },
  pierna: { x: 0.43, y: 0.83, zoom: 1.4 },
  'tobillo y pie': { x: 0.42, y: 0.95, zoom: 1.6 },
  columna: { x: 0.5, y: 0.3, zoom: 1.3 },
  'pelvis y acetabulo': { x: 0.5, y: 0.46, zoom: 1.3 },
  'principios generales': { x: 0.5, y: 0.25, zoom: 1 },
}

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

export function encuadreDelSegmento(nombre: unknown): Encuadre | null {
  if (typeof nombre !== 'string') return null
  return ENCUADRES[normalizar(nombre)] ?? null
}
