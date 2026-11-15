'use client'

import { useState } from 'react'
import { BookmarkCheck } from 'lucide-react'
import { grabarResolucionDeReferencia, type ReferenciaGrabada } from '@/app/(frontend)/acciones/resolucionDeReferencia'
import type { RecorridoDelCaso } from '@/lib/notaDelRecorrido'

/**
 * «Guardar como resolución de referencia», al terminar el caso (D-373).
 *
 * Aparte de `ConsolaQuirurgica` porque a la consola solo le toca decir cuándo
 * se ofrece: este botón tiene su propio estado (grabando, grabada, falló) y no
 * cambia nada de lo que la consola pinta.
 *
 * El recorrido se pide al pulsar y no se recibe ya hecho: la consola lo arma
 * con lo que llevan sus referencias en ese momento, y una copia tomada al pintar
 * el panel podría ser la de antes de la radiografía o la del último paso.
 *
 * La advertencia de la nota no impide grabar. Una referencia con menos de la
 * nota máxima sigue sirviendo —el ensayo comprueba que la nota no cambie—, pero
 * no demuestra que el caso se pueda resolver entero, y eso tiene que quedar
 * dicho antes de pulsar, no después.
 */
export function GrabarReferencia({
  documentoId,
  recorrido,
  notaCompleta,
}: {
  documentoId: string
  recorrido: () => RecorridoDelCaso
  notaCompleta: boolean
}) {
  const [estado, setEstado] = useState<
    { fase: 'lista' } | { fase: 'grabando' } | { fase: 'grabada'; datos: ReferenciaGrabada } | { fase: 'fallo'; mensaje: string }
  >({ fase: 'lista' })

  const grabar = async () => {
    setEstado({ fase: 'grabando' })
    try {
      const respuesta = await grabarResolucionDeReferencia(documentoId, recorrido())
      if (respuesta.exito && respuesta.datos) setEstado({ fase: 'grabada', datos: respuesta.datos })
      else setEstado({ fase: 'fallo', mensaje: respuesta.mensaje ?? 'No se pudo guardar la referencia.' })
    } catch {
      setEstado({ fase: 'fallo', mensaje: 'No se pudo guardar la referencia. Vuelva a intentarlo.' })
    }
  }

  return (
    <div className="consola-referencia">
      {estado.fase === 'grabada' ? (
        <p className="consola-fin-leido">
          <BookmarkCheck size={16} aria-hidden /> Guardado como resolución de referencia, con {estado.datos.puntaje} de{' '}
          {estado.datos.puntajeMaximo} puntos
          {estado.datos.reemplazo ? ' (reemplaza a la anterior)' : ''}. El ensayo de los casos la vuelve a calificar antes
          de cada despliegue.
        </p>
      ) : (
        <>
          {!notaCompleta ? (
            <p className="consola-ayuda">
              Este recorrido no tiene la nota máxima. Como referencia, el ensayo comprobará que siga dando la misma nota,
              no que el caso se pueda resolver entero.
            </p>
          ) : null}
          <button
            type="button"
            className="consola-boton"
            disabled={estado.fase === 'grabando'}
            onClick={() => void grabar()}
          >
            <BookmarkCheck size={16} aria-hidden />{' '}
            {estado.fase === 'grabando' ? 'Guardando la referencia…' : 'Guardar como resolución de referencia'}
          </button>
          {estado.fase === 'fallo' ? (
            <p className="consola-fin-fallo" role="alert">
              {estado.mensaje}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
