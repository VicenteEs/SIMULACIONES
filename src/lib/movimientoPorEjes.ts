/**
 * Mover un trozo de hueso o la placa por los ejes del paciente (P-004 E7, pedido 15 de Cristóbal).
 *
 * «Nos manejamos bastante con el sistema de ejes, pero se hace pesado»: las asas del taller son siete a la vez (tres
 * flechas, tres aros y el aro de la vista). El menú que se pide es de tres botones —**Trasladar**, **Angular**, **Rotar**—,
 * cada uno con los ejes que tiene sentido elegir, y se mueve con las flechas del teclado o arrastrando. Aquí está la parte
 * que no necesita pantalla: qué ejes hay, cuál es el eje físico de cada movimiento, cuánto vale una pulsación y cómo se dice.
 *
 * Los tres ejes son los del paciente (`posicionDelPaciente.ts`): **axial** es a lo largo del hueso (proximal ↔ distal),
 * **coronal** de lado a lado (medial ↔ lateral) y **sagital** de delante atrás (anterior ↔ posterior). Coinciden con
 * las medidas que ya calcula el motor (desplazamiento, angulación, diástasis).
 *
 * Es puro y sin three: lo lee el lienzo, el menú y las pruebas.
 */

import { ejesDelPaciente, type EjeDelHueso, type Vec3 } from './posicionDelPaciente'

export type AccionDeMovimiento = 'trasladar' | 'angular' | 'rotar'
export type EjeAnatomico = 'coronal' | 'axial' | 'sagital'

export interface DefinicionDeEje {
  eje: EjeAnatomico
  etiqueta: string
  ayuda: string
}

export interface DefinicionDeAccion {
  accion: AccionDeMovimiento
  etiqueta: string
  ayuda: string
  unidad: 'mm' | '°'
  ejes: readonly DefinicionDeEje[]
}

/** Lo que ofrece el menú, en el orden del documento: Trasladar (tres ejes), Angular (dos), Rotar (sin elegir eje). */
export const ACCIONES_DE_MOVIMIENTO: readonly DefinicionDeAccion[] = [
  {
    accion: 'trasladar',
    etiqueta: 'Trasladar',
    ayuda: 'Desplaza el trozo sin girarlo, a lo largo de un eje del paciente.',
    unidad: 'mm',
    ejes: [
      { eje: 'coronal', etiqueta: 'Coronal', ayuda: 'De lado a lado: medial ↔ lateral.' },
      { eje: 'axial', etiqueta: 'Axial', ayuda: 'A lo largo del hueso: proximal ↔ distal.' },
      { eje: 'sagital', etiqueta: 'Sagital', ayuda: 'De delante atrás: anterior ↔ posterior.' },
    ],
  },
  {
    accion: 'angular',
    etiqueta: 'Angular',
    ayuda: 'Corrige la angulación del trozo en uno de los dos planos.',
    unidad: '°',
    ejes: [
      { eje: 'coronal', etiqueta: 'Coronal', ayuda: 'Varo / valgo: la angulación vista de frente.' },
      { eje: 'sagital', etiqueta: 'Sagital', ayuda: 'Antecurvatum / recurvatum: la angulación vista de perfil.' },
    ],
  },
  {
    accion: 'rotar',
    etiqueta: 'Rotar',
    ayuda: 'Gira el trozo sobre el eje largo del hueso: la mala rotación.',
    unidad: '°',
    ejes: [{ eje: 'axial', etiqueta: 'Sobre el hueso', ayuda: 'Giro sobre el eje largo.' }],
  },
]

export function definicionDeLaAccion(accion: AccionDeMovimiento): DefinicionDeAccion {
  return ACCIONES_DE_MOVIMIENTO.find((a) => a.accion === accion) as DefinicionDeAccion
}

/** ¿Es un eje que esa acción ofrece? (Angular no tiene axial: eso es Rotar.) */
export function ejeValidoPara(accion: AccionDeMovimiento, eje: EjeAnatomico): boolean {
  return definicionDeLaAccion(accion).ejes.some((e) => e.eje === eje)
}

/**
 * El eje físico del movimiento: a lo largo de cuál se traslada o alrededor de cuál se gira.
 *
 * Trasladar es a lo largo del eje elegido. Angular es **alrededor del eje perpendicular al plano**: una angulación
 * coronal (varo/valgo) se ve de frente y es un giro alrededor del eje de delante atrás (sagital); una sagital
 * (antecurvatum/recurvatum) se ve de perfil y es un giro alrededor del de lado a lado (coronal). Rotar es sobre el eje largo.
 */
export function ejeFisicoDelMovimiento(accion: AccionDeMovimiento, eje: EjeAnatomico): EjeAnatomico {
  if (accion === 'trasladar') return eje
  if (accion === 'rotar') return 'axial'
  return eje === 'coronal' ? 'sagital' : 'coronal'
}

/** El vector unitario de un eje del paciente, en los ejes del archivo del modelo. */
export function vectorDelEje(eje: EjeAnatomico, ejeLargo: EjeDelHueso): Vec3 {
  const { hueso, frente, lado } = ejesDelPaciente(ejeLargo)
  return eje === 'axial' ? hueso : eje === 'sagital' ? frente : lado
}

/** Qué letra del archivo (x, y, z) es ese eje: lo que esperan `desplazamientoDelArrastre` y `giroDelArrastre`. */
export function letraDelEje(eje: EjeAnatomico, ejeLargo: EjeDelHueso): 'x' | 'y' | 'z' {
  const v = vectorDelEje(eje, ejeLargo)
  return v[0] !== 0 ? 'x' : v[1] !== 0 ? 'y' : 'z'
}

