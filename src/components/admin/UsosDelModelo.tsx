'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Replace } from 'lucide-react'
import { reemplazarModeloEnTodo } from '@/app/(frontend)/acciones/modelos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { useAvisos } from '@/components/ui/Avisos'

export interface UsoEnLaFicha {
  clave: string
  titulo: string
  etiqueta: string
  /** A su ficha en el panel; `null` si se edita en un taller y no tiene ficha propia. */
  href: string | null
}

/**
 * «Dónde se usa» y «Reemplazar por…» en la ficha de un modelo 3D (D-372).
 *
 * Antes la ficha no decía nada, y la única forma de saber si un modelo se podía
 * borrar era borrarlo. Aquí se ve antes: lo que lo usa, con enlace, y la salida
 * para dejarlo libre. El borrado lo sigue negando el gancho de la colección
 * aunque esto no esté; esto es para que no haga falta tropezar con él.
 *
 * Solo se nombra lo que quien mira puede editar, como en el aviso del borrado
 * (`mensajeDeModeloEnUso`), y lo demás se cuenta.
 */
export function UsosDelModelo({
  modeloId,
  usos,
  ajenos,
  candidatos,
}: {
  modeloId: string
  usos: UsoEnLaFicha[]
  ajenos: number
  /** Los modelos de la misma carpeta, ya con su etiqueta (`etiquetaDeModelo`). */
  candidatos: { id: string; etiqueta: string }[]
}) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const avisar = useAvisos()
  const [hacia, setHacia] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enCurso, iniciar] = useTransition()
  const total = usos.length + ajenos

  const reemplazar = async () => {
    const elegido = candidatos.find((c) => c.id === hacia)
    if (!elegido) return
    // Sin el «sin usar» de la etiqueta: en la pregunta sobra, y después del cambio deja de ser verdad.
    const nombre = elegido.etiqueta.replace(/ · sin usar$/, '')
    const si = await confirmar({
      titulo: `¿Cambiar este modelo por «${nombre}» en ${total === 1 ? 'el sitio que lo usa' : `los ${total} sitios que lo usan`}?`,
      mensaje:
        'Cambia en el documento y en su último borrador. Si el modelo nuevo llama distinto a sus piezas, abra cada caso en el editor para revisarlas. Este modelo no se borra: queda libre para borrarlo después.',
      confirmar: 'Reemplazar en todos',
    })
    if (!si) return
    setError(null)
    iniciar(async () => {
      const r = await reemplazarModeloEnTodo(modeloId, hacia)
      if (!r.exito) {
        setError(r.mensaje ?? 'No se pudo reemplazar.')
        return
      }
      const n = r.datos?.cambiados ?? 0
      avisar('ok', n === 1 ? 'Se cambió el modelo en 1 sitio.' : `Se cambió el modelo en ${n} sitios.`)
      setHacia('')
      router.refresh()
    })
  }

  return (
    <section className="admin-card usos-del-modelo" aria-labelledby="usos-del-modelo-titulo">
      <h2 id="usos-del-modelo-titulo" className="usos-del-modelo-titulo">
        Dónde se usa
      </h2>
      {total === 0 ? (
        <p className="usos-del-modelo-nota">Nada usa este modelo: se puede borrar sin dejar a nadie sin él.</p>
      ) : (
        <>
          <p className="usos-del-modelo-nota">
            {total === 1 ? 'Lo usa 1 sitio.' : `Lo usan ${total} sitios.`} Mientras alguno lo use, no se puede borrar.
          </p>
          {usos.length > 0 ? (
            <ul className="usos-del-modelo-lista">
              {usos.map((u) => (
                <li key={u.clave}>
                  {u.href ? <Link href={u.href}>{u.titulo}</Link> : <span>{u.titulo}</span>}{' '}
                  <span className="usos-del-modelo-etiqueta">{u.etiqueta}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {ajenos > 0 ? (
            <p className="usos-del-modelo-nota">
              {ajenos === 1 ? 'Y 1 de un módulo que usted no edita.' : `Y ${ajenos} de módulos que usted no edita.`} Para
              reemplazarlo, pídaselo a un administrador.
            </p>
          ) : candidatos.length === 0 ? (
            <p className="usos-del-modelo-nota">No hay otro modelo de la misma carpeta por el que reemplazarlo.</p>
          ) : (
            <div className="usos-del-modelo-reemplazo">
              <label className="usos-del-modelo-campo">
                <span>Reemplazar por…</span>
                <select
                  className="admin-select"
                  value={hacia}
                  onChange={(e) => setHacia(e.target.value)}
                  disabled={enCurso}
                >
                  <option value="">Elija un modelo de la misma carpeta</option>
                  {candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => void reemplazar()}
                disabled={!hacia || enCurso}
              >
                <Replace aria-hidden size={16} /> {enCurso ? 'Reemplazando…' : 'Reemplazar en todos'}
              </button>
            </div>
          )}
          {error ? (
            <p role="alert" className="admin-aviso admin-aviso-error">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
