/**
 * Cómo se ve una radiografía y cómo se ve una fluoroscopia (petición de Cristóbal).
 *
 * Las dos son la misma física —cuánto atraviesa cada tejido— mostrada al revés, y
 * confundirlas es el error que el traumatólogo corrigió:
 *
 * - **Radiografía**: el vacío es negro y lo denso es blanco. Hueso blanco, partes
 *   blandas en grises, pulmón casi negro. No se ven vasos ni nervios: son
 *   tejido blando de la misma densidad que lo que los rodea.
 * - **Fluoroscopia** (el arco en C del pabellón): la pantalla enseña el negativo.
 *   Lo más denso se ve más **negro** —los tornillos, la placa, el hueso— sobre un
 *   fondo gris claro, y siempre dentro de un círculo, que es el intensificador.
 *
 * Antes la vista «Rayos X» de la plataforma era el cuerpo entero al 50 % de
 * opacidad y de color (D-139, D-166): se leía como una pieza anatómica
 * transparente, no como una imagen de rayos. Aquí se declara cuánto absorbe cada
 * cosa, y de eso salen las dos imágenes.
 *
 * Es puro y sin imports: lo leen el taller anatómico (sistemas), el simulador
 * (papeles de la pieza), el panel de la fluoroscopia y las pruebas.
 */

/**
 * Cuánto absorbe cada sistema del atlas, de 0 a 1 (el hueso compacto es 1).
 * `null` es «no se ve»: arterias, venas, nervios y linfáticos son tejido blando
 * de la misma densidad que su entorno, y en una placa simple no se distinguen.
 * Pintarlos era lo que hacía que la vista pareciera una lámina y no una imagen
 * de rayos.
 */
export const DENSIDAD_POR_SISTEMA: Readonly<Record<string, number | null>> = {
  skeletal: 1,
  muscular: 0.3,
  connective: 0.26,
  cardiac: 0.28,
  // El aire de los pulmones deja pasar casi todo: es lo más oscuro del tórax.
  respiratory: 0.06,
  digestive: 0.2,
  urinary: 0.22,
  reproductive: 0.2,
  endocrine: 0.2,
  sensory: 0.2,
  integumentary: 0.14,
  arterial: null,
  venous: null,
  nervous: null,
  lymphatic: null,
}

/** Lo que no se conoce se trata como tejido blando: ni invisible ni hueso. */
export const DENSIDAD_DEL_TEJIDO_BLANDO = 0.28

export const densidadDelSistema = (sistema: string): number | null =>
  Object.prototype.hasOwnProperty.call(DENSIDAD_POR_SISTEMA, sistema)
    ? DENSIDAD_POR_SISTEMA[sistema]
    : DENSIDAD_DEL_TEJIDO_BLANDO

/**
 * Lo mismo para las piezas de un caso del simulador, por el papel que les dio el
 * autor. El metal —implantes e instrumentos— absorbe más que el hueso compacto:
 * por eso un tornillo se ve más blanco que la tibia en una radiografía, y más
 * negro en la fluoroscopia.
 */
export const DENSIDAD_POR_PAPEL: Readonly<Record<string, number>> = {
  hueso: 1,
  fragmento: 1,
  musculo: 0.3,
  piel: 0.14,
  implante: 1.9,
}

export const DENSIDAD_DEL_METAL = 1.9

export const densidadDelPapel = (papel: string | undefined): number =>
  (papel !== undefined && DENSIDAD_POR_PAPEL[papel]) || DENSIDAD_DEL_TEJIDO_BLANDO

/**
 * Cuánta luz suma cada superficie al atravesarla, por el grosor aparente de lo
 * que cruza el rayo.
 *
 * Una malla es una cáscara, y con mezcla aditiva cada cara suma lo mismo sin
 * importar el grosor: un hueso entero sale como una silueta plana. El grosor se
 * aproxima con el borde: un rayo rasante atraviesa más material que uno de frente
 * —por eso en una placa de verdad el hueso se dibuja con la cortical clara y el
 * centro más oscuro—. `rasante` va de 0 (de frente) a 1 (tangente).
 */