/** Lo que vale una pulsación de flecha: 1 mm o 1°; con Mayúsculas, 0,2; con Ctrl, 5. Mayúsculas gana si están las dos. */
export const PASO_BASE = 1
export const PASO_FINO = 0.2
export const PASO_GRANDE = 5

export function pasoDeLaTecla(teclas: { shift?: boolean; ctrl?: boolean; meta?: boolean }): number {
  if (teclas.shift) return PASO_FINO
  if (teclas.ctrl || teclas.meta) return PASO_GRANDE
  return PASO_BASE
}

/** El sentido de una flecha: derecha y arriba suman, izquierda y abajo restan; cualquier otra tecla no dice nada. */
export function sentidoDeLaTecla(tecla: string): 1 | -1 | 0 {
  if (tecla === 'ArrowRight' || tecla === 'ArrowUp') return 1
  if (tecla === 'ArrowLeft' || tecla === 'ArrowDown') return -1
  return 0
}

/**
 * Cuántos grados gira un arrastre horizontal de `pixeles`: 0,4° por píxel, y con Mayúsculas cinco veces más fino, para
 * afinar sin acercar la vista. (Trasladar no lo necesita: lo da `desplazamientoDelArrastre`, que ya proyecta el eje en la
 * pantalla.)
 */
export const GRADOS_POR_PIXEL = 0.4

export function gradosDelArrastre(pixeles: number, fino = false): number {
  const grados = pixeles * GRADOS_POR_PIXEL
  return fino ? grados * PASO_FINO : grados
}

/** Una cifra con coma decimal y signo explícito: «+3,0», «−0,2». */
export function cifraConSigno(valor: number, decimales = 1): string {
  const redondeado = Number(valor.toFixed(decimales))
  const texto = Math.abs(redondeado).toFixed(decimales).replace('.', ',')
  return `${redondeado < 0 ? '−' : '+'}${texto}`
}

/** La lectura que acompaña al movimiento: «Trasladar · axial · +3,0 mm». */
export function lecturaDelMovimiento(accion: AccionDeMovimiento, eje: EjeAnatomico, valor: number): string {
  const d = definicionDeLaAccion(accion)
  const nombreDelEje = d.ejes.find((e) => e.eje === eje)?.etiqueta.toLowerCase() ?? eje
  return `${d.etiqueta} · ${accion === 'rotar' ? 'sobre el hueso' : nombreDelEje} · ${cifraConSigno(valor)} ${d.unidad}`
}

/**
 * Lo que ofrece el menú cuando lo que se mueve es la **placa** y no un trozo de hueso (P-004 E7, «el mismo principio para
 * la placa»): la placa se apoya sobre el hueso y se vuelve a asentar tras cada paso, así que no se inclina en los planos
 * ni se rota sobre el hueso. Se lleva a lo largo (axial), alrededor del hueso (sagital) y se angula sobre su normal.
 */
export const ACCIONES_DE_LA_PLACA: readonly DefinicionDeAccion[] = [
  {
    accion: 'trasladar',
    etiqueta: 'Trasladar',
    ayuda: 'Lleva la placa sobre el hueso: a lo largo (proximal ↔ distal) o alrededor de él (anterior ↔ posterior).',
    unidad: 'mm',
    ejes: [
      { eje: 'axial', etiqueta: 'Proximal ↔ distal', ayuda: 'A lo largo del hueso.' },
      { eje: 'sagital', etiqueta: 'Anterior ↔ posterior', ayuda: 'Alrededor del hueso, de delante atrás.' },
    ],
  },
  {
    accion: 'rotar',
    etiqueta: 'Angular',
    ayuda: 'Gira la placa sobre el hueso, respecto de su eje largo.',
    unidad: '°',
    ejes: [{ eje: 'axial', etiqueta: 'Angulación', ayuda: 'Giro de la placa sobre el hueso.' }],
  },
]

export interface AjusteDeLaPlaca {
  largoMm: number
  ladoMm: number
  giroGrados: number
}

/**
 * El ajuste de la placa tras un paso del menú, o `null` si ese movimiento no es de la placa. `sentidoDelLado` es a qué
 * sentido anatómico lleva el signo + de «de lado a lado» (1 hacia anterior, −1 hacia posterior): el paso se dice en el
 * sentido de la flecha del menú y aquí se traduce al signo del ajuste.
 */
export function ajusteDeLaPlacaPorPaso(
  ajuste: AjusteDeLaPlaca,
  accion: AccionDeMovimiento,
  eje: EjeAnatomico,
  valor: number,
  sentidoDelLado: 1 | -1 | 0,
): AjusteDeLaPlaca | null {
  if (accion === 'trasladar' && eje === 'axial') return { ...ajuste, largoMm: redondear(ajuste.largoMm + valor) }
  if (accion === 'trasladar' && eje === 'sagital') {
    return { ...ajuste, ladoMm: redondear(ajuste.ladoMm + valor * (sentidoDelLado === -1 ? -1 : 1)) }
  }
  if (accion === 'rotar') return { ...ajuste, giroGrados: redondear(ajuste.giroGrados + valor) }
  return null
}

/** Un decimal: los pasos finos son de 0,2 y sumar 0,2 diez veces no debe dejar 1,9999999. */
const redondear = (n: number) => Math.round(n * 10) / 10
