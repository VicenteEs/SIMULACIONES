/**
 * Con qué se reconoce una fila o un bloque del formulario aunque cambie de
 * sitio, y cómo escribir en él sabiendo solo eso.
 *
 * Vivía dentro de `components/admin/formulario/Campos.tsx` mientras solo lo
 * usaba el `key` de React. Salió de ahí cuando lo necesitó también la subida de
 * un archivo, que puede terminar con su bloque plegado o movido de sitio: la
 * identidad que decide qué se pinta y la que decide dónde se apunta el archivo
 * tienen que ser la misma, y aquí se pueden probar sin montar el componente.
 */

export type Fila = Record<string, unknown>

/**
 * Clave de reconciliación propia del cliente.
 *
 * El `id` de una fila o de un bloque lo pone Payload al guardar, así que todo
 * lo que nace en la sesión no tiene ninguno y React reconciliaba por posición.
 * Para los `<input>` y los `<select>` eso no se notaba —son controlados y su
 * valor viene del arreglo—, pero `EditorTextoRico` siembra TipTap una sola vez
 * al construirse: al subir un paso con la flecha, el título y la fase se
 * intercambiaban y los dos textos ricos se quedaban quietos, de modo que el
 * paso ahora titulado «Reducción» enseñaba la descripción del abordaje. Y en
 * cuanto se tocaba ese editor, `onUpdate` escribía el texto viejo encima de la
 * fila que había pasado a ocupar el sitio.
 *
 * **No puede llamarse `id`**: `depurarCampo` conserva esa clave tal cual para
 * filas y bloques (`src/admin/depurar.ts`) y acabaría en la clave primaria de
 * PostgreSQL. Con cualquier otro nombre no viaja: `depurarCampos` reconstruye
 * la salida recorriendo los campos del esquema, y lo que no está descrito no
 * existe.
 */
export const CLAVE_DE_FILA = '_clave'

let contadorDeClaves = 0
/**
 * Solo tiene que distinguir hermanos dentro de una página viva, así que un
 * contador basta y evita depender de `crypto.randomUUID()`, que exige contexto
 * seguro y no lo hay al abrir el panel por http en una máquina de la red.
 */
export const nuevaClave = (): string => `c${++contadorDeClaves}`

/**
 * La identidad que no depende de la posición, si la fila tiene alguna.
 *
 * Devuelve `null` en vez de inventarse una: quien la pide para escribir
 * —`conCampoEnElBloque`— tiene que poder negarse, porque escribir «en el
 * tercero» después de un reordenamiento es escribir en otro bloque.
 */
export function claveEstable(fila: Fila): string | null {
  const id = fila.id
  if (typeof id === 'string' || typeof id === 'number') return `id-${id}`
  const propia = fila[CLAVE_DE_FILA]
  return typeof propia === 'string' ? propia : null
}

/** Con qué se identifica una fila o un bloque en el `key` de React. */
export function claveDe(fila: Fila, indice: number): string {
  // Último recurso, y con el mismo problema de siempre: una fila que llega del
  // servidor sin `id` y sin haber pasado por «+ Agregar» vuelve a reconciliarse
  // por posición. Payload numera todas las suyas, así que en la práctica no
  // ocurre; si alguna vez ocurre, el síntoma es el del comentario de
  // `CLAVE_DE_FILA`.
  return claveEstable(fila) ?? `pos-${indice}`
}

/**
 * Los bloques con `nombre` puesto a `valor` en el que tiene esa clave, esté
 * donde esté ahora; `null` si ya no hay ninguno.
 *
 * `null` y no el arreglo sin tocar, para que quien llama sepa que no escribió
 * nada: un bloque quitado durante la subida no debe resucitar, y tampoco debe
 * decirse que el archivo quedó elegido.
 */
export function conCampoEnElBloque(
  bloques: readonly Fila[],
  clave: string,
  nombre: string,
  valor: unknown,
): Fila[] | null {
  const indice = bloques.findIndex((bloque) => claveEstable(bloque) === clave)
  if (indice < 0) return null
  return bloques.map((bloque, j) => (j === indice ? { ...bloque, [nombre]: valor } : bloque))
}

