'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  asignarRevisor,
  devolverAlRevisor,
  enviarARevision,
  revisoresPosibles,
  sacarDeRevision,
} from '@/app/(frontend)/acciones/revision'
import {
  ORIGENES_DE_CONTENIDO,
  duracionEnPalabras,
  estadoEnPalabras,
  origenEnPalabras,
  type EstadoDeRevision,
} from '@/lib/revision'
import type { RevisionParaElEditor } from '@/lib/revisionServidor'

/**
 * La revisión de una ficha, dentro de su editor (D-142).
 *
 * Para el revisor: de dónde salió el texto —el libro y las páginas con que
 * cotejarlo—, en qué estado está, si se la devolvieron y por qué, cuánto lleva
 * revisado y una nota para quien la publique. Y la advertencia de que se mide:
 * el tiempo y lo que cambia se registran, y decirlo es lo justo y, de paso, la
 * primera forma de que no se valide por validar.
 *
 * Para el administrador, además: cuánto se editó contra el original, a quién
 * se asigna, devolverla con un motivo y sacarla de revisión. Y, en una ficha
 * que no está en revisión, meterla.
 *
 * El botón «Listo para publicar» no vive aquí sino en la barra del editor,
 * junto a «Guardar borrador»: validar incluye guardar lo que haya pendiente, y
 * eso lo sabe hacer el formulario.
 */

const fecha = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

/** Cierra la frase con punto, salvo que ya acabe en uno: «10:10 p. m.» no lleva otro. */
const conPunto = (frase: string) => (frase.endsWith('.') ? frase : `${frase}.`)

const CLASE_DE_ESTADO: Record<EstadoDeRevision, string> = {
  pendiente: 'revision-estado-pendiente',
  'en-revision': 'revision-estado-en-revision',
  lista: 'revision-estado-lista',
  devuelta: 'revision-estado-devuelta',
  publicada: 'revision-estado-publicada',
}

/** Qué se pinta cuando la acción de servidor no llega a responder (ver `FormularioDocumento`). */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

