import { getPayload } from 'payload'
import config from '@payload-config'
import { ShieldCheck } from 'lucide-react'
import { auditorDeLaFicha } from '@/lib/revisionServidor'
import { fechaDeAuditoria } from '@/lib/impresion'
import { tieneLasDos } from '@/lib/firmas'

/**
 * La línea «Revisada y firmada por…» bajo el título de una ficha (D-240).
 *
 * Solo con las dos firmas: al residente le sirve saber que un médico y un
 * kinesiólogo respondieron por lo que lee, y no le sirve «falta una firma», que
 * es asunto del equipo y se ve en el panel. En papel no sale, porque el membrete
 * (`EncabezadoImpreso`) ya lo dice con las fechas.
 *
 * Es de servidor por lo mismo que el membrete: las firmas viven en
 * `revisiones`, que el navegador no puede leer, y de ahí salen solo los dos
 * nombres.
 */
export async function FirmasDeLaFicha({ coleccion, documentoId }: { coleccion: string; documentoId: string }) {
  const payload = await getPayload({ config })
  const revision = await auditorDeLaFicha(payload, coleccion, documentoId).catch(() => null)
  if (!revision || !tieneLasDos(revision.firmas)) return null
  const { medico, kinesiologo } = revision.firmas
  const quien = (nombre: string | null) => nombre ?? 'una cuenta que ya no existe'
  const ultima = [medico!.en, kinesiologo!.en].sort().at(-1) ?? null
  const dia = fechaDeAuditoria(ultima)
  return (
    <p className="firmas-de-la-ficha">
      <ShieldCheck size={16} aria-hidden="true" />
      <span>
        Revisada y firmada por <strong>{quien(medico!.nombre)}</strong>, médico, y{' '}
        <strong>{quien(kinesiologo!.nombre)}</strong>, kinesiólogo{dia ? ` · ${dia}` : ''}.
      </span>
    </p>
  )
}
