import { desdeLexical, esListado } from './textoRico'

/**
 * La grabación de la demostración de un paso desde el editor (P-013, pedido 11).
 *
 * Lo pidió Cristóbal: que los editores graben en el simulador el gesto de cada
 * paso y que encima del vídeo salgan cuadros explicativos, los del paso a paso
 * que escriben los colaboradores. Lo grabado va al campo de siempre,
 * «Demostración» (P-009), que ya acepta WebM y MP4: no hay campo nuevo ni
 * migración. Los cuadros se queman en la imagen al grabar y no van aparte como
 * subtítulos por lo mismo. Un archivo de subtítulos pediría un campo donde
 * guardarlo y alguien que lo sincronice; un vídeo con el texto dentro se ve
 * igual en el panel del paso, en grande y descargado.
 *
 * Aquí está lo que no necesita el navegador, para probarlo en `node`: qué
 * formato pedir, a qué tamaño, cómo se parte la descripción en cuadros y cómo
 * se acomoda cada cuadro en la imagen. La grabación misma está en
 * `GrabadoraDelPaso.tsx`.
 */

/**
 * Lo que se le pide a `MediaRecorder`, de mejor a peor.
 *
 * WebM primero porque es lo que graban Chrome y Edge, que son los navegadores
 * del equipo. Safari solo graba MP4, y el campo acepta los dos.
 */
export const FORMATOS_DE_GRABACION = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const

/** El primero que el navegador sabe grabar, o `null` si no sabe ninguno. */
export function formatoDeGrabacion(admite: (formato: string) => boolean): string | null {
  for (const formato of FORMATOS_DE_GRABACION) {
    try {
      if (admite(formato)) return formato
    } catch {
      // `isTypeSupported` lanza en algún navegador viejo con un formato que no conoce: es un «no».
    }
  }
  return null
}

/**
 * El tipo del archivo, sin los códecs.
 *
 * Es lo que se compara con lo que acepta el campo (`video/webm`, `video/mp4`).
 * Con los códecs dentro, `video/webm;codecs=vp9` no coincide con nada.
 */
export function tipoDelArchivo(formato: string): string {
  return formato.split(';')[0].trim()
}

export function extensionDelFormato(formato: string): 'webm' | 'mp4' {
  return tipoDelArchivo(formato) === 'video/mp4' ? 'mp4' : 'webm'
}

/**
 * El techo de la imagen grabada.
 *
 * Más de 1280 × 720 no se aprovecha: el panel del paso enseña la demostración a
 * 220 px de alto, y en grande ocupa 720 px de ancho. Cada píxel de más es peso,
 * y los medios tienen techo (`TECHO_DE_MEDIOS_BYTES`).
 */
export const TECHO_DE_LA_IMAGEN = { ancho: 1280, alto: 720 } as const

/**
 * El tamaño de la grabación para un lienzo de `ancho` × `alto` píxeles reales.
 *
 * Conserva la proporción del lienzo, sin agrandarlo. Los dos lados salen pares
 * porque los códecs de vídeo trabajan en bloques de 2 × 2: con un lado impar,
 * unos recortan una línea y otros no graban.
 */
export function tamanoDeLaGrabacion(
  ancho: number,
  alto: number,
  techo: { ancho: number; alto: number } = TECHO_DE_LA_IMAGEN,
): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: techo.ancho, alto: techo.alto }
  const escala = Math.min(1, techo.ancho / ancho, techo.alto / alto)
  const par = (x: number) => Math.max(2, 2 * Math.round((x * escala) / 2))
  return { ancho: par(ancho), alto: par(alto) }
}

/**
 * 2,5 Mbit/s.
 *
 * A 1280 × 720 la letra de los cuadros se lee sin manchas, y un minuto pesa
 * unos 19 MB. Es lo que se pide: el codificador lo usa como objetivo, no como
 * techo, y por eso la grabación cuenta los bytes de verdad (`hayQueParar`).
 */
export const BITS_POR_SEGUNDO = 2_500_000

