'use client'

import { useEffect, useMemo, useState } from 'react'
import { idDeFragmento, type CatalogoDelAtlas, type ContenidoDeInstancia } from '@/atlas/formato'
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

  // Se vuelve a normalizar contra el catálogo vigente: si el atlas se regeneró
  // y alguna pieza ya no existe, se muestra el resto en vez de fallar entera.
  //
  // Memorizado porque no es gratis: recorre las 2.234 piezas del atlas y
  // construye un conjunto nuevo. Sin esto se rehacía en cada pintado y, peor,
  // el conjunto recién creado volvía a disparar el efecto de visibilidad del
  // visor, que reescribe la textura de estado entera.
  const preparado = useMemo(() => {
    if (!catalogo) return null
    const limpio = normalizarSeleccion(catalogo, contenido.piezas, contenido.vista, contenido.cortes)
    // Las piezas que su autor sacó de su sitio (D-129): una luxación, un
    // fragmento desplazado. Memorizado con lo demás y por lo mismo: un mapa
    // nuevo en cada pintado volvería a escribir las texturas cada vez.
    const movidas = new Map(
      limpio.piezas
        .filter((p) => p.mover || p.girar)
        .map((p) => [p.id, { mover: p.mover ?? [0, 0, 0], girar: p.girar ?? [0, 0, 0, 1] }] as const),
    )
    // Y lo de cada fragmento de un hueso partido (D-130), bajo su identificador.
    for (const corte of limpio.cortes ?? []) {
      for (const lado of ['a', 'b'] as const) {
        const t = corte[lado]
        if (!t) continue
        movidas.set(idDeFragmento(corte.pieza, lado), {
          mover: t.mover ?? [0, 0, 0],
          girar: t.girar ?? [0, 0, 0, 1],
        })
      }
    }
    return { limpio, visibles: new Set(limpio.piezas.map((p) => p.id)), movidas }
  }, [catalogo, contenido])

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

  if (!catalogo || !preparado) {
    return (
      <figure className="figura completo">
        <div className="visor-3d-marco">
          <span className="visor-3d-nota">Cargando anatomía…</span>
        </div>
      </figure>
    )
  }

  return (
    <figure className="figura completo">
      <div className="atlas-instancia">
        <VisorAtlas
          catalogo={catalogo}
          visibles={preparado.visibles}
          resaltada={null}
          separacion={preparado.limpio.vista.separacion}
          vistaInicial={preparado.limpio.vista}
          transformaciones={preparado.movidas}
          cortes={preparado.limpio.cortes ?? null}
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
