'use client'

import { useEffect, useState, useTransition } from 'react'
import { ThumbsUp } from 'lucide-react'
import {
  editarRequisito,
  eliminarRequisito,
  listarRequisitos,
  proponerRequisito,
  responderRequisito,
  votarRequisito,
  type RequisitoDelBuzon,
} from '@/app/(frontend)/acciones/requisitos'
import { useConfirmar } from '@/components/ui/Confirmar'
import {
  ESTADOS_DE_REQUISITO,
  LARGO_MAXIMO_DE_LA_DESCRIPCION,
  LARGO_MAXIMO_DE_LA_RESPUESTA,
  LARGO_MAXIMO_DEL_TITULO,
  estadoDeRequisitoEnPalabras,
  type EstadoDeRequisito,
} from '@/lib/requisitos'

/**
 * El buzón de requisitos del módulo 06 (D-163, E7).
 *
 * Es de editores y administradores: la página ni lo monta para un residente, y las
 * acciones lo rechazan igual. Aquí se propone, se vota, se reescribe lo propio
 * mientras esté «propuesto» y, si es administrador, se responde y se cambia el
 * estado.
 */

const FECHA = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })
const fechaDe = (iso: string) => (iso ? FECHA.format(new Date(iso)) : '')

export function BuzonDeRequisitos({ esAdmin }: { esAdmin: boolean }) {
  const [lista, setLista] = useState<RequisitoDelBuzon[] | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enCurso, iniciar] = useTransition()
  /** Un contador para volver a pedir la lista tras cada cambio. */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    listarRequisitos()
      .then((r) => {
        if (!vivo) return
        if (r.exito && r.datos) {
          setLista(r.datos)
          setFallo(null)
        } else setFallo(r.mensaje ?? 'No se pudo leer el buzón.')
      })
      .catch(() => {
        if (vivo) setFallo('No se pudo leer el buzón. Revise la conexión e inténtelo de nuevo.')
      })
    return () => {
      vivo = false
    }
  }, [version])

  const refrescar = () => setVersion((v) => v + 1)

  /** Una acción del buzón: avisa del fallo con sus palabras, y recarga si salió bien. */
  const ejecutar = (tarea: () => Promise<{ exito: boolean; mensaje?: string }>, hecho?: () => void) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (!r.exito) {
          setAviso(r.mensaje ?? 'No se pudo hacer.')
          return
        }
        hecho?.()
        refrescar()
      } catch {
        setAviso('No se pudo completar. Revise la conexión e inténtelo de nuevo.')
      }
    })
  }

  return (
    <section className="buzon" aria-labelledby="buzon-titulo">
      <h2 id="buzon-titulo">Buzón de requisitos</h2>
      <p className="entrada">
        Lo que querría que hiciera este módulo, y cómo. Los demás editores lo votan y el administrador lo acepta o lo
        descarta, con una respuesta. Cuando se decida construirlo, esto es lo primero que se lee.
      </p>

      <form
        className="buzon-formulario tarjeta"
        onSubmit={(e) => {
          e.preventDefault()
          ejecutar(
            () => proponerRequisito(titulo, descripcion),
            () => {
              setTitulo('')
              setDescripcion('')
            },
          )
        }}
      >
        <label className="campo-etiqueta" htmlFor="buzon-nuevo-titulo">
          Título
        </label>
        <input
          id="buzon-nuevo-titulo"
          className="campo-control"
          value={titulo}
          maxLength={LARGO_MAXIMO_DEL_TITULO}
          placeholder="Medir el desplazamiento entre fragmentos sobre la tomografía"
          onChange={(e) => setTitulo(e.target.value)}
        />
        <label className="campo-etiqueta" htmlFor="buzon-nueva-descripcion">
          Cómo le gustaría que fuera
        </label>
        <textarea
          id="buzon-nueva-descripcion"
          className="campo-control"
          rows={4}
          value={descripcion}
          maxLength={LARGO_MAXIMO_DE_LA_DESCRIPCION}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <div className="fila-botones">
          <button type="submit" className="boton" disabled={enCurso || !titulo.trim() || !descripcion.trim()}>
            Proponer
          </button>
        </div>
      </form>

      {aviso ? (
        <p className="aviso aviso-error" role="alert">
          {aviso}
        </p>
      ) : null}
      {fallo ? (
        <p className="aviso aviso-error" role="alert">
          {fallo}
        </p>
      ) : null}

      {lista === null && !fallo ? <p className="campo-ayuda">Leyendo el buzón…</p> : null}
      {lista !== null && lista.length === 0 ? (
        <p className="campo-ayuda">Todavía no hay requisitos. Sea el primero.</p>
      ) : null}

      <ul className="buzon-lista">
        {(lista ?? []).map((r) => (
          <Requisito key={r.id} r={r} esAdmin={esAdmin} ocupado={enCurso} ejecutar={ejecutar} />
        ))}
      </ul>
    </section>
  )
}

