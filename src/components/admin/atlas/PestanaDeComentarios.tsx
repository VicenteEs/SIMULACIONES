'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { CircleDot, Check, MapPin, RotateCcw, Trash2 } from 'lucide-react'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { actualizarComentario, eliminarComentario } from '@/app/(frontend)/acciones/admin'
import {
  crearComentario,
  listarComentariosDe,
  type ComentarioDelTaller,
} from '@/app/(frontend)/acciones/comentarios'
import { SLUG_DEL_TALLER } from '@/app/(frontend)/admin-panel/modulos'

/**
 * El techo de un comentario, repetido y no importado: `LARGO_MAXIMO_COMENTARIO`
 * vive en `src/lib/validacion.ts`, que arrastra `@/collections` —la
 * configuración entera de Payload— al paquete del navegador. Lo mismo hace
 * `FormularioComentario`; el servidor es quien manda y rechaza lo que pase.
 */
const LARGO_MAXIMO = 4000

/**
 * Los comentarios de una preparación, dentro del taller (E2, D-158).
 *
 * Comentar una preparación o una pieza concreta sin salir del taller: antes, lo
 * que el editor veía en el visor había que contarlo en la bandeja del panel
 * con palabras, sin poder señalar la pieza. El comentario anclado guarda la
 * pieza y, si se quiere, la vista de la cámara del momento; pulsarlo devuelve a
 * quien lo lee exactamente a esa pieza y a ese encuadre.
 *
 * Los mismos comentarios salen en la bandeja «Comentarios» del panel, con un
 * enlace que abre esta preparación con el comentario señalado.
 *
 * Se parte en un gancho y un panel porque la pestaña muestra un contador
 * (`Comentarios (3)`) aunque no sea la que está abierta: el contador y la lista
 * salen de la misma lectura, que hace el taller una vez.
 */

export type AnclaDelTaller = NonNullable<ComentarioDelTaller['ancla']>

export interface EstadoDeLosComentarios {
  lista: ComentarioDelTaller[] | null
  fallo: string | null
  pendientes: number
  recargar: () => void
}

/**
 * Lee los comentarios de la preparación abierta, y los vuelve a leer al cambiar
 * de preparación. Sin preparación guardada (`null`: «Cuerpo», o una copia que
 * aún no existe) no hay nada que leer.
 */
export function useComentariosDelTaller(preparacion: string | null): EstadoDeLosComentarios {
  const [lista, setLista] = useState<ComentarioDelTaller[] | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    if (!preparacion) {
      // Es el reflejo de «no hay preparación», no un estado derivado: la lista
      // de otra preparación no debe asomar mientras se abre la siguiente.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLista(null)
      setFallo(null)
      return
    }
    void listarComentariosDe(SLUG_DEL_TALLER, preparacion).then((r) => {
      if (!vigente) return
      if (r.exito && r.datos) {
        setLista(r.datos)
        setFallo(null)
      } else {
        setFallo(r.mensaje ?? 'No se pudieron leer los comentarios.')
      }
    })
    return () => {
      vigente = false
    }
  }, [preparacion, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return {
    lista,
    fallo,
    pendientes: lista?.filter((c) => c.estado === 'pendiente').length ?? 0,
    recargar,
  }
}

/**
 * El ancla de un comentario que se deja ahora: la pieza y la vista de la cámara.
 *
 * El `punto` es el objetivo de la cámara —lo que se está mirando—, no un punto
 * de la superficie de la pieza: seleccionar una pieza no es pinchar sobre ella, y
 * no hay un punto sobre el hueso al que apuntar. Sirve para colocar el marcador
 * cerca de lo comentado, y es lo que hace falta; la pieza exacta la dice
 * `pieza`.
 */
