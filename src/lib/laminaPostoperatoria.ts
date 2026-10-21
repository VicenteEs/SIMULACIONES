import type { InsumoDelRecorrido } from '@/lib/insumos'

/**
 * La lámina de la radiografía postoperatoria (P-004 E11, pedido 17).
 *
 * Las diapositivas de la reunión clínica son negras, con el caso arriba a la izquierda (Caso · Dg · Cx · Dr.) y las radiografías
 * al lado. Aquí se decide **qué dice y dónde va** con números, sin lienzo, para poder probarlo; `dibujarLaLamina` solo pinta
 * lo decidido. Por pedido de Cristóbal (Q4) la lámina **no** lleva los insumos ni el puntaje: es una imagen para presentar, no
 * un informe de la simulación.
 */

export const ANCHO_DE_LA_LAMINA = 1920
export const ALTO_DE_LA_LAMINA = 1080

export const MAXIMO_DE_TOMAS = 3

export interface DatosDeLaLamina {
  /** El nombre del caso. */
  caso: string
  /** Dg: la fractura, con su clasificación. */
  diagnostico: string
  /** Cx: lo que se hizo. */
  intervencion: string
  /** El nombre del cirujano, sin el «Dr.». */
  cirujano: string
  /** Texto ya formateado («21-10-2026»). */
  fecha: string
  /** Opcional: quién ayudó. */
  equipo?: string
}

export interface Rectangulo {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Cuántos caracteres admite cada dato: el tope de lo que cabe en la lámina y de lo que se guarda con el recorrido. */
export const TOPES_DE_LOS_DATOS = { caso: 160, diagnostico: 240, intervencion: 320, cirujano: 80, equipo: 160 } as const

/** Recorta y limpia lo escrito: espacios de más fuera, saltos de línea como espacios, el «Dr.» de más fuera y el tope de cada campo. */
export function limpiarLosDatos(d: Partial<DatosDeLaLamina>): DatosDeLaLamina {
  const una = (t: string | undefined, tope: number) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, tope)
  return {
    caso: una(d.caso, TOPES_DE_LOS_DATOS.caso),
    diagnostico: una(d.diagnostico, TOPES_DE_LOS_DATOS.diagnostico),
    intervencion: una(d.intervencion, TOPES_DE_LOS_DATOS.intervencion),
    cirujano: una(d.cirujano, TOPES_DE_LOS_DATOS.cirujano).replace(/^dr[a]?\.?\s+/i, ''),
    fecha: una(d.fecha, 20),
    equipo: una(d.equipo, TOPES_DE_LOS_DATOS.equipo),
  }
}

/** «Dr. Juan Pérez»: el título se pone aquí y no en el dato, para no repetirlo si alguien lo escribe él mismo. */
export const conTituloDeDoctor = (cirujano: string): string => (cirujano.trim() ? `Dr. ${cirujano.trim()}` : 'Dr. ____')

/** Las líneas de texto de la lámina, en el orden de la diapositiva. Un dato vacío no deja una línea con solo la etiqueta. */
export function lineasDeLaLamina(d: DatosDeLaLamina): { etiqueta: string; texto: string }[] {
  const lineas = [
    { etiqueta: 'Caso', texto: d.caso },
    { etiqueta: 'Dg', texto: d.diagnostico },
    { etiqueta: 'Cx', texto: d.intervencion },
    { etiqueta: 'Cirujano', texto: d.cirujano ? conTituloDeDoctor(d.cirujano) : '' },
    { etiqueta: 'Equipo', texto: d.equipo ?? '' },
    { etiqueta: 'Fecha', texto: d.fecha },
  ]
  return lineas.filter((l) => l.texto !== '')
}

/**
 * Parte un texto en líneas que no pasen de `ancho` según `medir`. Una palabra más ancha que la línea queda sola en su línea:
 * se prefiere que se salga un poco a cortarla en medio.
 */
export function partirEnLineas(texto: string, ancho: number, medir: (t: string) => number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (actual && medir(prueba) > ancho) {
      lineas.push(actual)
      actual = palabra
    } else actual = prueba
  }
  if (actual) lineas.push(actual)
  return lineas
}

export const MARGEN = 60
export const ALTO_DE_LA_FRANJA = 130
const COLUMNA_DEL_TEXTO = 700
const SEPARACION = 24

/** El rectángulo del texto, a la izquierda, debajo de la franja. */
export const areaDelTexto: Rectangulo = {
  x: MARGEN,
  y: ALTO_DE_LA_FRANJA + 50,
  ancho: COLUMNA_DEL_TEXTO,
  alto: ALTO_DE_LA_LAMINA - ALTO_DE_LA_FRANJA - 50 - MARGEN,
}