function Requisito({
  r,
  esAdmin,
  ocupado,
  ejecutar,
}: {
  r: RequisitoDelBuzon
  esAdmin: boolean
  ocupado: boolean
  ejecutar: (tarea: () => Promise<{ exito: boolean; mensaje?: string }>, hecho?: () => void) => void
}) {
  const confirmar = useConfirmar()
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(r.titulo)
  const [descripcion, setDescripcion] = useState(r.descripcion)
  const [estado, setEstado] = useState<EstadoDeRequisito>(r.estado)
  const [respuesta, setRespuesta] = useState(r.respuesta)
  const puedeReescribirlo = r.estado === 'propuesto' && (r.esMio || esAdmin)
  const cerrado = r.estado === 'hecho' || r.estado === 'descartado'

  return (
    <li id={`requisito-${r.id}`} className="buzon-requisito tarjeta">
      <div className="buzon-cabecera">
        <h3>{r.titulo}</h3>
        <span className={`buzon-estado buzon-estado-${r.estado}`}>{estadoDeRequisitoEnPalabras(r.estado)}</span>
      </div>
      <p className="buzon-autor">
        {r.autor ? r.autor.nombre : 'Cuenta dada de baja'} · {fechaDe(r.creado)}
      </p>

      {editando ? (
        <div className="buzon-edicion">
          <input
            className="campo-control"
            aria-label="Título del requisito"
            value={titulo}
            maxLength={LARGO_MAXIMO_DEL_TITULO}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <textarea
            className="campo-control"
            aria-label="Descripción del requisito"
            rows={4}
            value={descripcion}
            maxLength={LARGO_MAXIMO_DE_LA_DESCRIPCION}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <div className="fila-botones">
            <button
              type="button"
              className="boton"
              disabled={ocupado || !titulo.trim() || !descripcion.trim()}
              onClick={() => ejecutar(() => editarRequisito(r.id, titulo, descripcion), () => setEditando(false))}
            >
              Guardar
            </button>
            <button type="button" className="boton boton-secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="buzon-descripcion">{r.descripcion}</p>
      )}

      {r.respuesta ? (
        <blockquote className="buzon-respuesta">
          <strong>Respuesta del administrador.</strong> {r.respuesta}
        </blockquote>
      ) : null}

      <div className="fila-botones">
        <button
          type="button"
          className="boton boton-secundario"
          aria-pressed={r.votado}
          disabled={ocupado || cerrado}
          title={cerrado ? 'Ya está cerrado' : r.votado ? 'Quitar mi voto' : 'Votarlo'}
          onClick={() => ejecutar(() => votarRequisito(r.id))}
        >
          <ThumbsUp size={16} aria-hidden="true" /> {r.votos} {r.votos === 1 ? 'voto' : 'votos'}
        </button>
        {puedeReescribirlo && !editando ? (
          <button type="button" className="boton boton-secundario" onClick={() => setEditando(true)}>
            Reescribir
          </button>
        ) : null}
      </div>

      {esAdmin ? (
        <div className="buzon-admin">
          <label className="campo-etiqueta" htmlFor={`estado-${r.id}`}>
            Estado
          </label>
          <select
            id={`estado-${r.id}`}
            className="campo-control"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoDeRequisito)}
          >
            {ESTADOS_DE_REQUISITO.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          <label className="campo-etiqueta" htmlFor={`respuesta-${r.id}`}>
            Respuesta (le llega por correo a quien lo propuso)
          </label>
          <textarea
            id={`respuesta-${r.id}`}
            className="campo-control"
            rows={2}
            value={respuesta}
            maxLength={LARGO_MAXIMO_DE_LA_RESPUESTA}
            onChange={(e) => setRespuesta(e.target.value)}
          />
          <div className="fila-botones">
            <button
              type="button"
              className="boton"
              disabled={ocupado || (estado === r.estado && respuesta === r.respuesta)}
              onClick={() => ejecutar(() => responderRequisito(r.id, estado, respuesta))}
            >
              Guardar respuesta
            </button>
            <button
              type="button"
              className="boton boton-secundario"
              disabled={ocupado}
              onClick={async () => {
                const si = await confirmar({
                  titulo: 'Eliminar el requisito',
                  mensaje: `«${r.titulo}» y sus votos se borran. No hay vuelta atrás.`,
                  confirmar: 'Eliminar',
                  peligro: true,
                })
                if (si) ejecutar(() => eliminarRequisito(r.id))
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
