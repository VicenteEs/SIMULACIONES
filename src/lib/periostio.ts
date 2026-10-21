/**
 * Despegar el periostio (P-005 E2): el Freer y los periostótomos (Lambotte, Farabeuf).
 *
 * En pabellón, antes de apoyar una placa se **eleva el periostio** de la cortical donde va a ir: con el periostótomo se despega la capa que cubre el hueso,
 * en una franja del ancho de la hoja, respetando lo que se pueda su irrigación. Hay que despegar **lo justo**: placa sobre periostio no asienta bien, y
 * despegar de más —sobre todo alrededor de los fragmentos— les quita la sangre y los devitaliza.
 *
 * Esto es lo que se puede probar sin lienzo: cada pasada del instrumento deja **huellas** (discos del ancho de la hoja sobre el hueso, en mm) y de ahí se
 * saca el área expuesta, qué agujeros de la placa caen sobre hueso desnudo y qué decirle a quien despega. El lienzo solo dibuja las huellas.
 * Las cifras son una propuesta que el traumatólogo debe revisar: se leen y se cambian aquí.
 */

/** Un disco de periostio levantado: centro en mm (mundo), la normal del hueso ahí (unitaria) y el radio. */
export interface Huella {
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  radioMm: number
}

/** El lado de la cuadrícula con que se mide el área: 1,5 mm. Más fino cuesta más y no cambia lo que se dice. */
export const CELDA_MM = 1.5

/** Cuánto se espacian las huellas a lo largo de una pasada: que se solapen, para que la franja sea continua. */
export const espaciadoEntreHuellasMm = (radioMm: number): number => Math.max(0.6, radioMm * 0.6)

/** Cuánto hueso expuesto empieza a ser mucho (mm², aproximado): por encima se corre el riesgo de devitalizar lo que queda sin periostio. */
export const AREA_QUE_DEVITALIZA_MM2 = 2500

/** Cuántas huellas caben en el dibujo de una vez. */
export const MAXIMO_DE_HUELLAS = 5000

/** Cuánto margen se da a un agujero para decir que está sobre hueso despegado: lo que sobresale la cabeza del tornillo. */
export const MARGEN_DEL_AGUJERO_MM = 1.5

const llave = (i: number, j: number, k: number) => `${i},${j},${k}`

/**
 * Cuánto hueso quedó expuesto, en mm² (aproximado): las celdas de 1,5 mm cuyo centro cae dentro de alguna huella, sin contar dos veces donde se solapan.
 * Mide superficie y no volumen porque las huellas están sobre la cortical.
 */
export function areaExpuestaMm2(huellas: readonly Huella[]): number {
  const celdas = new Set<string>()
  for (const h of huellas) {
    const n = Math.ceil(h.radioMm / CELDA_MM)
    const ci = Math.round(h.x / CELDA_MM)
    const cj = Math.round(h.y / CELDA_MM)
    const ck = Math.round(h.z / CELDA_MM)
    for (let i = ci - n; i <= ci + n; i++)
      for (let j = cj - n; j <= cj + n; j++)
        for (let k = ck - n; k <= ck + n; k++) {
          const dx = i * CELDA_MM - h.x
          const dy = j * CELDA_MM - h.y
          const dz = k * CELDA_MM - h.z
          // Un disco sobre la superficie y no una bola: la celda tiene que estar sobre el plano del disco (a lo sumo media celda de él) y dentro de su radio.
          const alto = dx * h.nx + dy * h.ny + dz * h.nz
          if (Math.abs(alto) > CELDA_MM / 2) continue
          if (Math.hypot(dx - alto * h.nx, dy - alto * h.ny, dz - alto * h.nz) <= h.radioMm) celdas.add(llave(i, j, k))
        }
  }
  // Las celdas que cruza un disco son una capa de una celda de grosor: el área es su número por la cara de la celda. Un plano inclinado cruza algo más de
  // una celda de espesor (hasta 1,7 en diagonal); se descuenta con la razón media (≈ 1,25) y el resultado es aproximado, como dice el texto.
  return (celdas.size * CELDA_MM * CELDA_MM) / 1.25
}

/** ¿Está expuesto el punto (mm)? Cae dentro de alguna huella, con un margen. */
export function estaExpuesto(huellas: readonly Huella[], punto: { x: number; y: number; z: number }, margenMm = 0): boolean {
  return huellas.some((h) => Math.hypot(h.x - punto.x, h.y - punto.y, h.z - punto.z) <= h.radioMm + margenMm)
}

/** Los agujeros (índices, desde 0) cuyo centro **no** está sobre hueso despegado. */
export function agujerosSobrePeriostio(huellas: readonly Huella[], centrosMm: readonly { x: number; y: number; z: number }[]): number[] {
  const sin: number[] = []
  centrosMm.forEach((c, i) => {
    if (!estaExpuesto(huellas, c, MARGEN_DEL_AGUJERO_MM)) sin.push(i)
  })
  return sin
}

export interface JuicioDeLaExposicion {
  /** Qué decir, o `null` si está bien. */
  aviso: string | null
  /** Se despegó más de lo que conviene. */
  demasiado: boolean
  /** No se despegó nada donde va la placa. */
  nada: boolean
}

/**
 * Qué se dice al dar la placa por buena, según lo despegado: sin nada despegado, que en pabellón se eleva antes; con algunos agujeros fuera, cuáles; y si el área
 * pasa del tope, que se despegó de más. Con todo bien, `null`.
 */
export function juicioDeLaExposicion(p: { areaMm2: number; huellas: number; agujerosTotal: number; agujerosSinExponer: readonly number[] }): JuicioDeLaExposicion {
  const demasiado = p.areaMm2 > AREA_QUE_DEVITALIZA_MM2
  if (p.huellas === 0) {
    return {
      aviso: 'No se despegó el periostio: en pabellón se eleva con el periostótomo antes de apoyar la placa, y una placa sobre periostio no asienta bien.',
      demasiado: false,
      nada: true,
    }
  }
  const partes: string[] = []
  if (p.agujerosSinExponer.length > 0) {
    const lista = p.agujerosSinExponer.map((i) => i + 1)
    const nombre = lista.length === 1 ? `el agujero ${lista[0]}` : `los agujeros ${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
    partes.push(`${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${lista.length === 1 ? 'cae' : 'caen'} sobre periostio sin despegar.`)
  }
  if (demasiado) {
    partes.push(`Se despegó mucho (${Math.round(p.areaMm2)} mm²): sin su periostio el hueso pierde irrigación, sobre todo en los fragmentos. Despegue solo lo que la placa cubre.`)
  }
  return { aviso: partes.length > 0 ? partes.join(' ') : null, demasiado, nada: false }
}

/** Una línea para el recuadro: «Expuesto: 420 mm² (aprox.)». */
export function textoDeLaExposicion(areaMm2: number, huellas: number): string {
  if (huellas === 0) return 'Todavía no se despegó nada: el hueso está cubierto por su periostio.'
  const cifra = Math.round(areaMm2 / 10) * 10
  return `Expuesto: unos ${cifra} mm²${areaMm2 > AREA_QUE_DEVITALIZA_MM2 ? ' (mucho: se pierde irrigación)' : ''}.`
}
