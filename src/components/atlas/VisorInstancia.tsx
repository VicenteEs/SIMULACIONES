'use client'

import { useEffect, useState } from 'react'
import type { CatalogoDelAtlas, ContenidoDeInstancia } from '@/atlas/formato'
import { cargarCatalogo } from '@/atlas/cargador'
import { normalizarSeleccion } from '@/atlas/catalogo'
import { VisorAtlas } from './VisorAtlas'

/**
 * Una preparación anatómica dentro de una ficha, para el residente.
 *
 * Es el mismo visor del taller en modo de solo lectura: se puede girar y
 * acercar, pero pulsar una pieza no la apaga. Quien lee una ficha no debe poder
 * deshacer, ni por accidente, el trabajo de quien la preparó.
 *
 * Descarga solo los paquetes del atlas que contienen estas piezas. Como el
 * atlas se sirve con caché permanente, la segunda ficha con anatomía ya no
 * descarga nada.
 */
export function VisorInstancia({
  contenido,
  pie,
}: {
  contenido: ContenidoDeInstancia
  pie?: string
}) {
  const [catalogo, setCatalogo] = useState<CatalogoDelAtlas | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    const aborto = new AbortController()
    cargarCatalogo(aborto.signal)
      .then(setCatalogo)
      .catch(() => {
        if (!aborto.signal.aborted) setFallo(true)
      })
    return () => aborto.abort()
  }, [])

  if (fallo) {
    return (
      <figure className="figura completo">
        <div className="visor-3d-marco">
          <span className="visor-3d-nombre">Anatomía no disponible</span>
          <span className="visor-3d-nota">El atlas no está instalado en este servidor.</span>
        </div>
      </figure>
    )
  }

  if (!catalogo) {
    return (
      <figure className="figura completo">
        <div className="visor-3d-marco">
          <span className="visor-3d-nota">Cargando anatomía…</span>
        </div>
      </figure>
    )
  }

  // Se vuelve a normalizar contra el catálogo vigente: si el atlas se regeneró
  // y alguna pieza ya no existe, se muestra el resto en vez de fallar entera.
  const limpio = normalizarSeleccion(catalogo, contenido.piezas, contenido.vista)
  const visibles = new Set(limpio.piezas.map((p) => p.id))

  return (
    <figure className="figura completo">
      <div className="atlas-instancia">
        <VisorAtlas
          catalogo={catalogo}
          visibles={visibles}
          resaltada={null}
          separacion={limpio.vista.separacion}
          vistaInicial={limpio.vista}
          soloLectura
        />
      </div>
      {pie ? <figcaption>{pie}</figcaption> : null}
      <figcaption className="atlas-credito">
        Anatomía: BodyParts3D, © The Database Center for Life Science, CC BY 4.0
      </figcaption>
    </figure>
  )
}
