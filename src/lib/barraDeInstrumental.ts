/**
 * La mesa de instrumental de la columna izquierda (P-008 E6): el dibujo y el rótulo corto de cada familia, dónde se
 * despliega su lista y los últimos instrumentos cogidos.
 *
 * Antes la bandeja era una pila de acordeones en la columna derecha, debajo del paso: diez cabeceras de ancho
 * completo, de las que solo se leía el nombre, y la que estaba abierta empujaba «Aplicar paso» fuera de la vista. Un
 * traumatólogo no busca así en la mesa: mira la mesa entera, va a la zona de los separadores y de ahí saca el que
 * quiere. Por eso cada familia es ahora un cuadro con su dibujo, todas a la vista a la vez, y al pinchar uno se
 * despliega su lista justo debajo.
 *
 * Sin imports, como `instrumental.ts`: lo leen la consola y las pruebas.
 */

/**
 * El dibujo de `IconoInstrumento` que representa a cada familia. Los de «periostio», «fijacion» y «modelado» se
 * dibujaron para esto (`elevador`, `broca`, `placa-curva`): con el genérico, tres de los doce cuadros eran la misma
 * raya y había que leerlos.
 */
export const ICONO_DE_LA_FAMILIA: Readonly<Record<string, string>> = {
  corte: 'bisturi',
  suturas: 'aguja',
  exposicion: 'separador',
  periostio: 'elevador',
  reduccion: 'pinza',
  fijacion: 'broca',
  modelado: 'placa-curva',
  enclavado: 'fresa',
  placas: 'placa',
  tornillos: 'tornillo',
  clavos: 'clavo',
  injerto: 'injerto',
}

/**
 * El rótulo del cuadro, de una palabra: caben tres cuadros a lo ancho de la columna y «Periostótomos y elevadores» no
 * cabe en un tercio. El nombre entero va en el `title` del cuadro y en la cabecera de la lista que despliega.
 *
 * Cada rótulo es una palabra del nombre entero, que es el que oye el lector de pantalla: quien dice en voz alta lo que
 * ve escrito («Elevadores») tiene que dar con el botón. Por eso no «Periostio», que no está en «Periostótomos y
 * elevadores».
 */
export const ROTULO_DE_LA_FAMILIA: Readonly<Record<string, string>> = {
  corte: 'Corte',
  suturas: 'Suturas',
  exposicion: 'Separadores',
  periostio: 'Elevadores',
  reduccion: 'Reducción',
  fijacion: 'Perforación',
  modelado: 'Modelado',
  enclavado: 'Enclavado',
  placas: 'Placas',
  tornillos: 'Tornillos',
  clavos: 'Clavos',
  injerto: 'Injerto',
}

/** Cuadros por fila. Fijo y no `auto-fill`: la lista se despliega al final de la fila del cuadro pinchado, y para saber cuál es esa fila hay que saber cuántos caben. */
export const COLUMNAS_DE_LA_MESA = 3

/**
 * Detrás de qué cuadro va la lista de la familia `indice`: el último de su fila, o el último de todos si la fila no se
 * llena. Así la lista sale justo debajo del cuadro que se pinchó, y no al final de la mesa, a cuatro filas de él.
 */
export function finDeLaFila(indice: number, total: number, columnas = COLUMNAS_DE_LA_MESA): number {
  return Math.min(total - 1, Math.floor(indice / columnas) * columnas + columnas - 1)
}

/** Cuántos instrumentos recuerda la mesa como «recientes». Se enseñan uno menos: el de la mano no se ofrece. */
export const MAXIMO_DE_RECIENTES = 5

/**
 * Los recientes con `id` delante, sin repetirlo y con tope. Es lo que más se repite en pabellón: broca, medidor,
 * destornillador, y otra vez la broca; o el bisturí y el separador. Con la lista a un clic, ir y volver entre dos
 * instrumentos no obliga a abrir su familia cada vez.
 */
export function anotarReciente(recientes: readonly string[], id: string, maximo = MAXIMO_DE_RECIENTES): string[] {
  return [id, ...recientes.filter((r) => r !== id)].slice(0, maximo)
}
