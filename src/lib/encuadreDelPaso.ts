import type { PosicionDelPaciente, Vec3 } from './posicionDelPaciente'

/**
 * El encuadre de un paso del simulador (P-009, mejora de uso 1): desde dónde se mira al entrar en él.
 *
 * Antes la cámara se quedaba donde la dejó el paso anterior. Para cortar la piel se mira de frente al trazo y para
 * reducir, la fractura de lado; el residente pasaba de un paso al otro y tenía que buscar con el ratón lo que el paso
 * pedía antes de poder hacerlo, y eso no es lo que se evalúa. Ahora el editor deja la cámara como quiere que se vea el
 * paso y pulsa «Guardar este encuadre»; al entrar en él, el lienzo la lleva ahí.
 *
 * Va guardado como diez números sueltos (`encuadre` de cada paso en `Cirugias.ts`) y no como un JSON, por lo mismo que la
 * posición reducida de las piezas: el formulario del panel sabe llevar números y `depurar` tira lo que no está descrito.
 * Aquí se pasa de esa forma plana a la que usa el lienzo y de vuelta, y se descarta lo que no sea un encuadre de verdad.
 *
 * Puro y sin three: lo usan la traducción del caso en el servidor y la consola.
 */

export interface EncuadreDelPaso {
  /** Desde el punto mirado hacia la cámara, unitario. */
  direccion: Vec3
  /** El arriba de la cámara, unitario. */
  arriba: Vec3
  /** El punto al que mira, en unidades del modelo. */
  centro: Vec3
  /** A qué distancia de él, en unidades del modelo. */
  distancia: number
}

/** Los nombres de los diez números del grupo, en el orden en que se guardan. */
export type CampoDelEncuadre = 'dx' | 'dy' | 'dz' | 'ax' | 'ay' | 'az' | 'cx' | 'cy' | 'cz' | 'distancia'

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const unitario = (v: Vec3): Vec3 | null => {
  const largo = Math.hypot(v[0], v[1], v[2])
  return largo > 1e-9 ? [v[0] / largo, v[1] / largo, v[2] / largo] : null
}

/**
 * El encuadre que guarda un paso, o `null` si no guarda ninguno. Un grupo a medio llenar —un paso de antes de P-009 trae
 * las diez columnas vacías— no es un encuadre, y una dirección nula tampoco: con ella la cámara se quedaría encima del
 * punto que mira.
 */
export function encuadreDelGrupo(grupo: unknown): EncuadreDelPaso | null {
  if (!grupo || typeof grupo !== 'object') return null
  const g = grupo as Partial<Record<CampoDelEncuadre, unknown>>
  const n = [g.dx, g.dy, g.dz, g.ax, g.ay, g.az, g.cx, g.cy, g.cz, g.distancia]
  if (!n.every(finito)) return null
  const [dx, dy, dz, ax, ay, az, cx, cy, cz, distancia] = n as number[]
  const direccion = unitario([dx, dy, dz])
  const arriba = unitario([ax, ay, az])
  if (!direccion || !arriba || !(distancia > 0)) return null
  return { direccion, arriba, centro: [cx, cy, cz], distancia }
}

/** Lo contrario: el encuadre como los diez números que guarda el paso. */
export function grupoDelEncuadre(e: EncuadreDelPaso): Record<CampoDelEncuadre, number> {
  return {
    dx: e.direccion[0],
    dy: e.direccion[1],
    dz: e.direccion[2],
    ax: e.arriba[0],
    ay: e.arriba[1],
    az: e.arriba[2],
    cx: e.centro[0],
    cy: e.centro[1],
    cz: e.centro[2],
    distancia: e.distancia,
  }
}

/** La posición del paciente de un paso, si la trae y es una de las tres. */
export function posicionDelPaso(valor: unknown): PosicionDelPaciente | null {
  return valor === 'de-pie' || valor === 'supino' || valor === 'prono' ? valor : null
}