export function aporteDeLaSuperficie(densidad: number, rasante: number): number {
  const r = Math.min(1, Math.max(0, rasante))
  return densidad * (0.045 + 0.2 * Math.pow(r, 1.5))
}

// ---------------------------------------------------------------- ajustes de la imagen (P-003, E2)

/**
 * Cómo se revela la toma: los mandos del arco que cambian la imagen sin volver a irradiar.
 *
 * Cristóbal pidió «poder cambiar la penetrancia de la fluoroscopia (más o menos opaco), jugar con filtros y
 * contrastes para resaltar más o menos, respetando las densidades». Ninguno de los cuatro cambia lo que hay
 * (la densidad de cada tejido sale de `DENSIDAD_POR_PAPEL` y no se toca): cambian cómo se **lee** lo que ya se
 * capturó, igual que la ventana y el nivel de la consola de un arco.
 */
export type FiltroDeFluoroscopia = 'ninguno' | 'bordes' | 'positivo'

export const FILTROS_DE_FLUOROSCOPIA: readonly { valor: FiltroDeFluoroscopia; etiqueta: string; ayuda: string }[] = [
  { valor: 'ninguno', etiqueta: 'Ninguno', ayuda: 'La imagen tal como sale del arco: lo denso, oscuro.' },
  { valor: 'bordes', etiqueta: 'Realzar bordes', ayuda: 'Marca los contornos: la cortical, los agujeros y el borde de la placa.' },
  { valor: 'positivo', etiqueta: 'Positivo', ayuda: 'Como una radiografía: lo denso, blanco, sobre fondo negro.' },
]

export interface AjustesDeLaImagen {
  /**
   * Los kilovoltios del tubo: la **penetración**. Con pocos, lo blando se separa del fondo y el hueso se satura
   * (más opaco); con muchos, el rayo atraviesa más y se distingue lo que hay dentro del hueso o detrás del metal.
   */
  kv: number
  /** Cuánto se separan los grises (0,5 a 2). 1 es la imagen de siempre. */
  contraste: number
  /** Cuánto se aclara (+) o se oscurece (−) todo, de −0,3 a 0,3. */
  brillo: number
  filtro: FiltroDeFluoroscopia
}

export const KV_MINIMO = 50
export const KV_MAXIMO = 120
/** Con 70 kV la imagen es la que había antes de que hubiera mandos: todo lo anterior sigue valiendo. */
export const KV_INICIAL = 70
export const CONTRASTE_MINIMO = 0.5
export const CONTRASTE_MAXIMO = 2
export const BRILLO_MAXIMO = 0.3

export const AJUSTES_DE_LA_IMAGEN_POR_OMISION: Readonly<AjustesDeLaImagen> = {
  kv: KV_INICIAL,
  contraste: 1,
  brillo: 0,
  filtro: 'ninguno',
}

const esFiltro = (valor: unknown): valor is FiltroDeFluoroscopia =>
  FILTROS_DE_FLUOROSCOPIA.some((f) => f.valor === valor)

/** Los ajustes dentro de lo que la imagen admite; lo que no es un número o un filtro conocido vuelve a su valor de siempre. */
export function limitarAjustes(a: Partial<AjustesDeLaImagen> | null | undefined): AjustesDeLaImagen {
  const numero = (valor: unknown, porOmision: number) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : porOmision)
  return {
    kv: Math.round(entre(numero(a?.kv, KV_INICIAL), KV_MINIMO, KV_MAXIMO)),
    contraste: Math.round(entre(numero(a?.contraste, 1), CONTRASTE_MINIMO, CONTRASTE_MAXIMO) * 100) / 100,
    brillo: Math.round(entre(numero(a?.brillo, 0), -BRILLO_MAXIMO, BRILLO_MAXIMO) * 100) / 100,
    filtro: esFiltro(a?.filtro) ? a.filtro : 'ninguno',
  }
}

