import { PESTANAS_FICHA, pestanasConContenido, type FichaParcial } from '@/lib/fichas'

/**
 * Dónde se quedó el residente dentro de una ficha, dicho con palabras: lo que
 * pinta «Continúa leyendo» bajo el título (P-007 E4, D-237).
 *
 * La fila de `actividad` guarda solo un número (`seccion`); el nombre se saca
 * aquí del documento de hoy, para que la tarjeta diga el título vigente del
 * paso aunque el autor lo haya reescrito después.
 *
 * En la patología, el número es el lugar de la pestaña entre las seis fijas
 * (`PESTANAS_FICHA`) y no entre las que se ven. Contado entre las visibles,
 * el día que el autor llenara una pestaña vacía de las de antes, todas las
 * filas guardadas pasarían a señalar la pestaña de al lado. Lo que se enseña,
 * en cambio, sí es el lugar entre las visibles: «2 de 4» es lo que el
 * residente ve en la ficha.
 */
export interface DondeSeQuedo {
  rotulo: 'Pestaña' | 'Paso'
  /** Su lugar entre lo que se ve, desde uno. */
  numero: number
  total: number
  nombre: string
  /** Lo que se añade al enlace para abrir la ficha ahí mismo. */
  ancla: string
}

/** Cuántos pasos tiene el documento, y el título del que va en `numero`. */
function pasoDe(documento: Record<string, unknown>, numero: number): { total: number; nombre: string } | null {
  const pasos = documento.pasos
  if (!Array.isArray(pasos) || numero > pasos.length) return null
  const titulo = (pasos[numero - 1] as { titulo?: unknown } | null)?.titulo
  if (typeof titulo !== 'string' || titulo.trim() === '') return null
  return { total: pasos.length, nombre: titulo.trim() }
}

/**
 * Lo que dice la tarjeta, o `null` si no hay nada que decir: un módulo sin
 * partes, una fila sin número, o un número que ya no existe porque el autor
 * quitó pasos o vació la pestaña. Decir «paso 9 de 7» sería peor que callar.
 */
export function dondeSeQuedo(coleccion: string, documento: Record<string, unknown>, seccion: unknown): DondeSeQuedo | null {
  if (typeof seccion !== 'number' || !Number.isInteger(seccion) || seccion < 1) return null

  if (coleccion === 'patologias') {
    const pestana = PESTANAS_FICHA[seccion - 1]
    if (!pestana) return null
    const visibles = pestanasConContenido(documento as FichaParcial)
    const lugar = visibles.findIndex((p) => p.campo === pestana.campo)
    if (lugar === -1) return null
    return { rotulo: 'Pestaña', numero: lugar + 1, total: visibles.length, nombre: pestana.etiqueta, ancla: `#${pestana.campo}` }
  }

  if (coleccion === 'casos-ao') {
    const paso = pasoDe(documento, seccion)
    if (!paso) return null
    return { rotulo: 'Paso', numero: seccion, total: paso.total, nombre: paso.nombre, ancla: `#paso-${seccion}` }
  }

  // El simulador no: su consola empieza cada caso en el primer paso, así que
  // decir en cuál iba sería prometer que lo retoma ahí (`anotarSeccion`).
  return null
}

/** Qué columnas pide la portada de cada módulo para poder decirlo. */
export const COLUMNAS_PARA_SABERLO: Record<string, Record<string, true>> = {
  patologias: Object.fromEntries([['nombre', true], ['fases', true], ...PESTANAS_FICHA.map((p) => [p.campo, true])]),
  'casos-ao': { titulo: true, pasos: true },
}