/** El rectángulo de las radiografías, a la derecha del texto. */
export const areaDeLasTomas: Rectangulo = {
  x: MARGEN + COLUMNA_DEL_TEXTO + 60,
  y: ALTO_DE_LA_FRANJA + 50,
  ancho: ANCHO_DE_LA_LAMINA - (MARGEN + COLUMNA_DEL_TEXTO + 60) - MARGEN,
  alto: ALTO_DE_LA_LAMINA - ALTO_DE_LA_FRANJA - 50 - MARGEN,
}

/** El logotipo, a la derecha de la franja: su caja, dentro de la que se centra la imagen conservando su proporción. */
export const cajaDelLogotipo: Rectangulo = { x: ANCHO_DE_LA_LAMINA - MARGEN - 360, y: 25, ancho: 360, alto: 80 }

/** Lo que mide el pie de cada radiografía («AP», «Lateral»). */
const ALTO_DEL_PIE = 44

/**
 * Dónde va cada radiografía: en fila, centradas en su área, todas de la misma proporción (3 : 4) y lo más grandes que quepan.
 * Con una sola la placa llena el alto; con tres se achica para que quepan lado a lado.
 */
export function disposicionDeLasTomas(cuantas: number, proporcion = 3 / 4): Rectangulo[] {
  const n = Math.max(0, Math.min(MAXIMO_DE_TOMAS, Math.floor(cuantas)))
  if (n === 0) return []
  const a = areaDeLasTomas
  const anchoPorAlto = (a.alto - ALTO_DEL_PIE) * proporcion
  const anchoPorFila = (a.ancho - SEPARACION * (n - 1)) / n
  const ancho = Math.floor(Math.min(anchoPorAlto, anchoPorFila))
  const alto = Math.floor(ancho / proporcion)
  const total = ancho * n + SEPARACION * (n - 1)
  const x0 = a.x + Math.floor((a.ancho - total) / 2)
  const y0 = a.y + Math.floor((a.alto - ALTO_DEL_PIE - alto) / 2)
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (ancho + SEPARACION), y: y0, ancho, alto }))
}

/** Cabe una imagen de `w × h` en `caja` sin deformarse y centrada. */
export function ajustarEnLaCaja(w: number, h: number, caja: Rectangulo): Rectangulo {
  if (w <= 0 || h <= 0) return { ...caja, ancho: 0, alto: 0 }
  const escala = Math.min(caja.ancho / w, caja.alto / h)
  const ancho = w * escala
  const alto = h * escala
  return { x: caja.x + (caja.ancho - ancho) / 2, y: caja.y + (caja.alto - alto) / 2, ancho, alto }
}

/**
 * La intervención que se propone según lo usado en el recorrido (E7): el cirujano la corrige, pero parte de algo que ya es
 * verdad en vez de una línea en blanco. Se deduce del nombre de los insumos; sin implantes devuelve «».
 */
export function intervencionPropuesta(insumos: readonly InsumoDelRecorrido[]): string {
  const sinLargo = (n: string) => n.replace(/\s*×\s*[\d,]+\s*mm$/i, '')
  // La frase ya dice «placa» o «clavo endomedular»: el nombre del insumo no lo repite («placa DCP 4,5 mm», no «placa Placa DCP 4,5 mm»).
  const sinElTipo = (n: string) => sinLargo(n).replace(/^(placa|clavo endomedular|clavo)\s+/i, '')
  const esTornillo = (i: InsumoDelRecorrido) => /tornillo/i.test(i.nombre)
  const esPlaca = (i: InsumoDelRecorrido) => /placa/i.test(i.nombre) && !esTornillo(i)
  const esClavo = (i: InsumoDelRecorrido) => /clavo/i.test(i.nombre) && !esTornillo(i)
  const placas = [...new Set(insumos.filter(esPlaca).map((i) => sinElTipo(i.nombre)))]
  const clavos = [...new Set(insumos.filter(esClavo).map((i) => sinElTipo(i.nombre)))]
  const tornillos = insumos.filter(esTornillo).reduce((s, i) => s + i.cantidad, 0)
  const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
  const tornillosTexto = tornillos > 0 ? `${tornillos} ${tornillos === 1 ? 'tornillo' : 'tornillos'}` : ''

  if (placas.length > 0) {
    return `Reducción abierta y osteosíntesis con ${placas.length === 1 ? 'placa' : 'placas'} ${lista(placas)}${tornillosTexto ? ` y ${tornillosTexto}` : ''}`
  }
  if (clavos.length > 0) {
    return `Reducción y osteosíntesis con clavo endomedular ${lista(clavos)}${tornillosTexto ? ` y ${tornillosTexto} de bloqueo` : ''}`
  }
  if (tornillosTexto) return `Reducción y osteosíntesis con ${tornillosTexto}`
  return ''
}

/** Las frases que se ofrecen para completar la intervención a mano, como en el pedido. */
export const SUGERENCIAS_DE_INTERVENCION: readonly string[] = [
  'Reducción abierta y osteosíntesis con placa',
  'Reducción y osteosíntesis con clavo endomedular',
  'Reducción y osteosíntesis con tornillos',
]

