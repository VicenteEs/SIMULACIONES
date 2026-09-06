import type { Metadata } from 'next'
import Link from 'next/link'
import { FormularioPedirClave } from './FormularioPedirClave'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Recuperar contraseña · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

export default function PaginaPedirClave() {
  return (
    <main className="acceso">
      <div className="acceso-caja">
        <div className="acceso-marca">
          <img src="/logo.png" alt="TraumaHub" className="acceso-logo" />
        </div>
        <h1 className="acceso-titulo">Recuperar contraseña</h1>

        <FormularioPedirClave />

        <p className="acceso-nota">
          Si no llega el correo, pida a quien administra la plataforma que le genere un enlace
          desde el panel: se puede entregar a mano.
        </p>
        <Link href="/entrar" className="acceso-enlace">
          Volver a entrar
        </Link>
      </div>
    </main>
  )
}