/**
 * Cuánto se multiplica la materia según los kilovoltios, relativo a los 70 de siempre.
 *
 * Un modelo más simple que la física real, a propósito: la absorción cae aproximadamente con el cuadrado de la
 * energía, así que 50 kV absorbe casi el doble que 70 y 120 kV, algo más de un tercio. Basta para que el mando haga
 * lo que hace el de un arco —más o menos opaco— y se pueda probar con números.
 */
export function factorDeKv(kv: number): number {
  const k = entre(Number.isFinite(kv) ? kv : KV_INICIAL, KV_MINIMO, KV_MAXIMO)
  return Math.pow(KV_INICIAL / k, 2)
}

/**
 * La claridad de un píxel (0 negro, 1 el fondo) para la materia que acumuló la toma, de 0 a 1.
 *
 * `crudo` es lo capturado, de 0 a 1; `ganancia` devuelve la toma a la escala de siempre (la captura se hace con
 * menos ganancia para que lo muy denso no se sature antes de revelar). Es **monótona**: más materia nunca sale más
 * clara, sean cuales sean los ajustes. Es lo que significa «respetando las densidades», y es lo primero que se prueba.
 */
export function claridadDeLaMateria(crudo: number, ganancia: number, a: AjustesDeLaImagen): number {
  const materia = Math.min(1, Math.max(0, crudo) * ganancia * factorDeKv(a.kv))
  const claridad = 1 - materia
  return entre((claridad - 0.5) * a.contraste + 0.5 + a.brillo, 0, 1)
}

export interface OpcionesDeFluoroscopia extends Partial<AjustesDeLaImagen> {
  /**
   * Cuánto se multiplica lo capturado para volver a la escala de siempre. La toma de la consola se captura con
   * la mitad de la ganancia (`FACTOR_DE_LA_TOMA`) y se revela con este factor: así lo muy denso —el metal sobre el
   * hueso— no llega al tope antes de tiempo y los kilovoltios altos tienen algo que mostrar.
   */
  ganancia?: number
  /** El grano del ruido, de 0 (limpia) a 1. */
  ruido?: number
  /** Un número cualquiera, para que el mismo cuadro dé siempre el mismo ruido. */
  semilla?: number
}

/**
 * Cuánto menos se capturan los rayos de lo que se revela: la toma sale con `1 / FACTOR_DE_LA_TOMA` de la ganancia
 * de la radiografía y el revelado la multiplica por esto. Con 70 kV y los demás mandos en su sitio, la imagen es
 * idéntica a la de antes.
 */
export const FACTOR_DE_LA_TOMA = 2

/** Aclara un valor 0-1 en el sentido contrario: lo denso, blanco. */
const positivo = (claridad: number) => 1 - claridad

/**
 * Realce de bordes: máscara de enfoque con un promedio de 3×3. Donde la imagen es lisa no cambia nada; donde hay un
 * borde, el lado claro se aclara y el oscuro se oscurece, y el contorno salta.
 */
function realzarBordes(c: Float32Array, ancho: number, alto: number): Float32Array {
  const fuerza = 1.6
  const salida = new Float32Array(c.length)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      let suma = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(alto - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(ancho - 1, Math.max(0, x + dx))
          suma += c[yy * ancho + xx]
        }
      }
      const centro = c[y * ancho + x]
      salida[y * ancho + x] = Math.min(1, Math.max(0, centro + fuerza * (centro - suma / 9)))
    }
  }
  return salida
}

