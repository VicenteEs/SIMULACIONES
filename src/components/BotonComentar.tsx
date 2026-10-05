'use client'

import { MessageSquarePlus } from 'lucide-react'
import { EVENTO_COMENTAR } from './FormularioComentario'

/**
 * «Comentar» en la barra de acciones de la ficha.
 *
 * El formulario sigue al pie, que es donde se termina de leer; este botón lo
 * abre desde arriba para quien encuentra el error en el primer párrafo y no
 * quiere bajar a buscarlo. No duplica el formulario: le avisa con un evento
 * (`EVENTO_COMENTAR`) y es el propio formulario quien se abre, se trae a la
 * vista y pone el foco en el cuadro de texto.
 */
export function BotonComentar({ coleccion, documentoId }: { coleccion: string; documentoId: string }) {
  return (
    <button
      type="button"
      className="boton boton-fantasma boton-sm"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(EVENTO_COMENTAR, { detail: { coleccion, documentoId } }),
        )
      }
    >
      <MessageSquarePlus size={16} aria-hidden="true" />
      Comentar
    </button>
  )
}
