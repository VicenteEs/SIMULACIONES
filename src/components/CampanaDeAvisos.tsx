'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { marcarAvisosLeidos } from '@/app/(frontend)/acciones/avisos'
import type { AvisoDeLaPlataforma } from '@/lib/avisosServidor'
import { Modal } from '@/components/ui/Modal'

// Con la zona puesta, como el historial de la difusión (D-236): se pinta en el
// servidor y se hidrata en el navegador, y sin ella cada uno pondría su hora.
/** Si se está en el navegador no cambia nunca: no hay nada a lo que suscribirse. */
const sinCambios = () => () => {}

const fecha = (valor: string) =>
  new Date(valor).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' })

/**
 * Los avisos de la plataforma en la barra (P-016 E6, D-375, D-406): una
 * campana con cuántos quedan sin leer.
 *
 * Los que no se han leído se abren solos al entrar, que es lo que pide D-375:
 * un aviso que hay que ir a buscar a una campana no avisa. Al cerrar la caja,
 * o al seguir su botón, quedan leídos y la campana se queda con ellos a mano
 * mientras sigan vigentes.
 *
 * Sin avisos no se pinta nada: una campana siempre vacía enseña a no mirarla.
 */
export function CampanaDeAvisos({ avisos }: { avisos: AvisoDeLaPlataforma[] }) {
  const router = useRouter()
  const sinLeer = avisos.filter((a) => !a.leido)
  // Abierta de entrada si hay algo nuevo. La barra vive en la plantilla, que
  // no se vuelve a montar al navegar: se abre una vez por entrada, no en cada
  // página.
  const [abierta, setAbierta] = useState(sinLeer.length > 0)
  // La caja va al final de `<body>` y no dentro de la barra: la barra es
  // `sticky` con su propio `z-index`, y lo que queda dentro de ella no puede
  // pasar por encima de lo que la página ponga más alto, como la consola del
  // simulador. Y solo en el navegador, porque en el servidor no hay
  // `document` al que llevarla: con `useSyncExternalStore`, como
  // `useEsTactil`, el primer pintado dice «no» en los dos lados y no hay
  // desajuste al hidratar; un efecto que lo apuntara en un estado pintaría dos
  // veces.
  const enElNavegador = useSyncExternalStore(sinCambios, () => true, () => false)

  if (avisos.length === 0) return null

  /** `porElBoton`: el aviso cuyo botón se siguió, para que el historial cuente quién lo hizo. */
  const cerrar = (porElBoton?: string) => {
    setAbierta(false)
    if (sinLeer.length === 0) return
    void marcarAvisosLeidos(
      sinLeer.map((a) => a.id),
      porElBoton,
    ).then(() => router.refresh())
  }

  return (
    <div className="campana-de-avisos">
      <button
        type="button"
        className="enlace-nav campana-boton"
        onClick={() => setAbierta(true)}
        aria-label={sinLeer.length > 0 ? `Avisos: ${sinLeer.length} sin leer` : 'Avisos'}
      >
        <Bell size={16} aria-hidden="true" />
        {sinLeer.length > 0 ? (
          <span className="campana-insignia" aria-hidden="true">
            {sinLeer.length}
          </span>
        ) : null}
      </button>
      {abierta && enElNavegador ? createPortal(
        <Modal titulo={sinLeer.length > 0 ? 'Avisos nuevos' : 'Avisos'} onCerrar={() => cerrar()} ancho="ancho">
          <ul className="avisos-lista">
            {avisos.map((aviso) => (
              <li key={aviso.id} className={aviso.leido ? 'aviso-item' : 'aviso-item aviso-item-nuevo'}>
                <p className="aviso-item-cabecera">
                  <strong>{aviso.asunto}</strong>
                  <span className="aviso-item-fecha">
                    {aviso.leido ? '' : 'Nuevo · '}
                    {fecha(aviso.creado)}
                  </span>
                </p>
                {aviso.mensaje
                  .split(/\n{2,}/)
                  .map((parrafo) => parrafo.trim())
                  .filter(Boolean)
                  .map((parrafo, i) => (
                    <p key={i} className="aviso-item-texto">
                      {parrafo}
                    </p>
                  ))}
                {aviso.boton && 'interno' in aviso.boton ? (
                  <Link className="boton" href={aviso.boton.interno} onClick={() => cerrar(aviso.id)}>
                    {aviso.boton.texto}
                  </Link>
                ) : aviso.boton ? (
                  <a
                    className="boton"
                    href={aviso.boton.externo}
                    target="_blank"
                    rel="noopener"
                    onClick={() => cerrar(aviso.id)}
                  >
                    {aviso.boton.texto}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => cerrar()} data-foco-inicial>
              Entendido
            </button>
          </div>
        </Modal>,
        document.body,
      ) : null}
    </div>
  )
}