/**
 * Convierte lo que acumuló el dibujo aditivo —blanco donde hay mucha materia— en
 * la imagen de un arco en C: el negativo, dentro de un círculo.
 *
 * Trabaja sobre los píxeles ya leídos (RGBA, de abajo arriba como los entrega
 * WebGL) y los deja listos para `putImageData`. Se hace aquí y no en un
 * sombreador porque es lo que se prueba: que el círculo recorta, que lo denso
 * sale oscuro y que el vacío de fuera es negro son propiedades que se comprueban
 * con números, y un sombreador no tiene pruebas.
 *
 * - Fuera del círculo, negro: el intensificador no ve más allá.
 * - Dentro, fondo gris claro sin materia (215); cuanta más hay, más oscuro.
 * - Un oscurecimiento suave hacia el borde (viñeta) y grano: sin ellos la
 *   imagen se lee como un dibujo y no como una escopia.
 * - Los ajustes (`kv`, `contraste`, `brillo`, `filtro`) cambian cómo se lee la toma, no lo que hay en ella; con los
 *   de por omisión la imagen es la de siempre.
 */
export function aFluoroscopia(
  pixeles: Uint8ClampedArray | Uint8Array,
  ancho: number,
  alto: number,
  opciones: OpcionesDeFluoroscopia = {},
): Uint8ClampedArray {
  const ganancia = opciones.ganancia ?? 1
  const ruido = opciones.ruido ?? 0.5
  const ajustes = limitarAjustes(opciones)
  let estado = ((opciones.semilla ?? 1) * 2654435761) >>> 0
  const azar = () => {
    // Congruencial lineal: no hace falta calidad, hace falta que sea barato y repetible.
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }

  // La claridad de cada píxel, antes del círculo: el realce mira a los vecinos, y los de fuera del círculo cuentan.
  let claridades: Float32Array = new Float32Array(ancho * alto)
  for (let i = 0; i < ancho * alto; i++) {
    const o = i * 4
    claridades[i] = claridadDeLaMateria((pixeles[o] + pixeles[o + 1] + pixeles[o + 2]) / (3 * 255), ganancia, ajustes)
  }
  if (ajustes.filtro === 'bordes') claridades = realzarBordes(claridades, ancho, alto)

  const salida = new Uint8ClampedArray(ancho * alto * 4)
  const cx = (ancho - 1) / 2
  const cy = (alto - 1) / 2
  const radio = Math.min(ancho, alto) / 2
  for (let y = 0; y < alto; y++) {
    // WebGL entrega la fila 0 abajo; `ImageData` la espera arriba.
    const origenY = alto - 1 - y
    for (let x = 0; x < ancho; x++) {
      const destino = (y * ancho + x) * 4
      const d = Math.hypot(x - cx, y - cy) / radio
      if (d > 1) {
        salida[destino + 3] = 255
        continue
      }
      // El negativo: sin materia, gris claro (215); con mucha, casi negro (20). Lineal a propósito: las partes blandas
      // quedan en gris claro y el hueso, que absorbe tres veces más, en gris oscuro, como en la pantalla del arco.
      const claridad = claridades[origenY * ancho + x]
      const vineta = 1 - 0.28 * Math.pow(d, 3)
      let valor = (20 + 195 * (ajustes.filtro === 'positivo' ? positivo(claridad) : claridad)) * vineta
      if (ruido > 0) valor += (azar() - 0.5) * 14 * ruido
      const v = Math.max(0, Math.min(255, valor))
      salida[destino] = v
      salida[destino + 1] = v
      salida[destino + 2] = Math.min(255, v + 3)
      salida[destino + 3] = 255
    }
  }
  return salida
}

/** Las tres proyecciones que ofrece el arco: de frente, de lado y oblicua. */
export type ProyeccionDeFluoroscopia = 'ap' | 'lateral' | 'oblicua'

export const PROYECCIONES_DE_FLUOROSCOPIA: readonly {
  valor: ProyeccionDeFluoroscopia
  etiqueta: string
  ayuda: string
}[] = [
  { valor: 'ap', etiqueta: 'AP', ayuda: 'Anteroposterior: de frente.' },
  { valor: 'lateral', etiqueta: 'Lateral', ayuda: 'De lado, a 90° de la AP.' },
  { valor: 'oblicua', etiqueta: 'Oblicua', ayuda: 'A medio camino entre la AP y la lateral (45°).' },
]

