'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useConfirmar } from '@/components/ui/Confirmar'
import type { FichaCompleta } from '@/lib/estructuras'
import { FichaEditable } from '@/components/admin/estructuras/FichaEditable'

/**
 * La ventana donde se escribe la ficha de una pieza (D-179, P-003 E8.4): una caja
 * de diálogo alrededor de `FichaEditable`, que es lo mismo que enseña la pestaña
 * «Info» del taller. Aquí solo vive lo que es de la ventana: el título, cerrar con
 * Escape o pulsando fuera, y **preguntar antes de cerrar si hay algo sin guardar**.
 */
export function VentanaDeEstructura({
  atlasId,
  region,
  sistema,
  alCerrar,
  alGuardar,
}: {
  atlasId: string
  /** La región y el sistema ya con su nombre en español: los resuelve la pantalla, que tiene el catálogo. */
  region: string
  sistema: string
  alCerrar: () => void
  /** Se llama tras un guardado o una restauración, para que la lista y el contador se pongan al día. */
  alGuardar: () => void
}) {
  const confirmar = useConfirmar()
  const [nombre, setNombre] = useState<string | null>(null)
  const sucia = useRef(false)

  const cerrar = async () => {
    if (sucia.current) {
      const si = await confirmar({
        titulo: '¿Cerrar sin guardar?',
        mensaje: 'Lo que escribió en esta ficha se perdería.',
        confirmar: 'Cerrar sin guardar',
      })
      if (!si) return
    }
    alCerrar()
  }

  return (
    <Modal titulo={nombre ?? 'Abriendo la ficha…'} ancho="ancho" onCerrar={cerrar}>
      <FichaEditable
        atlasId={atlasId}
        region={region}
        sistema={sistema}
        alCargar={(ficha: FichaCompleta) => setNombre(ficha.nombre)}
        alCambiarSucia={(valor) => {
          sucia.current = valor
        }}
        alGuardar={alGuardar}
        alTerminar={alCerrar}
        alCancelar={cerrar}
      />
    </Modal>
  )
}
