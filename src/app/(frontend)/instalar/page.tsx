import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { FormularioInstalar } from './FormularioInstalar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Primera cuenta · TraumaHub',
  robots: { index: false, follow: false },
}

/**
 * Primera cuenta de una instalación nueva.
 *
 * Solo existe mientras la plataforma está vacía: en cuanto hay una cuenta, esta
 * ruta manda a entrar. La comprobación se repite en la acción de servidor,
 * porque una página que redirige no impide que alguien llame a la acción por su
 * cuenta.
 */
export default async function PaginaInstalar() {
  if (!(await faltaLaPrimeraCuenta())) redirect('/entrar')

  return (
    <main className="acceso">
      <div className="acceso-caja">
        <div className="acceso-marca">
          <img src="/logo.png" alt="TraumaHub" className="acceso-logo" />
        </div>
        <h1 className="acceso-titulo">Primera cuenta</h1>

        <p className="acceso-aviso" style={{ marginBottom: 18 }}>
          La plataforma está recién instalada y no tiene ninguna cuenta. Esta primera queda como
          <strong> administradora y activa</strong>; las siguientes las crea usted desde el panel.
        </p>

        <FormularioInstalar />

        <p className="acceso-nota">
          Guarde estas credenciales: sin otra cuenta de administrador, recuperarlas exige entrar al
          servidor.
        </p>
      </div>
    </main>
  )
}