/** La fecha como «21-10-2026», que es como se escribe en las diapositivas. */
export function fechaParaLaLamina(fecha: Date = new Date()): string {
  const d = String(fecha.getDate()).padStart(2, '0')
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  return `${d}-${m}-${fecha.getFullYear()}`
}

/** Lo que se escribe dentro del PNG (ver `pngConMetadatos.ts`): todo lo de la lámina, para encontrarla sin abrirla. */
export function textosDeLosMetadatos(d: DatosDeLaLamina, ahora: Date = new Date()): Record<string, string> {
  return {
    Title: `Radiografía postoperatoria · ${d.caso}`.slice(0, 200),
    Author: d.cirujano ? conTituloDeDoctor(d.cirujano) : '',
    Description: [d.diagnostico && `Dg: ${d.diagnostico}`, d.intervencion && `Cx: ${d.intervencion}`].filter(Boolean).join('\n'),
    Software: 'TraumaHub',
    'Creation Time': ahora.toISOString(),
    'traumahub:caso': d.caso,
    'traumahub:fecha': d.fecha,
  }
}

/** El nombre del archivo: sin tildes ni signos, para que ningún sistema lo rechace. */
export function nombreDelArchivo(d: DatosDeLaLamina): string {
  const base = d.caso
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `radiografia-postoperatoria-${base || 'caso'}.png`
}

export interface TomaParaLaLamina {
  /** El lienzo con la placa ya revelada. */
  imagen: CanvasImageSource
  etiqueta: string
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * Pinta la lámina sobre un lienzo de 1920 × 1080. Todo lo que decide dónde va sale de las funciones de arriba; aquí solo
 * se dibuja. Sin `logo`, la franja queda con el nombre escrito.
 */
export function dibujarLaLamina(
  ctx: CanvasRenderingContext2D,
  datos: DatosDeLaLamina,
  tomas: readonly TomaParaLaLamina[],
  logo: (CanvasImageSource & { width: number; height: number }) | null,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ANCHO_DE_LA_LAMINA, ALTO_DE_LA_LAMINA)

  // La franja
  ctx.fillStyle = '#f2f2f2'
  ctx.font = `600 54px ${FUENTE}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('Radiografía postoperatoria', MARGEN, ALTO_DE_LA_FRANJA / 2)
  if (logo) {
    const c = ajustarEnLaCaja(logo.width, logo.height, cajaDelLogotipo)
    // El logotipo es de trazo oscuro y sobre negro no se lee: va sobre una placa clara, como en la cabecera de la plataforma.
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.roundRect(c.x - 16, c.y - 8, c.ancho + 32, c.alto + 16, 14)
    ctx.fill()
    ctx.drawImage(logo, c.x, c.y, c.ancho, c.alto)
  } else {
    ctx.textAlign = 'right'
    ctx.fillText('TraumaHub', ANCHO_DE_LA_LAMINA - MARGEN, ALTO_DE_LA_FRANJA / 2)
    ctx.textAlign = 'left'
  }
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(MARGEN, ALTO_DE_LA_FRANJA, ANCHO_DE_LA_LAMINA - 2 * MARGEN, 2)

  // El texto: la etiqueta en gris y el dato en blanco, cada dato en las líneas que necesite
  ctx.textBaseline = 'alphabetic'
  let y = areaDelTexto.y + 44
  const interlineado = 46
  for (const l of lineasDeLaLamina(datos)) {
    ctx.font = `600 34px ${FUENTE}`
    ctx.fillStyle = '#9a9a9a'
    ctx.fillText(l.etiqueta.toUpperCase(), areaDelTexto.x, y)
    y += 46
    ctx.font = `400 40px ${FUENTE}`
    ctx.fillStyle = '#f5f5f5'
    for (const linea of partirEnLineas(l.texto, areaDelTexto.ancho, (t) => ctx.measureText(t).width)) {
      ctx.fillText(linea, areaDelTexto.x, y)
      y += interlineado
    }
    y += 26
  }

  // Las radiografías
  const sitios = disposicionDeLasTomas(tomas.length)
  tomas.slice(0, sitios.length).forEach((t, i) => {
    const r = sitios[i]
    ctx.fillStyle = '#000'
    ctx.fillRect(r.x, r.y, r.ancho, r.alto)
    ctx.drawImage(t.imagen, r.x, r.y, r.ancho, r.alto)
    ctx.strokeStyle = '#3a3a3a'
    ctx.lineWidth = 2
    ctx.strokeRect(r.x, r.y, r.ancho, r.alto)
    ctx.fillStyle = '#cfcfcf'
    ctx.font = `500 30px ${FUENTE}`
    ctx.textAlign = 'center'
    ctx.fillText(t.etiqueta, r.x + r.ancho / 2, r.y + r.alto + 36)
    ctx.textAlign = 'left'
  })
}
