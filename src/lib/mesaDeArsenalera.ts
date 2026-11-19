/**
 * Dónde va la mesa de la arsenalera (pedido del dueño): cuatro sitios fijos alrededor de la camilla y uno libre, que se
 * arrastra por el suelo.
 *
 * Es geometría pura y sin three, para probarla con números. Todo va en el **marco del colchón** (`colchon.glb`, ver
 * `privado/pabellon/manifiesto.json`), en metros: el origen en el centro de su cara de arriba, X a lo ancho, Y hacia
 * arriba y la cabeza del paciente hacia −Z. La mesa cuelga del colchón en la escena y no del paciente, porque es
 * mobiliario de la sala: cuando al paciente se le da la vuelta, el colchón rueda con la cámara y la mesa con él, y en
 * la pantalla se queda donde estaba.
 *
 * El modelo de la mesa (`mesa-arsenalera.glb`, de `scripts/pabellon/mobiliario.py`) tiene el origen en el suelo, bajo
 * el centro de la bandeja; la bandeja a lo largo de su +X, con el poste en el extremo −X y la bandeja en voladizo hacia
 * +X, como una mesa de Mayo. Lo que sube al regular la altura cuelga de su nodo `elevable`.
 */

export type LugarDeLaMesa = 'derecha' | 'izquierda' | 'pies' | 'encima' | 'libre'
export type DecubitoDeLaMesa = 'supino' | 'prono'

export const LUGARES_DE_LA_MESA: readonly { valor: LugarDeLaMesa; etiqueta: string; ayuda: string }[] = [
  { valor: 'derecha', etiqueta: 'Derecha', ayuda: 'Junto a la camilla, al lado derecho del paciente y a la altura de lo que se opera.' },
  { valor: 'izquierda', etiqueta: 'Izquierda', ayuda: 'Junto a la camilla, al lado izquierdo del paciente y a la altura de lo que se opera.' },
  { valor: 'pies', etiqueta: 'A los pies', ayuda: 'Pasado el extremo de la camilla, de frente a quien opera desde los pies.' },
  {
    valor: 'encima',
    etiqueta: 'Sobre el paciente',
    ayuda: 'Como la mesa de Mayo: la base entra bajo la camilla y la bandeja queda sobre el paciente, un poco antes de lo que se opera.',
  },
  { valor: 'libre', etiqueta: 'Libre', ayuda: 'Se arrastra por el suelo a donde se quiera. Pincharla sin arrastrar pide un instrumento, como siempre.' },
]

