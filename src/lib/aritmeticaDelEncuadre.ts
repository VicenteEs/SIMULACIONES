/**
 * El encuadre de un modelo 3D, sin biblioteca 3D detrás.
 *
 * Es la mitad de `@/lib/encuadre` que no toca `three`: la forma de la pose, la
 * pregunta de si alguien la capturó, la regla de cuál de las dos manda y el
 * encuadre automático que abarca la pieza. Todo aritmética.
 *
 * **Vive aparte por peso, y el peso es literal.** `encuadre.ts` abre con
 * `import * as THREE from 'three'`, que necesita `encuadreCapturado` y solo
 * ella. Mientras los únicos que leían la regla se pintaban en el servidor
 * —`Bloques.tsx`, `tecnica-ao/[id]/page.tsx`— ese peso se quedaba en el
 * paquete del servidor y no lo pagaba nadie. `ConsolaQuirurgica.tsx` lleva
 * `'use client'`: importando de allí la regla, three entraba entero en el
 * paquete que el residente descarga al abrir un caso, y lo descargaba también
 * el caso que no tiene un solo modelo. El motor 3D de la consola viaja aparte a
 * propósito —`LienzoQuirurgico` y `VisoresPerezosos` son importaciones
 * dinámicas—, así que arrastrarlo por esta puerta habría deshecho justo eso sin
 * que ninguna prueba se pusiera roja.
 *
 * De ahí la única regla de este archivo: **aquí no se importa `three`, ni
 * directa ni indirectamente**. Lo que lo necesite va a `encuadre.ts`, que
 * reexporta todo lo de aquí y sigue siendo la puerta de siempre para quien se
 * pinta en el servidor.
 */

export interface Encuadre {
  escala?: number
  giroX?: number
  giroY?: number
  giroZ?: number
  distanciaCamara?: number
}

/** Ángulo de visión de la cámara, en grados. Lo comparten visor y cálculos. */
export const CAMPO_DE_VISION = 45

/**
 * Los dos números que se guardan a dos decimales.
 *
 * Lo usan la distancia que captura `encuadreCapturado` y la que calcula
 * `encuadreQueLoAbarca`, y por eso vive en un solo sitio aunque una de las dos
 * esté en el otro archivo: son el mismo campo de la base, y redondear distinto
 * haría que una captura y un ajuste del mismo modelo guardaran números que no
 * se pueden comparar.
 */
export const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * ¿Alguien encuadró ya este modelo, o está tal como salió de la segmentación?
 *
 * Estaba en `Visor3D.tsx` y se mudó sin cambiarle una coma. El motivo no es de
 * orden: quienes más la necesitan —`Bloques.tsx` y `tecnica-ao/[id]/page.tsx`—
 * se pintan en el **servidor**, y el visor es `'use client'`. Importar de un
 * módulo de cliente algo que no es un componente y llamarlo desde el servidor
 * no queda feo, falla —«Attempted to call tieneEncuadre() from the server»— y
 * se lleva la ficha entera. `Visor3D.tsx` la reexporta, así que los sitios que
 * la citan por aquel nombre siguen siendo ciertos.
 *
 * Pregunta por `distanciaCamara` y no por los giros ni por la escala porque es
 * la misma pregunta con la que el visor decide si encuadra él: los giros valen
 * cero en la pose frontal, que es una pose legítima, y la escala vale uno en
 * casi todas. La distancia no tiene valor neutro: o se capturó o no.
 *
 * Que no lo tenga es una propiedad del dato y hay que defenderla: mientras el
 * bloque «Modelo 3D» declaró `defaultValue: 3` (`src/blocks/index.ts`), toda
 * fila nacía contestando «sí» a esta pregunta sin que nadie hubiera capturado
 * nada, y con eso la regla de abajo no podía caer al modelo jamás.
 */
export const tieneEncuadre = (encuadre: Encuadre | null | undefined): boolean =>
  encuadre?.distanciaCamara !== undefined && encuadre.distanciaCamara !== null