/**
 * Qué fracción del techo de los medios se deja llenar antes de parar sola.
 *
 * Sin margen, lo grabado hasta el techo se perdería entero, porque lo que pasa
 * del techo no se sube. Y los trozos llegan cada segundo: el último puede traer
 * más de lo que pide el codificador, con un plano que cambia de golpe.
 */
export const MARGEN_DEL_TECHO = 0.9

/** Si lo grabado ya está cerca del techo y hay que parar antes de que no se pueda subir. */
export function hayQueParar(bytes: number, techo: number): boolean {
  return techo > 0 && bytes >= techo * MARGEN_DEL_TECHO
}

/** «1:05». */
export function duracionLegible(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** «12,4 MB», con coma, como el resto de la plataforma. */
export function pesoLegible(bytes: number): string {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const limpio = (texto: string): string => texto.replace(/\s+/g, ' ').trim()

/**
 * Los cuadros que salen de la descripción del paso: uno por párrafo y uno por
 * punto de una lista.
 *
 * La descripción es el «Qué se hace» que escriben los colaboradores, y lo que
 * pidió Cristóbal es justo eso sobre el vídeo. Un punto por cuadro porque una
 * lista es ya un paso a paso: cada punto es lo que se explica mientras se hace.
 * Una lista numerada conserva su número, que es como la escribió su autor.
 */
export function cuadrosDeLaDescripcion(valor: unknown): string[] {
  const cuadros: string[] = []
  for (const parrafo of desdeLexical(valor)) {
    if (esListado(parrafo)) {
      parrafo.puntos.forEach((punto, i) => {
        const texto = limpio(punto.map((f) => f.texto).join(''))
        if (texto) cuadros.push(parrafo.tipo === 'numerada' ? `${i + 1}. ${texto}` : texto)
      })
      continue
    }
    const texto = limpio(parrafo.fragmentos.map((f) => f.texto).join(''))
    if (texto) cuadros.push(texto)
  }
  return cuadros
}

/**
 * Los cuadros del recuadro donde los escribe el editor, separados por una línea
 * en blanco.
 *
 * Un salto de línea suelto no separa: el cuadro se reparte solo en líneas al
 * ancho de la imagen, y quien escribe un párrafo largo y pulsa Intro a mitad no
 * pretende dos cuadros.
 */
export function cuadrosDelTexto(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map(limpio)
    .filter((c) => c.length > 0)
}

export function textoDeLosCuadros(cuadros: readonly string[]): string {
  return cuadros.join('\n\n')
}

/**
 * Parte `texto` en líneas que no pasen de `anchoMaximo`, palabra a palabra.
 *
 * Una palabra que sola no cabe se parte por letras. En castellano casi no
 * ocurre, pero un nombre de implante o una dirección pegados sin espacios se
 * saldrían de la caja por la derecha.
 */
export function partirEnLineas(texto: string, anchoMaximo: number, medir: (s: string) => number): string[] {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of limpio(texto).split(' ')) {
    if (!palabra) continue
    const conElla = actual ? `${actual} ${palabra}` : palabra
    if (medir(conElla) <= anchoMaximo) {
      actual = conElla
      continue
    }
    if (actual) lineas.push(actual)
    let resto = palabra
    while (resto.length > 1 && medir(resto) > anchoMaximo) {
      let n = resto.length - 1
      while (n > 1 && medir(resto.slice(0, n)) > anchoMaximo) n--
      lineas.push(resto.slice(0, n))
      resto = resto.slice(n)
    }
    actual = resto
  }
  if (actual) lineas.push(actual)
  return lineas
}

export type PosicionDelCuadro = 'abajo' | 'arriba'

export interface DisposicionDelCuadro {
  /** El alto de la letra, en píxeles de la grabación. */
  tamano: number
  interlinea: number
  relleno: number
  lineas: string[]
  caja: { x: number; y: number; ancho: number; alto: number }
}

/** Un cuadro no pasa de un tercio del alto: más taparía el gesto que explica. */
const ALTO_MAXIMO_DEL_CUADRO = 1 / 3

/**
 * La letra al empezar, en fracción del alto: un 6 %, unos 43 px a 720.
 *
 * Es grande a propósito. El residente ve la demostración casi siempre en el
 * panel del paso, a 220 px de alto, y ahí 43 px quedan en unos 12: lo justo
 * para leerse. Con la letra de un subtítulo de cine no se leería nada.
 */
const LETRA_INICIAL = 0.06

/** Por debajo de esto no se achica más: lo que no cabe se corta con «…». */
const LETRA_MINIMA_PX = 16

/**
 * Dónde y con qué letra va un cuadro en una imagen de `ancho` × `alto`.
 *
 * Centrado, abajo o arriba, y ajustado a su texto. La letra empieza en
 * `LETRA_INICIAL` y baja de a dos píxeles hasta que el cuadro quepa en un
 * tercio de la imagen. Si ni con la mínima cabe, se corta, y eso se ve al
 * grabar. `null` si no hay texto.
 */
export function disponerElCuadro(
  texto: string,
  ancho: number,
  alto: number,
  medir: (texto: string, tamano: number) => number,
  posicion: PosicionDelCuadro = 'abajo',
): DisposicionDelCuadro | null {
  const contenido = limpio(texto)
  if (!contenido || !(ancho > 0) || !(alto > 0)) return null
  const margen = Math.round(Math.min(ancho, alto) * 0.04)
  const inicial = Math.round(alto * LETRA_INICIAL)
  const minima = Math.min(LETRA_MINIMA_PX, inicial)
  let tamano = Math.max(minima, inicial)
  for (;;) {
    const relleno = Math.round(tamano * 0.6)
    const interlinea = Math.round(tamano * 1.3)
    const anchoDelTexto = Math.max(1, ancho - 2 * margen - 2 * relleno)
    const enEste = (s: string) => medir(s, tamano)
    let lineas = partirEnLineas(contenido, anchoDelTexto, enEste)
    const caben = Math.max(1, Math.floor((alto * ALTO_MAXIMO_DEL_CUADRO - 2 * relleno) / interlinea))
    if (lineas.length > caben && tamano > minima) {
      tamano = Math.max(minima, tamano - 2)
      continue
    }
    if (lineas.length > caben) lineas = recortar(lineas, caben, anchoDelTexto, enEste)
    const anchoDeLaCaja = Math.min(
      ancho - 2 * margen,
      Math.ceil(Math.max(...lineas.map(enEste))) + 2 * relleno,
    )
    const altoDeLaCaja = lineas.length * interlinea + 2 * relleno
    return {
      tamano,
      interlinea,
      relleno,
      lineas,
      caja: {
        x: Math.round((ancho - anchoDeLaCaja) / 2),
        y: posicion === 'arriba' ? margen : alto - margen - altoDeLaCaja,
        ancho: anchoDeLaCaja,
        alto: altoDeLaCaja,
      },
    }
  }
}

/** Las primeras `caben` líneas, y la última con «…» y sin las palabras que ya no entran con él. */
function recortar(lineas: string[], caben: number, anchoMaximo: number, medir: (s: string) => number): string[] {
  const quedan = lineas.slice(0, caben)
  let ultima = quedan[caben - 1]
  while (ultima.includes(' ') && medir(`${ultima}…`) > anchoMaximo) ultima = ultima.slice(0, ultima.lastIndexOf(' '))
  quedan[caben - 1] = `${ultima}…`
  return quedan
}

export interface GradienteDelFondo {
  /** El centro, en fracción del ancho y del alto. */
  centro: [number, number]
  paradas: { color: string; en: number }[]
}

/** Parte por las comas de primer nivel: las de dentro de `rgb(…)` son del color, no separan paradas. */
function partirPorComas(texto: string): string[] {
  const partes: string[] = []
  let hondura = 0
  let desde = 0
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '(') hondura++
    else if (c === ')') hondura--
    else if (c === ',' && hondura === 0) {
      partes.push(texto.slice(desde, i).trim())
      desde = i + 1
    }
  }
  partes.push(texto.slice(desde).trim())
  return partes.filter((p) => p.length > 0)
}