/** Las medidas de la sala que dan los sitios. Las del colchón son las del manifiesto; lo demás, de un pabellón. */
export const MEDIDAS_DE_LA_SALA = {
  /** Medio ancho del colchón: 84 cm. */
  medioAnchoDelColchon: 0.42,
  /** Medio largo: 196 cm. Los pies, hacia +Z. */
  medioLargoDelColchon: 0.98,
  /** El suelo, bajo la cara de arriba del colchón: una camilla de pabellón a su altura de trabajo. */
  suelo: -0.95,
  /** La cara de arriba de la bandeja, desde el suelo, con la mesa sin subir: tres centímetros sobre el colchón. */
  alturaDeLaBandeja: 0.98,
  /** Del centro de la bandeja al poste, a lo largo de la bandeja. */
  delCentroAlPoste: 0.33,
  /** La bandeja: 60 × 40 cm. */
  medioLargoDeLaBandeja: 0.3,
  medioAnchoDeLaBandeja: 0.2,
  /** Lo que la base sobresale a cada lado de la bandeja, a lo ancho: las patas con sus ruedas. */
  medioAnchoDeLaBase: 0.26,
  /**
   * Cuánto se sube la bandeja para que pase sobre el paciente: el tope del poste del modelo (`mobiliario.py`). Un muslo
   * acostado llega a unos 20 cm sobre el colchón, y con el paño encima, a algo más. Con 30 cm la bandeja pasaba, pero la
   * funda cuelga hasta 25 cm bajo el borde en las esquinas y las dejaba a 10 cm del colchón, dentro del muslo.
   */
  subidaSobreElPaciente: 0.35,
  /** Lo más lejos del centro del colchón que se puede dejar en «Libre»: más allá ya no se vería desde la mesa. */
  alcanceLibre: 2.4,
  /**
   * Lo que ocupa en planta la arsenalera de pie: la falda de la bata, algo abierta, sin contar las manos. Es lo que no
   * puede pisar el colchón, que está a la altura de su cadera.
   */
  radioDeLaPersona: 0.28,
  /**
   * Lo que ocupa abajo, hasta la altura de las patas de la mesa: los cubrecalzados, 16 cm por delante del eje y 19 a cada
   * lado, y lo que de la bata y el pantalón baja hasta ahí (15 y 17,5 cm). Es lo que no puede pisar la base de la mesa.
   * Más arriba la bata se abre hasta 21 cm, pero ahí ya no hay patas: medirla con eso la obligaría a pararse lejos de su
   * mesa. Lo comprueba `scripts/pabellon/arsenalera_a_la_web.py` al exportarla (D-418).
   */
  radioDeLosPies: 0.2,
  /** Lo que se deja entre ella y el borde del colchón: la camilla lleva rieles, y quien opera necesita pasar. */
  holguraAlColchon: 0.08,
  /**
   * Lo que alcanza con las manos por delante del eje de su cuerpo: a 38 cm cae lo que tiene a mano, a la altura de la
   * bandeja sin subir (98 cm). Lo fijó la figura anterior, que apoyaba ahí las palmas. La del dueño (D-418) tiene los
   * brazos abajo, y se conservó porque con ella la bandeja le queda delante, a un paso corto. Los sitios de abajo salen
   * de aquí.
   */
  alcanceDeLasManos: 0.38,
  /**
   * Del eje de la bandeja al eje de ella cuando se para a su lado: lo que alcanza (38 cm por delante) cae 13 cm dentro
   * del eje, a siete del borde de la bandeja. Lo más adelantado de ella, las puntas de los pies a 16,2 cm de su eje,
   * queda a 10 cm de la funda, que cuelga hasta 24,6 cm del eje de la bandeja. Con 55 cm la bandeja le quedaba fuera de
   * alcance.
   */
  delEjeDeLaBandejaALaPersona: 0.51,
  /**
   * Del centro de la bandeja a ella cuando se para tras el poste: el pie del poste llega a 38,4 cm del centro, y con
   * 70 cm lo más adelantado de ella queda a unos 16 cm de la funda (con la figura anterior, de manos por delante, eran
   * dos). Es el sitio de la mesa de Mayo, que va subida sobre el paciente.
   */
  detrasDelPoste: 0.7,
  /** Del centro de la bandeja a ella cuando se para pasada la punta: lo que alcanza cae 22 cm dentro, a ocho del extremo. */
  masAllaDeLaPunta: 0.6,
} as const

/** Dónde queda la mesa, en el marco del colchón. */
export interface ColocacionDeLaMesa {
  /** El punto del suelo bajo el centro de la bandeja. */
  x: number
  z: number
  /** El giro alrededor de la vertical, en radianes, como el `rotation.y` de three: con 0 la bandeja va a lo ancho. */
  giro: number
  /** Cuánto sube lo `elevable` sobre su altura de fábrica, en metros. */
  subida: number
}

