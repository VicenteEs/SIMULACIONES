'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { actualizarCotizacion, eliminarCotizacion } from '@/app/(frontend)/acciones/cotizaciones'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { ESTADOS_DE_COTIZACION, LARGOS_DE_COTIZACION, esEstadoDeCotizacion, type EstadoDeCotizacion } from '@/lib/cotizaciones'

/**
 * Lo que el administrador hace con una solicitud: cambiarle el estado, anotar
 * y, si no era de nadie, borrarla.
 *
 * El estado se guarda al elegirlo, sin botón: es un gesto de un clic y
 * pedirle un «Guardar» aparte es la forma segura de que se quede sin guardar.
 * Las notas sí llevan botón, porque se escriben a ratos y guardar a cada tecla
 * llenaría el registro de acciones de versiones a medias.
 */
export function GestionDeCotizacion({
  id,
  estado: estadoInicial,
  notas: notasIniciales,
  institucion,
}: {
  id: string
  estado: EstadoDeCotizacion
  notas: string
  institucion: string
}) {
  const router = useRouter()
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const [enCurso, iniciar] = useTransition()
  const [estado, setEstado] = useState(estadoInicial)
  const [notas, setNotas] = useState(notasIniciales)
  const [guardadas, setGuardadas] = useState(notasIniciales)
  const [error, setError] = useState<string | null>(null)

  const largo = [...notas].length
  const demasiado = largo > LARGOS_DE_COTIZACION.notas
  const sinGuardar = notas.trim() !== guardadas.trim()

  const cambiarEstado = (nuevo: EstadoDeCotizacion) => {
    const anterior = estado
    setEstado(nuevo)
    setError(null)
    iniciar(async () => {
      const r = await actualizarCotizacion(id, { estado: nuevo })
      if (r.exito) {
        avisar('ok', 'Estado guardado.')
        router.refresh()
      } else {
        // Se vuelve atrás: el selector no puede decir un estado que la base no tiene.
        setEstado(anterior)
        setError(r.mensaje ?? 'No se pudo cambiar el estado.')
      }
    })
  }

  const guardarNotas = () => {
    setError(null)
    iniciar(async () => {
      const r = await actualizarCotizacion(id, { notas })
      if (r.exito) {
        setGuardadas(notas)
        avisar('ok', 'Notas guardadas.')
        router.refresh()
      } else {
        setError(r.mensaje ?? 'No se pudieron guardar las notas.')
      }
    })
  }

  const borrar = async () => {
    const si = await confirmar({
      titulo: '¿Borrar esta solicitud?',
      mensaje: `La de ${institucion} desaparece del panel y no se puede recuperar. Si fue una conversación que no siguió adelante, mejor ciérrala.`,
      confirmar: 'Borrar',
      peligro: true,
    })
    if (!si) return
    setError(null)
    iniciar(async () => {
      const r = await eliminarCotizacion(id)
      if (r.exito) {
        avisar('ok', 'Solicitud borrada.')
        router.push('/admin-panel/cotizaciones')
      } else {
        setError(r.mensaje ?? 'No se pudo borrar la solicitud.')
      }
    })
  }

  return (
    <section className="admin-card cot-gestion" aria-labelledby="cot-gestion-titulo" aria-busy={enCurso}>
      <h2 id="cot-gestion-titulo" className="admin-card-title">
        Seguimiento
      </h2>

      {error ? (
        <div className="admin-aviso admin-aviso-error" role="alert">
          {error}
        </div>
      ) : null}

      <label className="admin-filter-label" htmlFor="cot-estado">
        Estado
      </label>
      <select
        id="cot-estado"
        className="admin-select"
        value={estado}
        disabled={enCurso}
        onChange={(e) => {
          if (esEstadoDeCotizacion(e.target.value)) cambiarEstado(e.target.value)
        }}
      >
        {ESTADOS_DE_COTIZACION.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>

      <label className="admin-filter-label cot-etiqueta-notas" htmlFor="cot-notas">
        Notas internas
      </label>
      <textarea
        id="cot-notas"
        className="admin-input cot-notas"
        rows={8}
        value={notas}
        placeholder="Qué se habló, qué se ofreció, cuándo volver a escribir… Solo las ven los administradores."
        aria-describedby="cot-notas-cuenta"
        aria-invalid={demasiado || undefined}
        onChange={(e) => setNotas(e.target.value)}
      />
      <p id="cot-notas-cuenta" className={`cot-cuenta${demasiado ? ' cot-cuenta-excedida' : ''}`}>
        {largo} de {LARGOS_DE_COTIZACION.notas}
        {sinGuardar ? ' · sin guardar' : ''}
      </p>

      <div className="admin-acciones cot-gestion-acciones">
        <button type="button" className="admin-btn admin-btn-primary" disabled={enCurso || demasiado || !sinGuardar} onClick={guardarNotas}>
          {enCurso ? <Loader2 size={16} className="cot-girando" aria-hidden /> : <Save size={16} aria-hidden />}
          Guardar notas
        </button>
        <button type="button" className="admin-btn admin-btn-ghost cot-borrar" disabled={enCurso} onClick={borrar}>
          <Trash2 size={16} aria-hidden /> Borrar
        </button>
      </div>
    </section>
  )
}
