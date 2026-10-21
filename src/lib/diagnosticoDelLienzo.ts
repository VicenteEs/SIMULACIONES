/**
 * Qué estaba pasando cuando el navegador le quitó el contexto gráfico a la página.
 *
 * Cada pérdida deja una línea en `localStorage` con lo que el lienzo sabía en ese momento: la tarjeta, el tamaño del dibujo, cuánta geometría y cuántas texturas había, la memoria
 * de JavaScript y qué carga llevaba la escena (tornillos, trozos de injerto, huellas de periostio). Sin esto, «se fue a blanco» y «se pegó» se explican por sospechas; con
 * esto, tras una pérdida real se lee la causa probable en el equipo donde ocurrió (`localStorage.getItem('traumahub:diagnostico-del-lienzo')` en la consola del navegador).
 */

export const CLAVE_DEL_DIAGNOSTICO = 'traumahub:diagnostico-del-lienzo'
const MAXIMO_DE_REGISTROS = 10

export interface RegistroDeUnaPerdida {
  cuando: string
  tarjeta: string
  /** Tamaño del dibujo en píxeles reales y razón de píxeles con que se pidió. */
  pixeles: { ancho: number; alto: number; razon: number }
  geometrias: number
  texturas: number
  programas: number
  objetos: number
  /** Millones de vértices en la escena. */
  verticesM: number
  /** Memoria de JavaScript en uso, en MB, si el navegador la dice. */
  memoriaJsMb: number | null
  /** Lo puesto en el paciente cuando ocurrió. */
  carga: { tornillos: number; trozosDeInjerto: number; huellasDePeriostio: number; clavo: boolean; placa: boolean }
  /** Cuántas pérdidas lleva la página en este equipo, contando esta. */
  perdidasEnEsteEquipo: number
  /** Si la pestaña estaba a la vista: una pérdida con la pestaña oculta no es por la carga del dibujo. */
  pestana: 'visible' | 'oculta'
}

/**
 * Una causa probable, en una frase, a partir de lo registrado. No es un diagnóstico: ordena qué mirar primero.
 */
export function causaProbable(r: RegistroDeUnaPerdida): string {
  const millones = (r.pixeles.ancho * r.pixeles.alto) / 1e6
  if (r.pestana === 'oculta') return 'La pestaña estaba oculta: el navegador libera la tarjeta de las pestañas que no se ven, y no es por la carga de la escena.'
  if (millones >= 6) return `El dibujo era de ${millones.toFixed(1)} millones de píxeles (con suavizado, varias veces eso en la tarjeta): la memoria de la tarjeta es lo primero que hay que reducir.`
  if (r.verticesM >= 3) return `La escena llevaba ${r.verticesM.toFixed(1)} millones de vértices: el modelo y lo puesto en él pesan lo suyo para una tarjeta integrada.`
  if (r.memoriaJsMb !== null && r.memoriaJsMb >= 1500) return `La memoria de JavaScript estaba en ${r.memoriaJsMb} MB: la pestaña iba cerca de su techo y el navegador pudo reclamarla.`
  if (/intel|uhd|iris|integrated|swiftshader|llvmpipe/i.test(r.tarjeta)) return `La tarjeta es integrada o por software (${r.tarjeta}): comparte la memoria con el sistema y es la que más pierde el contexto con una escena pesada.`
  return 'Con estas cifras no hay una causa clara: la tarjeta o el controlador pudieron reiniciarse (en Windows, un dibujo que tarda demasiado lo reinicia).'
}

export function leerDiagnosticos(): RegistroDeUnaPerdida[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_DEL_DIAGNOSTICO)
    const datos = crudo ? JSON.parse(crudo) : []
    return Array.isArray(datos) ? (datos as RegistroDeUnaPerdida[]) : []
  } catch {
    return []
  }
}

/** Añade un registro a los anteriores, sin pasar de diez. */
export function guardarDiagnostico(registro: RegistroDeUnaPerdida) {
  try {
    const todos = [...leerDiagnosticos(), registro].slice(-MAXIMO_DE_REGISTROS)
    window.localStorage.setItem(CLAVE_DEL_DIAGNOSTICO, JSON.stringify(todos))
  } catch {
    // sin almacenamiento: queda la línea de la consola
  }
}