/** El ángulo, en grados desde la AP hacia la lateral, de cada proyección. */
export const ANGULO_DE_LA_PROYECCION: Readonly<Record<ProyeccionDeFluoroscopia, number>> = {
  ap: 0,
  oblicua: 45,
  lateral: 90,
}

// ---------------------------------------------------------------- mover la extremidad bajo el arco

/**
 * Cuánto se ha corrido la extremidad dentro de la imagen del arco, en radios del círculo: `x` hacia la derecha
 * de la imagen, `y` hacia arriba. En pabellón el arco está quieto y es el miembro el que se mueve para que lo
 * que interesa —el foco de fractura, la punta del clavo— caiga en el centro; aquí se hace arrastrando la imagen.
 */
export interface DesplazamientoDeLaImagen {
  x: number
  y: number
}

export const SIN_DESPLAZAMIENTO: Readonly<DesplazamientoDeLaImagen> = { x: 0, y: 0 }

/** Hasta dónde se puede correr la extremidad con el zoom en 1: más allá se sale del círculo y no queda nada que mirar. */
export const TOPE_DEL_DESPLAZAMIENTO = 1.6

/**
 * Cuánto se puede acercar la imagen (D-175).
 *
 * El mínimo es lo de siempre; el máximo sube de 2 a 4 porque con el hueso entero en el círculo un foco de fractura
 * o la punta de un clavo ocupan un puñado de píxeles, y en pabellón el arco se acerca hasta que se ven. Más de 4
 * no sirve: el modelo no tiene detalle que mostrar y la imagen se vuelve una mancha.
 */
export const ZOOM_MINIMO_DE_LA_IMAGEN = 0.6
export const ZOOM_MAXIMO_DE_LA_IMAGEN = 4

const entre = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor))

/** El zoom dentro de lo que la imagen admite; lo que no es un número vuelve a 1. */
export function limitarZoom(zoom: number): number {
  return entre(Number.isFinite(zoom) ? zoom : 1, ZOOM_MINIMO_DE_LA_IMAGEN, ZOOM_MAXIMO_DE_LA_IMAGEN)
}

/**
 * Hasta dónde se puede correr la extremidad con este zoom.
 *
 * El desplazamiento se mide en radios del círculo, y con zoom el círculo abarca menos hueso: a 4× el hueso entero
 * son cuatro radios de ancho, y un tope de 1,6 radios dejaba el extremo del hueso fuera de alcance (a 4× solo se
 * podía recorrer el 40 % de la mitad del hueso). El tope crece con el zoom y no baja de 1,6: alejando la imagen no
 * hace falta tanto, pero encogerlo la dejaría a media pantalla de ninguna parte.
 */
export function topeDelDesplazamiento(zoom = 1): number {
  return TOPE_DEL_DESPLAZAMIENTO * Math.max(1, limitarZoom(zoom))
}

export function limitarDesplazamiento(d: DesplazamientoDeLaImagen, zoom = 1): DesplazamientoDeLaImagen {
  const tope = topeDelDesplazamiento(zoom)
  return {
    x: entre(Number.isFinite(d.x) ? d.x : 0, -tope, tope),
    y: entre(Number.isFinite(d.y) ? d.y : 0, -tope, tope),
  }
}

/**
 * Cuántos píxeles por lado conviene dibujar la imagen para el ancho con que se enseña.
 *
 * Tres escalones y no el ancho exacto: cada tamaño es un blanco de render y un búfer propios, y cambiarlos a cada
 * píxel de un arrastre de borde los reharía cientos de veces. Se dibuja un poco por encima de lo que se ve (el
 * navegador reduce bien y agranda mal), y nunca más de 768: leer esos píxeles de la tarjeta, siete veces por
 * segundo, es lo que hay que cuidar.
 */
