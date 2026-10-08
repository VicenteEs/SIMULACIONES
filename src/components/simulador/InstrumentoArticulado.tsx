'use client'

import dynamic from 'next/dynamic'
import type { AjustesDeInstrumento } from '@/instrumental/modelo'

// El visor trae three entero; la consola no lo necesita hasta que el residente
// coge un instrumento con modelo, así que se pide en ese momento y no al abrir.
const VisorDeInstrumento = dynamic(
  () => import('@/components/atlas/VisorDeInstrumento').then((m) => m.VisorDeInstrumento),
  { ssr: false, loading: () => <p className="consola-instrumento-texto">Cargando instrumento…</p> },
)

const SIN_FUNCION = () => {}

/**
 * El instrumento que el residente tiene en la mano, en su recuadro de la
 * bandeja (D-165).
 *
 * Aplica lo que el administrador dejó guardado en el taller (`ajustes`: partes
 * ocultas, color, partes corridas) y se articula con los valores que le manda la
 * consola. Los deslizadores no están aquí sino en la consola, porque mueven dos
 * cosas a la vez —este recuadro y el instrumento de la escena— y tienen que
 * leer lo mismo (D-166).
 *
 * Es de solo mirar: sin asas ni selección, el residente no retoca nada.
 */
export function InstrumentoArticulado({
  url,
  ajustes,
  nombre,
  articulaciones,
}: {
  url: string
  ajustes: AjustesDeInstrumento | null
  nombre: string
  /** El valor de cada articulación, en su unidad. */
  articulaciones: Record<string, number>
}) {
  return (
    <div className="consola-instrumento-visor" role="img" aria-label={`Modelo 3D: ${nombre}`}>
      <VisorDeInstrumento
        url={url}
        ajustes={ajustes}
        articulaciones={articulaciones}
        seleccion={null}
        herramienta="girar"
        puedeRetocar={false}
        rayosX={false}
        ortografica={false}
        alSeleccionar={SIN_FUNCION}
        alCargar={SIN_FUNCION}
        alMoverParte={SIN_FUNCION}
      />
    </div>
  )
}
