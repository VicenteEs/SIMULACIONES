'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, RefreshCw } from 'lucide-react'
import { regenerarCodigoDeInvitacion } from '@/app/(frontend)/acciones/admin'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { cifra } from '@/lib/graficos'

/**
 * El enlace con el que los alumnos de una institución piden su cuenta, y cuánto
 * queda del cupo (P-016 E5.7, D-402). Solo en el panel de una institución: en
 * la central se pide la cuenta sin enlace.
 *
 * El enlace no da entrada a nadie: deja pedir la cuenta, y la cuenta espera a
 * que el administrador la apruebe. Por eso se puede pegar en el aula virtual
 * del curso. Si se filtra fuera, «Cambiar el enlace» deja sin efecto el viejo.
 */
export function TarjetaDeInvitacion({
  enlace,
  cupo,
  activas,
}: {
  /** `null` si falta la dirección pública: sin ella no hay enlace que repartir. */
  enlace: string | null
  cupo: number
  activas: number
}) {
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [actual, setActual] = useState(enlace)
  const libres = Math.max(cupo - activas, 0)

  const copiar = () => {
    if (!actual) return
    void navigator.clipboard
      ?.writeText(actual)
      .then(() => avisar('ok', 'Enlace copiado.'))
      .catch(() => avisar('error', 'No se pudo copiar: selecciónelo y cópielo a mano.'))
  }

  const cambiar = async () => {
    const seguro = await confirmar({
      titulo: '¿Cambiar el enlace de invitación?',
      mensaje:
        'El enlace de ahora deja de servir en el acto: quien lo tenga y no haya pedido su cuenta necesitará el nuevo. Las solicitudes ya hechas no cambian.',
      confirmar: 'Cambiar',
    })
    if (!seguro) return
    iniciar(async () => {
      const r = await regenerarCodigoDeInvitacion()
      if (!r.exito || !r.datos) {
        avisar('error', r.mensaje ?? 'No se pudo cambiar el enlace.')
        return
      }
      setActual(r.datos.enlace)
      avisar('ok', 'Listo: el enlace anterior ya no sirve.')
      router.refresh()
    })
  }

  return (
    <TarjetaDeGrafico
      titulo="Invitación"
      bajada={`${cifra(activas)} de ${cifra(cupo)} cuentas activas · ${
        libres === 0 ? 'cupo lleno' : `${cifra(libres)} ${libres === 1 ? 'lugar libre' : 'lugares libres'}`
      }`}
    >
      <p className="usuarios-invitacion-texto">
        Con este enlace sus alumnos piden su cuenta. Cada solicitud espera a que usted la apruebe, y se aprueban hasta
        llenar el cupo.
      </p>
      {actual ? (
        <div className="usuarios-invitacion-enlace">
          <input className="admin-form-input admin-table-mono" readOnly value={actual} aria-label="Enlace de invitación" />
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={copiar}>
            <Copy aria-hidden size={14} />
            Copiar
          </button>
        </div>
      ) : (
        <p className="usuarios-invitacion-texto">
          Falta configurar la dirección pública de la plataforma: sin ella no se puede armar el enlace. Avise a TraumaHub.
        </p>
      )}
      <button
        type="button"
        className="admin-btn admin-btn-secondary admin-btn-sm"
        onClick={() => void cambiar()}
        disabled={enCurso}
      >
        <RefreshCw aria-hidden size={14} />
        Cambiar el enlace
      </button>
    </TarjetaDeGrafico>
  )
}
