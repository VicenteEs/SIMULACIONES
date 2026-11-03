import type { FiltroDeRevision } from '@/app/(frontend)/acciones/contenido'

/**
 * Las pestañas por estado del listado de un módulo (P-007 E5, D-238): Todas,
 * Publicadas, Validadas, Por revisar y Borradores, cada una con su cuenta.
 *
 * No son un filtro nuevo: cada pestaña es una combinación de los dos que el
 * listado ya tenía —«Estado» y «Revisión»—, y por eso los dos desplegables se
 * quedan debajo para afinar («Asignadas a mí», «Devueltas», «Fuera de
 * revisión»). Elegir en ellos algo que no es ninguna pestaña deja las cinco sin
 * marcar, que es lo cierto.
 *
 * Vive aparte, sin nada del servidor, porque la leen dos lados: la tabla, que
 * es de cliente, para saber qué pestaña está puesta, y la página, que cuenta
 * cada una con las mismas condiciones que usa `listarDocumentos`. Escrita dos
 * veces, una pestaña podía decir «4» y abrir un listado de cinco.
 */

export type EstadoDelListado = 'todos' | 'publicado' | 'borrador'

export interface VistaDelListado {
  id: string
  etiqueta: string
  estado: EstadoDelListado
  revision: FiltroDeRevision
}

export const VISTAS_DEL_LISTADO = [
  { id: 'todas', etiqueta: 'Todas', estado: 'todos', revision: 'todas' },
  { id: 'publicadas', etiqueta: 'Publicadas', estado: 'publicado', revision: 'todas' },
  { id: 'validadas', etiqueta: 'Validadas', estado: 'todos', revision: 'listas' },
  { id: 'por-revisar', etiqueta: 'Por revisar', estado: 'todos', revision: 'por-revisar' },
  { id: 'borradores', etiqueta: 'Borradores', estado: 'borrador', revision: 'todas' },
] as const satisfies readonly VistaDelListado[]

export type IdDeVista = (typeof VISTAS_DEL_LISTADO)[number]['id']

/** Cuántas fichas hay detrás de cada pestaña; `null` en la que no se pudo contar. */
export type CuentasDeLasVistas = Record<IdDeVista, number | null>

/**
 * Los estados de revisión que filtra cada pestaña, los mismos de
 * `ESTADOS_DEL_FILTRO` en `acciones/contenido.ts`. Una prueba
 * (`tests/unit/tableroDeContenido.test.ts`) compara las dos listas.
 */
export const ESTADOS_DE_REVISION_DE_LA_VISTA: Partial<Record<IdDeVista, string[]>> = {
  validadas: ['lista'],
  'por-revisar': ['pendiente', 'en-revision', 'devuelta'],
}

/** La pestaña que corresponde a lo elegido en los dos filtros, o `null` si no es ninguna. */
export function vistaDe(estado: EstadoDelListado, revision: FiltroDeRevision): IdDeVista | null {
  return VISTAS_DEL_LISTADO.find((v) => v.estado === estado && v.revision === revision)?.id ?? null
}
