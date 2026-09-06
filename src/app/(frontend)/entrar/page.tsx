import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { obtenerSesion } from '@/lib/sesion'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { FormularioEntrar } from './FormularioEntrar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Entrar · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * Pantalla de entrada propia.
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
    <main className="acceso">
      <div className="acceso-caja">
        <div className="acceso-marca">
          <img src="/logo.png" alt="TraumaHub" className="acceso-logo" />
        </div>
        <h1 className="acceso-titulo">Entrar</h1>

        <FormularioEntrar
          cuentaInactiva={Boolean(sesion.usuario && !sesion.activo)}
        />

        <p className="acceso-nota">
          El acceso es cerrado: las cuentas las crea y activa un administrador. Si necesita una,
          pídala a quien administra la plataforma.
        </p>
      </div>
    </main>
  )
}