/**
 * Cuál de los dos encuadres manda al enseñarle un modelo al residente.
 *
 * Manda el del bloque: quien coloca esa pieza en esa ficha la está mirando para
 * esa ficha. Si el bloque no dice nada, manda el del modelo, que es la pose que
 * el traumatólogo dejó capturada en el catálogo para todas las fichas a la vez.
 * Y si ninguno dice nada, no se devuelve nada y el visor abarca la pieza por su
 * cuenta, que es lo que la plataforma ha hecho siempre.
 *
 * Las tres pantallas que abren un modelo del catálogo pasan por aquí, y dos de
 * ellas no tienen encuadre propio que ofrecer —el paso de un caso AO y el
 * instrumento de la consola solo apuntan al modelo—: llaman con el primer
 * argumento vacío. Se llama igualmente, y no se escribe allí un
 * `modelo.encuadre` a pelo, porque lo que hace falta de esta función en esos
 * dos sitios es la **tercera** rama: un grupo entero a nulos tiene que salir de
 * aquí como `undefined` para que el visor vuelva a encuadrar solo. Escribirlo a
 * mano deja pasar el objeto de nulos y el visor pone la cámara a la distancia
 * por omisión sobre un modelo en milímetros, que se abre como un punto.
 *
 * **No vale `bloque.encuadre ?? modelo.encuadre`**, aunque sea lo que pide el
 * cuerpo. `depurarCampos` (`src/admin/depurar.ts`) reconstruye el documento
 * recorriendo el esquema y escribe siempre las cinco claves del grupo, de modo
 * que un bloque guardado desde el panel trae un `encuadre` que es un objeto
 * aunque esté entero a nulos: el `??` no caería al modelo jamás y el respaldo
 * quedaría escrito, probado y muerto.
 *
 * Los bloques antiguos llegan más lejos todavía. Hasta este cambio, el bloque
 * de Payload declaraba `defaultValue` —escala 1, giros 0, distancia 3—, así que
 * las filas guardadas mientras eso estuvo puesto traen una distancia de cámara
 * que nadie capturó y contestan «sí» a `tieneEncuadre`. El `defaultValue` ya no
 * está; las filas sí siguen, porque quitarlo no reescribe lo guardado. Vaciar
 * esas filas es una migración y va aparte: aquí no se pueden adivinar, y
 * tampoco conviene intentarlo —una fila con exactamente esos cinco valores
 * podría, en teoría, ser una captura de verdad, y esta función no es el sitio
 * donde decidir eso—.
 *
 * Tampoco se mezclan a medias. Un bloque con los giros escritos y la distancia
 * en blanco cae **entero** al del modelo: juntar la mitad de uno con la mitad
 * del otro compone una pose que nadie vio nunca, ni en el editor del bloque ni
 * en la ficha del modelo, y el traumatólogo no tendría dónde ir a corregirla.
 */
export function encuadreVigente(
  delBloque: Encuadre | null | undefined,
  delModelo: Encuadre | null | undefined,
): Encuadre | undefined {
  if (tieneEncuadre(delBloque)) return delBloque ?? undefined
  if (tieneEncuadre(delModelo)) return delModelo ?? undefined
  return undefined
}

/**
 * Escala y distancia con las que un modelo se ve entero, venga en la unidad que
 * venga.
 *
 * Una malla salida de una segmentación puede estar en milímetros y otra en
 * metros: sin esto, la mitad de los modelos aparecen como un punto y la otra
 * mitad llenan la pantalla desde dentro. Se lleva el radio a uno y se pone la
 * cámara a la distancia justa para que una esfera de radio uno quepa en el
 * ángulo de visión, con un margen para no rozar los bordes.
 */
export function encuadreQueLoAbarca(radio: number): Pick<Encuadre, 'escala' | 'distanciaCamara'> | null {
  if (!Number.isFinite(radio) || radio <= 0) return null
  const distancia = (1 / Math.sin((CAMPO_DE_VISION * Math.PI) / 360)) * 1.15
  return {
    // La escala se redondea a cifras significativas y no a decimales. Un
    // modelo en milímetros necesita una escala de 0,002, y redondeado a dos
    // decimales eso es cero: el modelo desaparecía, y el botón que existe
    // precisamente para hacerlo visible lo hacía invisible.
    escala: Number((1 / radio).toPrecision(4)),
    distanciaCamara: redondear(distancia),
  }
}
