'use client'

import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'

/**
 * «Plegar todo / Desplegar todo», encima de una pantalla con varias secciones
 * plegables (Auditoría, Actividad, Registro, Estadísticas…).
 *
 * No guarda estado propio: abre o cierra cada `<details class="plegable">`
 * de la pantalla, y eso dispara su `toggle`, que es quien recuerda la
 * posición en `localStorage` (`SeccionPlegable`). Así un plegado general se
 * recuerda sección a sección, igual que uno a mano, y no hay dos memorias que
 * puedan contradecirse.
 */
export function PlegarTodo() {
  const poner = (abiertas: boolean) => {
    document.querySelectorAll<HTMLDetailsElement>('.admin-content details.plegable').forEach((d) => {
      d.open = abiertas
    })
  }
  return (
    <div className="plegables-barra">
      <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => poner(false)}>
        <ChevronsDownUp aria-hidden size={16} />
        Plegar todo
      </button>
      <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => poner(true)}>
        <ChevronsUpDown aria-hidden size={16} />
        Desplegar todo
      </button>
    </div>
  )
}
