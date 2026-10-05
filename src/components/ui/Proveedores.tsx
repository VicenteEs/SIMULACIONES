'use client'

import type { ReactNode } from 'react'
import { ProveedorDeConfirmacion } from './Confirmar'
import { ProveedorDeAvisos } from './Avisos'

/** Los dos proveedores de interfaz, montados una vez en el layout raíz. */
export function ProveedoresDeUI({ children }: { children: ReactNode }) {
  return (
    <ProveedorDeAvisos>
      <ProveedorDeConfirmacion>{children}</ProveedorDeConfirmacion>
    </ProveedorDeAvisos>
  )
}
