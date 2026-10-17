'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { piezaDe } from '@/atlas/formato'
import { FichaEditable, type BorradorDeLaFicha } from '@/components/admin/estructuras/FichaEditable'

/**
 * Lo escrito en la pestaña «Info» y todavía sin guardar, que tiene que sobrevivir a
 * pinchar otra pieza.
 *
 * Pinchar otra pieza desmonta la ficha de la anterior; sin esto, lo que se estaba
 * escribiendo se perdía en silencio, y el dueño pidió explícitamente que en esta
 * parte no se pierda información. Los borradores viven en el taller (no en la
 * pestaña: la pestaña solo está montada cuando está a la vista) y se devuelven al
 * volver a esa pieza. Mientras haya alguno, cerrar la página pregunta.
 */
export function useBorradoresDeInfo() {
  const borradores = useRef(new Map<string, BorradorDeLaFicha>())
  const [pendientes, setPendientes] = useState(0)

  const guardarBorrador = useCallback((atlasId: string, borrador: BorradorDeLaFicha | null) => {
    if (borrador) borradores.current.set(atlasId, borrador)
    else borradores.current.delete(atlasId)
    setPendientes(borradores.current.size)
  }, [])

  useEffect(() => {
    if (pendientes === 0) return
    const preguntar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
    }
    window.addEventListener('beforeunload', preguntar)
    return () => window.removeEventListener('beforeunload', preguntar)
  }, [pendientes])

  return { borradores, pendientes, guardarBorrador }
}

/**
 * «Info»: la ficha de la pieza seleccionada, para escribirla desde el taller (D-179,
 * P-003 E8.6).
 *
 * Es la misma ficha del listado global —la que se llena en `/admin-panel/estructuras`
 * y por planilla—: lo que se escribe aquí aparece allí, y al revés. Cristóbal pidió que
 * la información se anote donde se está mirando la pieza, sin ir a otra pantalla.
 *
 * **Un trozo de hueso partido abre la ficha del hueso entero**: «Tibia derecha_1» y
 * «Tibia derecha_2» son la tibia derecha, y se anota una vez. Se resuelve por el
 * identificador (`piezaDe`) y no por el nombre.
 */
export function PestanaDeInfo({
  seleccion,
  catalogo,
  nombreDePieza,
  borradores,
  guardarBorrador,
}: {
  seleccion: ReadonlySet<string>
  catalogo: CatalogoDelAtlas | null
  /** El nombre de una pieza o trozo, el mismo que en el árbol. */
  nombreDePieza: (id: string) => string
  borradores: ReturnType<typeof useBorradoresDeInfo>['borradores']
  guardarBorrador: ReturnType<typeof useBorradoresDeInfo>['guardarBorrador']
}) {
  if (seleccion.size === 0) {
    return (
      <p className="campo-ayuda">
        <Info aria-hidden size={14} /> Seleccione una pieza para ver y escribir su ficha: nombre latino, definición, origen,
        inserción, inervación, acción e irrigación.
      </p>
    )
  }
  if (seleccion.size > 1) {
    return (
      <p className="campo-ayuda">
        <Info aria-hidden size={14} /> Hay {seleccion.size} piezas seleccionadas. Deje una sola para ver su ficha.
      </p>
    )
  }
  const [seleccionada] = seleccion
  const atlasId = piezaDe(seleccionada)
  const pieza = catalogo?.piezas.find((p) => p.id === atlasId)
  const nombreDelSistema = catalogo?.sistemas.find((s) => s.id === pieza?.sistema)?.nombre ?? pieza?.sistema ?? ''
  const nombreDeLaRegion = catalogo?.regiones.find((r) => r.id === pieza?.region)?.nombre ?? pieza?.region ?? ''
  const esTrozo = seleccionada !== atlasId

  return (
    <div className="atlas-ficha atlas-info">
      <h3 className="atlas-subtitulo">{nombreDePieza(atlasId)}</h3>
      {esTrozo ? (
        <p className="campo-ayuda">
          <Info aria-hidden size={14} /> «{nombreDePieza(seleccionada)}» es un trozo de {nombreDePieza(atlasId)}: la ficha es la de la
          pieza entera.
        </p>
      ) : null}
      {/* La clave es la pieza: al pinchar otra se monta una ficha nueva, y la anterior deja su borrador si tenía algo sin guardar. */}
      <FichaEditable
        key={atlasId}
        atlasId={atlasId}
        region={nombreDeLaRegion}
        sistema={nombreDelSistema}
        borrador={borradores.current.get(atlasId) ?? null}
        alCambiarBorrador={guardarBorrador}
      />
    </div>
  )
}
