'use client'

import { createContext } from 'react'

/**
 * La ficha que tiene abierto el formulario: de qué colección es y, si ya se guardó, qué número tiene.
 *
 * Lo necesita el desplegable que agrega una fila a un catálogo («¿No está? Agregar») para decir en el aviso
 * desde qué ficha se agregó (P-003, E1). Va por contexto y no por propiedad porque el desplegable está al fondo de
 * cinco niveles de componentes —sección, fila de campos, lista, grupo, campo— y ninguno de ellos tiene otra razón
 * para conocer la ficha. Sin proveedor (el editor del simulador, una prueba) el aviso se queda en el campo.
 */
export interface FichaAbierta {
  coleccion: string
  /** `null` mientras la ficha es nueva y no se ha guardado: no hay número al que apuntar. */
  documentoId: string | null
}

export const ContextoDeFicha = createContext<FichaAbierta | null>(null)