export const LADOS_DE_LA_IMAGEN = [384, 512, 768] as const
export type LadoDeLaImagen = (typeof LADOS_DE_LA_IMAGEN)[number]

export function ladoDeLaImagen(anchoEnPantalla: number, densidadDePantalla = 1): LadoDeLaImagen {
  const px = (Number.isFinite(anchoEnPantalla) ? Math.max(0, anchoEnPantalla) : 0) * (Number.isFinite(densidadDePantalla) ? Math.max(1, densidadDePantalla) : 1)
  if (px <= 400) return 384
  if (px <= 560) return 512
  return 768
}

/**
 * Lo que se puede ensanchar el recuadro de la fluoroscopia, en píxeles.
 *
 * El mínimo es lo que aguanta la imagen sin que los botones de abajo se amontonen; el máximo, lo que cabe a un
 * lado del lienzo en una pantalla normal. Quien lo usa lo recorta además a lo que mida su contenedor.
 */
export const ANCHO_MINIMO_DEL_RECUADRO = 220
export const ANCHO_MAXIMO_DEL_RECUADRO = 720
export const ANCHO_INICIAL_DEL_RECUADRO = 268

export function limitarAnchoDelRecuadro(ancho: number, disponible?: number): number {
  const tope = Math.max(
    ANCHO_MINIMO_DEL_RECUADRO,
    Math.min(ANCHO_MAXIMO_DEL_RECUADRO, Number.isFinite(disponible ?? NaN) ? (disponible as number) : ANCHO_MAXIMO_DEL_RECUADRO),
  )
  return Math.round(entre(Number.isFinite(ancho) ? ancho : ANCHO_INICIAL_DEL_RECUADRO, ANCHO_MINIMO_DEL_RECUADRO, tope))
}

/**
 * Arrastrar la imagen `dxPx`, `dyPx` píxeles (con `dyPx` hacia abajo, como el ratón) corre la extremidad lo
 * mismo que el cursor: lo que está bajo el dedo se queda bajo el dedo. `ladoPx` es lo que mide la imagen en
 * pantalla; el círculo ocupa su mitad en cada sentido.
 */
export function arrastrarLaImagen(
  actual: DesplazamientoDeLaImagen,
  dxPx: number,
  dyPx: number,
  ladoPx: number,
  zoom = 1,
): DesplazamientoDeLaImagen {
  const radioPx = Math.max(1, ladoPx / 2)
  return limitarDesplazamiento({ x: actual.x + dxPx / radioPx, y: actual.y - dyPx / radioPx }, zoom)
}

type Vec3 = readonly [number, number, number]

/**
 * A dónde apunta la cámara de la imagen cuando la extremidad se ha corrido `d`: es el centro de lo que se
 * encuadra, movido **al revés** (si el miembro sube por la imagen, la cámara mira más abajo de él). `derecha`
 * y `arriba` son los ejes de la imagen en el mundo; `radio` es el radio del círculo en unidades del mundo.
 */
export function centroDeLaImagen(
  centro: Vec3,
  radio: number,
  derecha: Vec3,
  arriba: Vec3,
  d: DesplazamientoDeLaImagen,
  zoom = 1,
): [number, number, number] {
  const { x, y } = limitarDesplazamiento(d, zoom)
  return [
    centro[0] - (derecha[0] * x + arriba[0] * y) * radio,
    centro[1] - (derecha[1] * x + arriba[1] * y) * radio,
    centro[2] - (derecha[2] * x + arriba[2] * y) * radio,
  ]
}

/**
 * Cuántos segundos de escopia son «demasiados».
 *
 * La misma cifra que ya usaba el panel de los rayos X (20 s): en pabellón se
 * dispara en tomas cortas, se mira y se apaga. Está aquí y no en la consola para
 * que la fluoroscopia nueva y el aviso de la dosis lean el mismo número.
 */
export const SEGUNDOS_DE_ESCOPIA_ALTOS = 20