export function RevisionEnElEditor({
  revision,
  esAdmin,
  coleccion,
  id,
  secciones,
  vistas,
  nota,
  alCambiarNota,
}: {
  revision: RevisionParaElEditor | null
  esAdmin: boolean
  coleccion: string
  id: string | null
  /** Las secciones con algo escrito, para decir cuántas lleva revisadas. */
  secciones: string[]
  /** Las secciones que quien mira ya tuvo delante lo bastante. */
  vistas: ReadonlySet<string>
  nota: string
  alCambiarNota: (texto: string) => void
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [revisores, setRevisores] = useState<{ id: string; nombre: string; rol: string }[] | null>(null)
  const [asignarA, setAsignarA] = useState('')
  const [devolviendo, setDevolviendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [origen, setOrigen] = useState({
    origen: 'ia',
    libro: '',
    capitulo: '',
    paginas: '',
    lote: '',
    modelo: '',
  })

  // Los revisores se piden una vez y solo para el administrador, que es quien
  // asigna. El editor no tiene por qué ver la lista de cuentas.
  const hayQuePedirRevisores = esAdmin && id !== null && (revision !== null || enviando)
  useEffect(() => {
    if (!hayQuePedirRevisores || revisores !== null) return
    revisoresPosibles()
      .then((r) => setRevisores(r.exito && r.datos ? r.datos : []))
      .catch(() => setRevisores([]))
  }, [hayQuePedirRevisores, revisores])

  const hacer = (tarea: () => Promise<{ exito: boolean; mensaje?: string }>, hecho: string, despues?: () => void) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (!r.exito) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
          return
        }
        despues?.()
        setAviso({ tipo: 'ok', texto: hecho })
        router.refresh()
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo completar.') })
      }
    })
  }

  if (id === null) return null

  if (!revision) {
    // Una ficha fuera de revisión solo le enseña algo al administrador: la
    // puerta para meterla.
    if (!esAdmin) return null
    return (
      <div className="revision-caja revision-caja-fuera">
        {!enviando ? (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setEnviando(true)}>
            Enviar a revisión…
          </button>
        ) : (
          <div className="revision-formulario">
            <strong>Enviar a revisión</strong>
            <p className="revision-nota">
              Lo que la ficha tiene ahora queda como su versión original: contra ella se medirá cuánto
              se edita. Un editor tendrá que darla por lista y usted, publicarla.
            </p>
            <div className="revision-rejilla">
              <label>
                <span className="campo-etiqueta">Origen</span>
                <select
                  className="campo-control"
                  value={origen.origen}
                  onChange={(e) => setOrigen({ ...origen, origen: e.target.value })}
                >
                  {ORIGENES_DE_CONTENIDO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {(['libro', 'capitulo', 'paginas', 'lote', 'modelo'] as const).map((campo) => (
                <label key={campo}>
                  <span className="campo-etiqueta">
                    {{ libro: 'Libro', capitulo: 'Capítulo', paginas: 'Páginas', lote: 'Lote', modelo: 'Modelo que lo redactó' }[campo]}
                  </span>
                  <input
                    className="campo-control"
                    value={origen[campo]}
                    onChange={(e) => setOrigen({ ...origen, [campo]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                <span className="campo-etiqueta">Asignar a</span>
                <select className="campo-control" value={asignarA} onChange={(e) => setAsignarA(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(revisores ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                      {r.rol === 'admin' ? ' (administrador)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-acciones">
              <button
                type="button"
                className="admin-btn admin-btn-primary admin-btn-sm"
                disabled={enCurso}
                onClick={() =>
                  hacer(
                    () => enviarARevision(coleccion, id, { ...origen, asignadaA: asignarA || null }),
                    'La ficha entró en revisión.',
                    () => setEnviando(false),
                  )
                }
              >
                {enCurso ? 'Enviando…' : 'Enviar a revisión'}
              </button>
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setEnviando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}
      </div>
    )
  }

  const fuente = [
    revision.libro ? `«${revision.libro}»` : null,
    revision.capitulo ? `cap. ${revision.capitulo}` : null,
    revision.paginas ? `págs. ${revision.paginas}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const revisadas = secciones.filter((s) => vistas.has(s)).length
  const cerrada = revision.estado === 'lista' || revision.estado === 'publicada'

  return (
    <section className="revision-caja" aria-label="Revisión de la ficha">
      <div className="revision-cabecera">
        <span className={`admin-badge ${CLASE_DE_ESTADO[revision.estado] ?? 'admin-badge-neutro'}`}>
          {estadoEnPalabras(revision.estado)}
        </span>
        <strong>{origenEnPalabras(revision.origen)}</strong>
        {fuente ? <span>{fuente}</span> : null}
        {revision.lote ? <span className="revision-tenue">lote {revision.lote}</span> : null}
        {revision.modelo ? <span className="revision-tenue">{revision.modelo}</span> : null}
        <span className="revision-derecha">
          {revision.asignadaA ? `Asignada a ${revision.asignadaA.nombre}` : 'Sin asignar'}
        </span>
      </div>

      {revision.estado === 'devuelta' && revision.motivoDeDevolucion ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>El administrador la devolvió para revisarla otra vez.</strong>
          {revision.motivoDeDevolucion}
        </div>
      ) : null}

      {revision.estado === 'lista' || revision.listaPor ? (
        <p className="revision-linea">
          {conPunto(
            `${revision.estado === 'lista' ? 'Validada' : 'Última validación'}${
              revision.listaPor ? ` por ${revision.listaPor}` : ''
            }${revision.listaEn ? ` el ${fecha(revision.listaEn)}` : ''}`,
          )}
          {revision.notaDeRevision ? ` Nota: «${revision.notaDeRevision}».` : ''}
        </p>
      ) : null}

      {esAdmin && revision.validacionRapida && revision.motivosDeAlerta ? (
        <div className="admin-aviso admin-aviso-error">
          <strong>La validación quedó señalada.</strong>
          {revision.motivosDeAlerta}.
        </div>
      ) : null}

      {!cerrada ? (
        <>
          <p className="revision-linea">
            Su revisión: {duracionEnPalabras(revision.mio.segundosActivos)} de revisión activa ·{' '}
            {revisadas} de {secciones.length} secciones con contenido revisadas. Las revisadas llevan ✓
            en su pestaña.
          </p>
          <label className="revision-nota-campo">
            <span className="campo-etiqueta">Nota para quien publique (opcional)</span>
            <textarea
              className="campo-control"
              rows={2}
              maxLength={2000}
              placeholder="Qué comprobó contra el libro, qué corrigió, qué dudas quedan."
              value={nota}
              onChange={(e) => alCambiarNota(e.target.value)}
            />
          </label>
        </>
      ) : null}

      <p className="revision-nota">
        Mientras la ficha está abierta se registra el tiempo de revisión activa, y al guardar, lo que
        cambia respecto del texto original. «Listo para publicar» la entrega al administrador, que es
        quien la publica.
      </p>

      {esAdmin ? (
        <div className="revision-administrar">
          {revision.medida ? (
            <p className="revision-linea">
              Editada un <strong>{revision.medida.porcentaje.toLocaleString('es-CL')} %</strong> respecto
              del original ({revision.medida.palabrasOriginales.toLocaleString('es-CL')} →{' '}
              {revision.medida.palabrasActuales.toLocaleString('es-CL')} palabras).{' '}
              <Link href="/admin-panel/auditoria">Ver la auditoría</Link>
            </p>
          ) : null}
          <div className="admin-acciones">
            <select
              className="admin-select"
              aria-label="Revisor al que asignar la ficha"
              value={asignarA}
              onChange={(e) => setAsignarA(e.target.value)}
            >
              <option value="">— Asignar a —</option>
              <option value="nadie">Nadie (quitar la asignación)</option>
              {(revisores ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.rol === 'admin' ? ' (administrador)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={enCurso || asignarA === ''}
              onClick={() =>
                hacer(
                  () => asignarRevisor([{ coleccion, id }], asignarA === 'nadie' ? null : asignarA),
                  asignarA === 'nadie' ? 'Asignación quitada.' : 'Ficha asignada.',
                  () => setAsignarA(''),
                )
              }
            >
              Asignar
            </button>
            {revision.estado !== 'publicada' && revision.estado !== 'devuelta' ? (
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => setDevolviendo((abierto) => !abierto)}
                aria-expanded={devolviendo}
              >
                Devolver al revisor…
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn admin-btn-danger admin-btn-sm"
              disabled={enCurso}
              onClick={() => {
                if (
                  !confirm(
                    '¿Sacar esta ficha de revisión?\n\nSe borran su versión original, su historial y el tiempo que los revisores le dedicaron. La ficha no se toca, y desde ese momento se publica como cualquier otra.',
                  )
                )
                  return
                hacer(() => sacarDeRevision(coleccion, id), 'La ficha salió de revisión.')
              }}
            >
              Sacar de revisión
            </button>
          </div>
          {devolviendo ? (
            <div className="revision-formulario">
              <label>
                <span className="campo-etiqueta">Qué hay que revisar otra vez</span>
                <textarea
                  className="campo-control"
                  rows={3}
                  maxLength={2000}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <div className="admin-acciones">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary admin-btn-sm"
                  disabled={enCurso || motivo.trim() === ''}
                  onClick={() =>
                    hacer(() => devolverAlRevisor(coleccion, id, motivo), 'Devuelta al revisor.', () => {
                      setDevolviendo(false)
                      setMotivo('')
                    })
                  }
                >
                  Devolver
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}
    </section>
  )
}