/**
 * El degradado radial de detrás del lienzo, leído de su estilo calculado.
 *
 * El lienzo de three.js es transparente, y lo que se ve alrededor del modelo es
 * el foco de `.consola .consola-lienzo` (`consola.css`), que es CSS. En el vídeo
 * no hay CSS: sin pintarlo detrás, el fondo sale negro, o del azul plano de la
 * consola si se tomara su color. Se lee del estilo calculado en vez de copiar
 * sus colores aquí para que un cambio en la hoja llegue solo a las grabaciones.
 *
 * Entiende lo que devuelve el navegador para ese foco, `radial-gradient(at 50%
 * 42%, rgb(…) 0%, …)`; una parada sin posición se reparte entre sus vecinas.
 * `null` si no es un degradado radial, y entonces se pinta el color de fondo.
 */
export function gradienteDelFondo(css: string): GradienteDelFondo | null {
  const m = /^\s*radial-gradient\((.*)\)\s*$/i.exec(css)
  if (!m) return null
  const partes = partirPorComas(m[1])
  let centro: [number, number] = [0.5, 0.5]
  const primera = partes[0] ?? ''
  if (/^(circle|ellipse|closest|farthest|at\s)/i.test(primera) || /\sat\s/i.test(` ${primera}`)) {
    const en = /at\s+(-?[\d.]+)%\s+(-?[\d.]+)%/i.exec(primera)
    if (en) centro = [Number(en[1]) / 100, Number(en[2]) / 100]
    partes.shift()
  }
  const paradas: { color: string; en: number | null }[] = partes.map((p) => {
    const conPosicion = /^(.*\S)\s+(-?[\d.]+)%$/.exec(p)
    return conPosicion ? { color: conPosicion[1], en: Number(conPosicion[2]) / 100 } : { color: p, en: null }
  })
  if (paradas.length < 2) return null
  if (paradas[0].en === null) paradas[0].en = 0
  if (paradas[paradas.length - 1].en === null) paradas[paradas.length - 1].en = 1
  for (let i = 1; i < paradas.length - 1; i++) {
    if (paradas[i].en !== null) continue
    let j = i
    while (paradas[j].en === null) j++
    const antes = paradas[i - 1].en as number
    const despues = paradas[j].en as number
    for (let k = i; k < j; k++) paradas[k].en = antes + ((despues - antes) * (k - i + 1)) / (j - i + 1)
  }
  return { centro, paradas: paradas.map((p) => ({ color: p.color, en: Math.min(1, Math.max(0, p.en as number)) })) }
}

/**
 * Los radios de la elipse de un degradado `farthest-corner`, el tamaño por
 * omisión de CSS: la de `farthest-side` agrandada hasta tocar la esquina más
 * lejana, que es multiplicarla por √2.
 */
export function radiosDelGradiente(centro: [number, number], ancho: number, alto: number): [number, number] {
  const cx = centro[0] * ancho
  const cy = centro[1] * alto
  return [Math.SQRT2 * Math.max(cx, ancho - cx), Math.SQRT2 * Math.max(cy, alto - cy)]
}

/**
 * El nombre del archivo: «demostracion-paso-3-incision-de-piel-2026-11-06.webm».
 *
 * Sale así en la biblioteca de medios (`formularioDeArchivo` usa el nombre sin
 * extensión como título y como texto alternativo), y ahí tiene que poder
 * encontrarse sin abrirlo. Va sin tildes ni espacios porque es también la
 * dirección del archivo en el servidor.
 */
export function nombreDeLaGrabacion(titulo: string, numero: number, fecha: Date, formato: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  const dia = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  return `demostracion-paso-${numero}${base ? `-${base}` : ''}-${dia}.${extensionDelFormato(formato)}`
}
