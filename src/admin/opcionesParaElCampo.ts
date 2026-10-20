/**
 * Lo que ofrece el desplegable de una relación a modelos 3D (P-004 E1).
 *
 * Va aparte de `Campos.tsx` porque es una cuenta con números y rótulos que se prueba sin pintar nada, y porque
 * `Campos.tsx` arrastra el editor entero (three, TipTap) a quien lo importe.
 */
import type { Campo } from './esquema'

export interface OpcionRelacion {
  id: string
  etiqueta: string
  url?: string
  tipo?: string
  /** La carpeta de un modelo 3D (P-004 E1): `herramienta` o `cuerpo`. */
  clase?: string
}

export type Relaciones = Record<string, OpcionRelacion[]>

const ROTULO_DE_LA_CLASE: Record<string, string> = { herramienta: 'Herramienta', cuerpo: 'Cuerpo' }

/**
 * Los modelos 3D están en dos carpetas y cada campo pide la suya: el del instrumento, `herramienta`; el del
 * caso, `cuerpo`. Un campo sin carpeta (el bloque de una ficha, el paso de un caso AO) enseña las dos, con el
 * rótulo delante y las herramientas primero, para no revolverlas. Lo que ya está elegido no desaparece aunque
 * sea de la otra carpeta (un caso viejo): se ve y se puede cambiar.
 */
export function opcionesParaElCampo(
  campo: Extract<Campo, { tipo: 'relacion' }>,
  relaciones: Relaciones,
  elegido: unknown,
): OpcionRelacion[] {
  const todas = relaciones[campo.coleccion] ?? []
  if (campo.coleccion !== 'modelos-3d') return todas
  const idsElegidos = new Set(
    (Array.isArray(elegido) ? elegido : [elegido])
      .map((v) => (v && typeof v === 'object' ? String((v as { id?: unknown }).id ?? '') : String(v ?? '')))
      .filter((id) => id !== '' && id !== 'null' && id !== 'undefined'),
  )
  if (campo.clase) {
    return todas.filter((o) => o.clase === undefined || o.clase === campo.clase || idsElegidos.has(o.id))
  }
  const peso = (clase: string | undefined) => (clase === 'herramienta' ? 0 : 1)
  return [...todas]
    .sort((a, b) => peso(a.clase) - peso(b.clase))
    .map((o) => (o.clase ? { ...o, etiqueta: `${ROTULO_DE_LA_CLASE[o.clase] ?? o.clase} · ${o.etiqueta}` } : o))
}