/**
 * Qué clave del cliente pasa a llamarse cómo, cuando un guardado les pone `id`
 * a los bloques recién creados: pares `[c7, id-6650…]`.
 *
 * Hace falta porque la clave de un bloque nuevo no sobrevive al guardado. Tras
 * «Guardar borrador» sin cambios durante el viaje, `FormularioDocumento` toma
 * el documento del servidor entero, y los bloques vuelven con `id` y sin
 * `_clave` —`_clave` no viaja, por diseño: ver `CLAVE_DE_FILA`—. Sin este
 * puente, `claveEstable` pasaba de `c7` a `id-…` y una subida que se llevó `c7`
 * al empezar terminaba sin encontrar su bloque: archivo subido y bloque en
 * «— ninguno —», que es el mismo fallo que la clave vino a quitar. Y es de lo
 * más normal: se añade una imagen, se empieza a subir, y mientras sube se
 * guarda. El servidor lo acepta con el archivo vacío, porque un borrador no
 * exige la ficha entera (D-011).
 *
 * Se empareja **por posición**, y por eso es todo o nada. Payload devuelve los
 * bloques en el orden en que se mandaron, y con cambios sin guardar el
 * formulario no toma nada del servidor, así que entre lo enviado y lo recibido
 * no puede haberse movido nada desde esta pantalla. Pero en cuanto una sola
 * posición no cuadra —otro largo, otro tipo de bloque, un `id` que ya estaba y
 * ahora es otro— la lista no es la misma en el mismo orden, y emparejar las
 * demás sería apostar: se devuelve vacío. Lo que cuesta equivocarse aquí es
 * apuntar el archivo en otro bloque, y eso es peor que no apuntarlo.
 */
export function clavesQueRecibieronId(
  anteriores: readonly Fila[],
  nuevos: readonly Fila[],
): [string, string][] {
  if (anteriores === nuevos || anteriores.length !== nuevos.length) return []
  const pares: [string, string][] = []
  for (let i = 0; i < anteriores.length; i += 1) {
    const antes = anteriores[i]
    const ahora = nuevos[i]
    if (antes.blockType !== ahora.blockType) return []
    const idAntes = claveDelId(antes)
    const idAhora = claveDelId(ahora)
    if (idAntes !== null) {
      if (idAntes !== idAhora) return []
      continue
    }
    const propia = antes[CLAVE_DE_FILA]
    if (typeof propia === 'string' && idAhora !== null) pares.push([propia, idAhora])
  }
  return pares
}

const claveDelId = (fila: Fila): string | null =>
  typeof fila.id === 'string' || typeof fila.id === 'number' ? `id-${fila.id}` : null

/**
 * Lo último que pintó un editor de bloques: el arreglo, con qué reemplazarlo y
 * cómo se llaman ahora las claves que un guardado cambió
 * (`clavesQueRecibieronId`). `null` cuando el editor ya no está montado.
 */
export type BloquesVigentes = {
  bloques: readonly Fila[]
  alCambiar: (nuevos: Fila[]) => void
  renombradas?: ReadonlyMap<string, string>
} | null

/**
 * Un escritor que apunta un campo en un bloque por su clave, leyendo el arreglo
 * **en el momento de escribir** y no en el de crearse.
 *
 * Es lo que necesita una subida que termina minutos después de empezar. El
 * selector de archivo se desmonta si se pliega su bloque —el editor no pinta
 * cuerpos plegados, porque con muchos bloques de texto rico serían muchos
 * TipTap montados—, y el `alCambiar` que se llevó consigo cierra sobre el
 * arreglo y la posición de cuando se pintó por última vez. Llamarlo borraría lo
 * escrito después en otros bloques y, si entretanto se reordenaron, apuntaría el
 * archivo en el bloque que ocupa ahora aquel sitio.
 *
 * El editor de bloques sí sigue montado, así que es él quien presta el
 * escritor: `leer` le pregunta qué pintó por última vez.
 */
export function escritorPorClave(
  leer: () => BloquesVigentes,
): (clave: string, nombre: string, valor: unknown) => boolean {
  return (clave, nombre, valor) => {
    const vigentes = leer()
    if (!vigentes) return false
    // La clave se resuelve aquí y no al empezar la subida: el guardado que la
    // renombra puede llegar en cualquier momento del viaje.
    const actual = vigentes.renombradas?.get(clave) ?? clave
    const nuevos = conCampoEnElBloque(vigentes.bloques, actual, nombre, valor)
    if (!nuevos) return false
    vigentes.alCambiar(nuevos)
    return true
  }
}