function anclaDeAhora(
  pieza: string,
  vista: { camara: [number, number, number]; objetivo: [number, number, number] } | null,
) {
  return vista ? { pieza, punto: vista.objetivo, vista } : { pieza }
}

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export function PestanaDeComentarios({
  preparacion,
  estado,
  piezaSeleccionada,
  nombreDePieza,
  capturarVista,
  alIrAlAncla,
  puedeEliminar,
  comentarioInicial,
  marcadores,
  alCambiarMarcadores,
}: {
  preparacion: string | null
  estado: EstadoDeLosComentarios
  /** La única pieza seleccionada, o `null` si no hay una sola. */
  piezaSeleccionada: string | null
  nombreDePieza: (id: string) => string
  /** La cámara de ahora, para guardarla con el comentario. */
  capturarVista: () => { camara: [number, number, number]; objetivo: [number, number, number] } | null
  /** Selecciona la pieza y lleva la cámara a la vista del comentario. */
  alIrAlAncla: (ancla: AnclaDelTaller) => void
  puedeEliminar: boolean
  /** El comentario al que lleva el enlace de la bandeja, para señalarlo. */
  comentarioInicial?: string
  /** Si los comentarios anclados se marcan sobre el modelo (E2.4). */
  marcadores: boolean
  alCambiarMarcadores: (encendidos: boolean) => void
}) {
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const [texto, setTexto] = useState('')
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { lista, fallo, recargar } = estado

  // El comentario al que apuntaba el enlace: se lleva la vista a su pieza una
  // sola vez, cuando ya se ha leído la lista.
  const yaSeñalado = useRef<string | null>(null)
  useEffect(() => {
    if (!comentarioInicial || !lista || yaSeñalado.current === comentarioInicial) return
    yaSeñalado.current = comentarioInicial
    const buscado = lista.find((c) => c.id === comentarioInicial)
    if (buscado?.ancla) alIrAlAncla(buscado.ancla)
    document.getElementById(`comentario-del-taller-${comentarioInicial}`)?.scrollIntoView({ block: 'center' })
  }, [comentarioInicial, lista, alIrAlAncla])

  if (!preparacion) {
    return (
      <p className="campo-ayuda">
        Guarde la preparación con nombre para poder comentarla. «Cuerpo» no se comenta: es la base de
        la que sale toda preparación y no tiene dónde guardar comentarios.
      </p>
    )
  }

  const enviar = (anclada: boolean) => {
    const limpio = texto.trim()
    if (!limpio) return
    setError(null)
    const ancla =
      anclada && piezaSeleccionada
        ? anclaDeAhora(piezaSeleccionada, capturarVista())
        : undefined
    iniciar(async () => {
      try {
        await crearComentario(SLUG_DEL_TALLER, preparacion, limpio, ancla)
        setTexto('')
        recargar()
        avisar('ok', anclada ? 'Comentario dejado sobre la pieza.' : 'Comentario dejado.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo dejar el comentario.')
      }
    })
  }

  const cambiarEstado = (c: ComentarioDelTaller) =>
    iniciar(async () => {
      const r = await actualizarComentario(c.id, c.estado === 'pendiente' ? 'resuelto' : 'pendiente')
      if (r.exito) recargar()
      else avisar('error', r.mensaje ?? 'No se pudo cambiar el comentario.')
    })

  const eliminar = async (c: ComentarioDelTaller) => {
    const si = await confirmar({
      titulo: '¿Eliminar este comentario?',
      mensaje: 'Se borra la observación de quien la escribió y no se puede deshacer.',
      confirmar: 'Eliminar comentario',
      peligro: true,
    })
    if (!si) return
    iniciar(async () => {
      const r = await eliminarComentario(c.id)
      if (r.exito) recargar()
      else avisar('error', r.mensaje ?? 'No se pudo eliminar el comentario.')
    })
  }

  return (
    <div className="atlas-comentarios">
      <label className="campo-etiqueta" htmlFor="atlas-comentario-texto">
        Comentar esta preparación
      </label>
      <textarea
        id="atlas-comentario-texto"
        className="campo-control"
        rows={3}
        maxLength={LARGO_MAXIMO}
        value={texto}
        placeholder="Qué corregir, qué falta, qué se ve mal…"
        onChange={(e) => setTexto(e.target.value)}
      />
      {error ? (
        <div className="admin-aviso admin-aviso-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="atlas-comentarios-acciones">
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={enCurso || !texto.trim()}
          onClick={() => enviar(false)}
        >
          Comentar
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          disabled={enCurso || !texto.trim() || !piezaSeleccionada}
          title={
            piezaSeleccionada
              ? 'El comentario queda anclado a la pieza seleccionada y a la vista de ahora'
              : 'Seleccione una sola pieza para anclarle el comentario'
          }
          onClick={() => enviar(true)}
        >
          <MapPin aria-hidden size={14} />
          {piezaSeleccionada ? `Comentar ${nombreDePieza(piezaSeleccionada)}` : 'Comentar una pieza'}
        </button>
      </div>

      <label className="atlas-comentarios-marcadores">
        <input type="checkbox" checked={marcadores} onChange={(e) => alCambiarMarcadores(e.target.checked)} />
        Marcar los pendientes sobre el modelo
      </label>

      {fallo ? (
        <div className="admin-aviso admin-aviso-error" role="status">
          {fallo}{' '}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={recargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      {lista === null && !fallo ? <p className="campo-ayuda">Leyendo los comentarios…</p> : null}
      {lista?.length === 0 ? <p className="atlas-vacio">Nadie ha comentado esta preparación.</p> : null}

      {lista && lista.length > 0 ? (
        <ul className="atlas-comentarios-lista">
          {lista.map((c) => (
            <li
              key={c.id}
              id={`comentario-del-taller-${c.id}`}
              className={`atlas-comentario${c.estado === 'resuelto' ? ' atlas-comentario-resuelto' : ''}${
                c.id === comentarioInicial ? ' atlas-comentario-senalado' : ''
              }`}
            >
              <div className="atlas-comentario-cabeza">
                <strong>{c.autor ?? 'Cuenta eliminada'}</strong>
                <span>{fechaHora(c.creado)}</span>
                <span className={`insignia ${c.estado === 'pendiente' ? 'insignia-atencion' : 'insignia-ok'}`}>
                  {c.estado === 'pendiente' ? (
                    <>
                      <CircleDot aria-hidden size={12} /> Pendiente
                    </>
                  ) : (
                    <>
                      <Check aria-hidden size={12} /> Resuelto
                    </>
                  )}
                </span>
              </div>
              {c.ancla ? (
                <button
                  type="button"
                  className="atlas-comentario-ancla"
                  title="Selecciona la pieza y lleva la cámara a la vista del comentario"
                  onClick={() => alIrAlAncla(c.ancla!)}
                >
                  <MapPin aria-hidden size={13} />
                  {nombreDePieza(c.ancla.pieza)}
                </button>
              ) : null}
              <p className="atlas-comentario-texto">{c.texto}</p>
              <div className="atlas-comentario-pie">
                <button type="button" className="admin-btn admin-btn-ghost" disabled={enCurso} onClick={() => cambiarEstado(c)}>
                  {c.estado === 'pendiente' ? (
                    <>
                      <Check aria-hidden size={14} /> Resolver
                    </>
                  ) : (
                    <>
                      <RotateCcw aria-hidden size={14} /> Reabrir
                    </>
                  )}
                </button>
                {puedeEliminar ? (
                  <button type="button" className="admin-btn admin-btn-ghost" disabled={enCurso} onClick={() => eliminar(c)}>
                    <Trash2 aria-hidden size={14} /> Eliminar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