export interface DatosDelSitio {
  decubito: DecubitoDeLaMesa
  /**
   * Por dónde se opera, a lo largo del colchón: la Z del centro de lo que se ve del modelo. Los sitios de los lados
   * se ponen a su altura, para que el instrumental quede a mano de lo que se opera y no en la cabecera.
   */
  zDeLaZona: number
  /** El punto del suelo elegido en «Libre». */
  libre?: { x: number; z: number } | null
  /** El giro con que quedó en el último sitio fijo: en «Libre» se arrastra sin girarla. */
  giroAnterior?: number
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * El lado derecho del paciente, en el X del colchón. Boca arriba, el +X del colchón es el +X del cuerpo, que en el atlas
 * es el lado izquierdo (la pierna derecha está en X negativa); boca abajo, el colchón se dio la vuelta y es al revés.
 * Por eso «Derecha» cambia de lado del colchón al darle la vuelta al paciente: sigue siendo su derecha.
 */
export function ladoDerecho(decubito: DecubitoDeLaMesa): 1 | -1 {
  return decubito === 'supino' ? -1 : 1
}

/** Con el giro dado, hacia dónde apunta el +X del modelo (la bandeja desde el poste) en el marco del colchón. */
export function haciaLaBandeja(giro: number): { x: number; z: number } {
  // `rotation.y` de three: el +X gira hacia −Z con un ángulo positivo.
  return { x: Math.cos(giro), z: -Math.sin(giro) }
}

/**
 * La colocación de cada sitio.
 *
 * - **Derecha / Izquierda**: a lo largo de la camilla, a la altura de lo que se opera, con la bandeja paralela al
 *   colchón y el poste hacia la cabeza: el instrumental queda a la mano de quien está de pie a ese lado. Entre el
 *   borde del colchón y la bandeja quedan trece centímetros, lo que ocupa quien opera de lado.
 * - **A los pies**: pasado el extremo de la camilla, con la bandeja a lo ancho.
 * - **Sobre el paciente**: la mesa de Mayo. El poste queda fuera del colchón, por la derecha, y la bandeja vuela sobre
 *   el paciente, subida para pasar sobre él. Va un poco antes de lo que se opera, hacia la cabeza, para no taparlo, y
 *   nunca más allá de la mitad de la camilla: ahí debajo está la columna de la camilla, y la base no entra.
 * - **Libre**: donde se arrastró, con el giro del último sitio. Si la bandeja cae sobre el colchón, sube para pasar
 *   sobre el paciente, como haría la arsenalera.
 */
export function colocarLaMesa(lugar: LugarDeLaMesa, datos: DatosDelSitio): ColocacionDeLaMesa {
  const m = MEDIDAS_DE_LA_SALA
  const derecha = ladoDerecho(datos.decubito)
  // A lo largo de la camilla, sin pasar de sus extremos: la bandeja entera tiene que caber junto al colchón.
  const aLoLargo = limitar(datos.zDeLaZona, -m.medioLargoDelColchon + m.medioLargoDeLaBandeja, m.medioLargoDelColchon - m.medioLargoDeLaBandeja)
  const deLado = m.medioAnchoDelColchon + 0.13 + m.medioAnchoDeLaBandeja
  // El poste hacia la cabeza (−Z): la bandeja apunta a los pies, +Z, que con `rotation.y` es −π/2.
  const aLoLargoDeLaCamilla = -Math.PI / 2
  switch (lugar) {
    case 'derecha':
      return { x: derecha * deLado, z: aLoLargo, giro: aLoLargoDeLaCamilla, subida: 0 }
    case 'izquierda':
      return { x: -derecha * deLado, z: aLoLargo, giro: aLoLargoDeLaCamilla, subida: 0 }
    case 'pies':
      return { x: 0, z: m.medioLargoDelColchon + 0.06 + m.medioAnchoDeLaBase, giro: 0, subida: 0 }
    case 'encima': {
      // La bandeja apunta desde la derecha del paciente hacia su izquierda: el poste, fuera del colchón por la derecha.
      const giro = derecha === -1 ? 0 : Math.PI
      const poste = derecha * (m.medioAnchoDelColchon + 0.05)
      const x = poste - derecha * m.delCentroAlPoste
      const z = limitar(datos.zDeLaZona - 0.45, 0.33, m.medioLargoDelColchon - m.medioAnchoDeLaBase)
      return { x, z, giro, subida: m.subidaSobreElPaciente }
    }
    case 'libre': {
      const punto = datos.libre ?? { x: derecha * deLado, z: aLoLargo }
      const lejos = Math.hypot(punto.x, punto.z)
      const k = lejos > m.alcanceLibre ? m.alcanceLibre / lejos : 1
      const x = punto.x * k
      const z = punto.z * k
      const sobreElColchon = Math.abs(x) < m.medioAnchoDelColchon + 0.05 && Math.abs(z) < m.medioLargoDelColchon + 0.05
      return { x, z, giro: datos.giroAnterior ?? aLoLargoDeLaCamilla, subida: sobreElColchon ? m.subidaSobreElPaciente : 0 }
    }
  }
}

/** Si un valor guardado es un sitio de la mesa. Lo que no lo es —una versión vieja, una mano en la consola— es «Derecha». */
export function lugarDeLaMesa(valor: unknown): LugarDeLaMesa {
  return LUGARES_DE_LA_MESA.some((l) => l.valor === valor) ? (valor as LugarDeLaMesa) : 'derecha'
}

// ---------------------------------------------------------------------------------------------------------- la persona

/**
 * Dónde se para la arsenalera respecto de su mesa. Son cuatro sitios alrededor de la bandeja, en el marco de la mesa:
 * a cada lado de la bandeja, tras el poste, y pasada la punta. Se llaman por lo que son para la mesa y no por un lado
 * de la sala, porque al girar la mesa lo que era «izquierda» deja de serlo.
 */
export type LadoDeLaPersona = 'costado-a' | 'costado-b' | 'poste' | 'punta'

/** Dónde queda ella, en el marco del colchón, y hacia dónde mira. */
export interface ColocacionDeLaPersona {
  /** El punto del suelo entre sus pies. */
  x: number
  z: number
  /** El giro alrededor de la vertical, como el `rotation.y` de three: con 0 mira a +Z, que es el frente de su modelo. */
  giro: number
  lado: LadoDeLaPersona
}

export interface PuntoDelSuelo {
  x: number
  z: number
}

/** Cuánto falta, en el suelo, para llegar al colchón: 0 si se está encima. Es la distancia a un rectángulo. */
export function distanciaAlColchon(x: number, z: number): number {
  const m = MEDIDAS_DE_LA_SALA
  return Math.hypot(Math.max(Math.abs(x) - m.medioAnchoDelColchon, 0), Math.max(Math.abs(z) - m.medioLargoDelColchon, 0))
}

/** El punto del colchón más cercano a otro del suelo. Dentro de él, el propio punto. */
function puntoMasCercanoDelColchon(x: number, z: number): PuntoDelSuelo {
  const m = MEDIDAS_DE_LA_SALA
  return { x: limitar(x, -m.medioAnchoDelColchon, m.medioAnchoDelColchon), z: limitar(z, -m.medioLargoDelColchon, m.medioLargoDelColchon) }
}

/** Lo que tiene que haber entre el centro de ella y el colchón para que ninguna parte de su falda lo pise. */
const DISTANCIA_MINIMA_AL_COLCHON = MEDIDAS_DE_LA_SALA.radioDeLaPersona + MEDIDAS_DE_LA_SALA.holguraAlColchon

/**
 * Hacia el centro de la bandeja: es lo que tiene a mano. Antes miraba al punto del colchón más cercano, que en los
 * sitios fijos da lo mismo (la bandeja va paralela al borde y ella detrás), pero con la mesa arrastrada en diagonal la
 * dejaba de lado a la bandeja.
 */
function girarHaciaLaBandeja(x: number, z: number, mesa: ColocacionDeLaMesa): number {
  const dx = mesa.x - x
  const dz = mesa.z - z
  if (Math.hypot(dx, dz) < 1e-6) {
    // Sobre el centro mismo de la bandeja (solo si se la sacó del colchón y cayó ahí): hacia la camilla.
    const c = puntoMasCercanoDelColchon(x, z)
    return Math.atan2(c.x - x, c.z - z)
  }
  // `rotation.y` de three: el +Z del modelo apunta a (sen giro, cos giro).
  return Math.atan2(dx, dz)
}

/** Saca un punto de lo que ocupa el colchón con su holgura, por el camino más corto. Lo que ya está fuera no se mueve. */
function sacarDelColchon(x: number, z: number): PuntoDelSuelo {
  const m = MEDIDAS_DE_LA_SALA
  if (distanciaAlColchon(x, z) >= DISTANCIA_MINIMA_AL_COLCHON) return { x, z }
  const c = puntoMasCercanoDelColchon(x, z)
  const dx = x - c.x
  const dz = z - c.z
  const d = Math.hypot(dx, dz)
  if (d > 1e-6) return { x: c.x + (dx / d) * DISTANCIA_MINIMA_AL_COLCHON, z: c.z + (dz / d) * DISTANCIA_MINIMA_AL_COLCHON }
  // Dentro del colchón: por el lado por donde se sale con menos camino.
  const porLosCostados = { x: Math.sign(x || 1) * (m.medioAnchoDelColchon + DISTANCIA_MINIMA_AL_COLCHON), z, coste: m.medioAnchoDelColchon - Math.abs(x) }
  const porLasPuntas = { x, z: Math.sign(z || 1) * (m.medioLargoDelColchon + DISTANCIA_MINIMA_AL_COLCHON), coste: m.medioLargoDelColchon - Math.abs(z) }
  const mejor = porLasPuntas.coste < porLosCostados.coste ? porLasPuntas : porLosCostados
  return { x: mejor.x, z: mejor.z }
}

/**
 * Dónde se para la arsenalera, dada la mesa. Cuatro reglas, en este orden de importancia:
 *
 * 1. **Nunca sobre el paciente.** Su falda no pisa el colchón ni su holgura: un sitio que la mete encima se descarta.
 * 2. **Al costado externo.** De los sitios que quedan junto a la mesa gana el más lejos del colchón: la mesa queda entre
 *    ella y la camilla, como en un pabellón, y no ella entre la mesa y el paciente.
 * 3. **Sin saltos.** Si el sitio en que estaba sigue sirviendo, se queda, salvo que otro lo supere por más de 20 cm. Al
 *    arrastrar la mesa por el suelo, dos sitios casi empatados harían que cambiara de lado a cada cuadro.
 * 4. **De frente a la bandeja,** que es lo que tiene a mano. Como la mesa queda entre ella y la camilla, mirar a la
 *    bandeja es también mirar a la camilla: de los cuatro sitios gana el más lejano del colchón, y el centro de la
 *    bandeja, que está entre sitios opuestos, nunca queda más lejos que él.
 *
 * Si ningún sitio sirve (una mesa arrastrada sobre la camilla, o pegada a ella por todos lados) se toma el más lejano y
 * se la saca del colchón: no se la deja encima del paciente por ser el único hueco.
 */
export function colocarALaArsenalera(mesa: ColocacionDeLaMesa, anterior?: LadoDeLaPersona): ColocacionDeLaPersona {
  const m = MEDIDAS_DE_LA_SALA
  const a = haciaLaBandeja(mesa.giro)
  // El lado de la bandeja: perpendicular a su eje, en el suelo.
  const p = { x: -a.z, z: a.x }
  const sitios: { lado: LadoDeLaPersona; a: number; p: number }[] = [
    { lado: 'costado-a', a: 0, p: m.delEjeDeLaBandejaALaPersona },
    { lado: 'costado-b', a: 0, p: -m.delEjeDeLaBandejaALaPersona },
    { lado: 'poste', a: -m.detrasDelPoste, p: 0 },
    { lado: 'punta', a: m.masAllaDeLaPunta, p: 0 },
  ]
  const candidatos = sitios.map((s) => {
    const x = mesa.x + a.x * s.a + p.x * s.p
    const z = mesa.z + a.z * s.a + p.z * s.p
    return { lado: s.lado, x, z, lejos: distanciaAlColchon(x, z) }
  })
  const buenos = candidatos.filter((c) => c.lejos >= DISTANCIA_MINIMA_AL_COLCHON)
  const sirve = (buenos.length > 0 ? buenos : candidatos).slice()
  // Gana el más lejos del colchón; el anterior, con 20 cm de ventaja.
  const puntaje = (c: (typeof candidatos)[number]) => c.lejos + (c.lado === anterior ? 0.2 : 0)
  const elegido = sirve.reduce((mejor, c) => (puntaje(c) > puntaje(mejor) ? c : mejor))
  const sitio = buenos.length > 0 ? { x: elegido.x, z: elegido.z } : sacarDelColchon(elegido.x, elegido.z)
  return { x: sitio.x, z: sitio.z, giro: girarHaciaLaBandeja(sitio.x, sitio.z, mesa), lado: elegido.lado }
}

/**
 * El camino de un punto a otro del suelo sin cruzar el colchón: recto si se puede y, si no, rodeándolo por donde sea
 * más corto. Es por donde camina la arsenalera cuando la mesa cambia de lado, y no atravesando al paciente.
 */
export function caminoAlrededorDelColchon(desde: PuntoDelSuelo, hasta: PuntoDelSuelo): PuntoDelSuelo[] {
  const m = MEDIDAS_DE_LA_SALA
  // El rectángulo por el que se rodea: el colchón con la holgura de ella y un poco más, para no rozarlo al doblar.
  const margen = DISTANCIA_MINIMA_AL_COLCHON + 0.04
  const hx = m.medioAnchoDelColchon + margen
  const hz = m.medioLargoDelColchon + margen
  if (!segmentoCruzaElRectangulo(desde, hasta, hx, hz)) return [desde, hasta]
  const enElRectangulo = (q: PuntoDelSuelo) => Math.abs(q.x) < hx - 1e-9 && Math.abs(q.z) < hz - 1e-9
  // Dentro del rectángulo no hay camino que rodear: se va recto y la colocación ya habrá sacado a quien esté ahí.
  if (enElRectangulo(desde) || enElRectangulo(hasta)) return [desde, hasta]
  const perimetro = 4 * hx + 4 * hz
  const esquinas = [
    { s: 0, x: -hx, z: -hz },
    { s: 2 * hx, x: hx, z: -hz },
    { s: 2 * hx + 2 * hz, x: hx, z: hz },
    { s: 4 * hx + 2 * hz, x: -hx, z: hz },
  ]
  /** Dónde cae un punto, al proyectarlo al borde, a lo largo del perímetro: del lado de −Z hacia +X, y así en redondo. */
  const aLoLargo = (q: PuntoDelSuelo) => {
    const x = limitar(q.x, -hx, hx)
    const z = limitar(q.z, -hz, hz)
    if (Math.abs(z + hz) < 1e-9) return { s: x + hx, x, z }
    if (Math.abs(x - hx) < 1e-9) return { s: 2 * hx + (z + hz), x, z }
    if (Math.abs(z - hz) < 1e-9) return { s: 2 * hx + 2 * hz + (hx - x), x, z }
    return { s: 4 * hx + 2 * hz + (hz - z), x, z }
  }
  const a = aLoLargo(desde)
  const b = aLoLargo(hasta)
  const delante = (((b.s - a.s) % perimetro) + perimetro) % perimetro
  const sentido = delante <= perimetro / 2 ? 1 : -1
  const recorrido = sentido === 1 ? delante : perimetro - delante
  // Las esquinas que quedan entre los dos, en el orden en que se las encuentra.
  const intermedias = esquinas
    .map((e) => ({ ...e, a: sentido === 1 ? (((e.s - a.s) % perimetro) + perimetro) % perimetro : (((a.s - e.s) % perimetro) + perimetro) % perimetro }))
    .filter((e) => e.a > 1e-9 && e.a < recorrido - 1e-9)
    .sort((u, v) => u.a - v.a)
  return [desde, { x: a.x, z: a.z }, ...intermedias.map((e) => ({ x: e.x, z: e.z })), { x: b.x, z: b.z }, hasta]
}

/** Si el segmento toca el rectángulo centrado en el origen, de medios lados `hx` y `hz` (el método de las franjas). */
function segmentoCruzaElRectangulo(desde: PuntoDelSuelo, hasta: PuntoDelSuelo, hx: number, hz: number): boolean {
  let t0 = 0
  let t1 = 1
  const dx = hasta.x - desde.x
  const dz = hasta.z - desde.z
  for (const [d, o, h] of [
    [dx, desde.x, hx],
    [dz, desde.z, hz],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) >= h) return false
      continue
    }
    let a = (-h - o) / d
    let b = (h - o) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 >= t1) return false
  }
  return true
}

/** El largo de un camino, en metros. */
export function largoDelCamino(camino: PuntoDelSuelo[]): number {
  let largo = 0
  for (let i = 1; i < camino.length; i++) largo += Math.hypot(camino[i].x - camino[i - 1].x, camino[i].z - camino[i - 1].z)
  return largo
}
