import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { PanelDeEntrar } from '@/components/acceso/PanelesDeMarca'
import { FormularioEntrar } from './FormularioEntrar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Entrar · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * Pantalla de entrada propia, con el tablero «Entrar» de Penpot (D-236): la
 * marca a la izquierda y el formulario en su tarjeta a la derecha.
 *
 * Quien ya tiene sesión no la ve: se le manda a donde iba. Volver a mostrar el
 * formulario a alguien que ya entró es el modo más rápido de que crea que su
 * sesión se perdió.
 */
export default async function PaginaEntrar() {
  const sesion = await obtenerSesion()
  if (sesion.usuario && sesion.activo) redirect('/')
  // Instalación recién desplegada: no hay a quién pedirle una cuenta todavía.
  if (await faltaLaPrimeraCuenta()) redirect('/instalar')

  return (
    <main className="ac-pantalla">
      <PanelDeEntrar />
      <div className="ac-lado">
        <section className="ac-tarjeta" aria-labelledby="entrar-titulo">
          <h1 id="entrar-titulo" className="ac-titulo">
            Entrar
          </h1>
          <p className="ac-bajada">Con su cuenta de la plataforma.</p>

          <FormularioEntrar cuentaInactiva={Boolean(sesion.usuario && !sesion.activo)} />

          <p className="ac-nota">
            ¿No tiene cuenta? <Link href="/registro">Solicite acceso.</Link>
            <br />
            Un administrador revisa cada solicitud antes de activarla.
          </p>
        </section>
      </div>
    </main>
  )
}
