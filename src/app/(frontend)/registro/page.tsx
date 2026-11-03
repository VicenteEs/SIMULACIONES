import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { hayCorreo } from '@/correo/enviar'
import { ruta } from '@/lib/rutas'
import { PanelDeRegistro } from '@/components/acceso/PanelesDeMarca'
import { FormularioRegistro } from './FormularioRegistro'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Solicitar una cuenta · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * Solicitud pública de cuenta (D-119), con el tablero «Registro» de Penpot
 * (D-236): el formulario en tres pasos a la izquierda y la marca a la derecha.
 *
 * Pedir no es entrar: la cuenta nace desactivada y un administrador la revisa
 * antes de activarla. El último paso lo dice antes de enviar y no solo
 * después, porque quien lo descubre al intentar entrar cree que la plataforma
 * se ha roto.
 *
 * Con la base vacía se manda a `/instalar`, igual que desde `/entrar`: ahí no
 * hay nadie que pueda revisar la solicitud, y la acción, por su parte, se niega
 * a crearla.
 */
export default async function PaginaRegistro() {
  const sesion = await obtenerSesion()
  if (sesion.usuario && sesion.activo) redirect('/')
  if (await faltaLaPrimeraCuenta()) redirect('/instalar')

  return (
    <main className="ac-pantalla ac-pantalla-registro">
      <div className="ac-lado">
        <div className="ac-columna">
          <Link href="/" className="ac-logo-vertical" aria-label="TraumaHub, volver a la portada">
            <img src={ruta('/icon.png')} alt="" width={48} height={48} />
            TraumaHub
          </Link>

          {/* Se pregunta aquí, en el servidor, porque la variable no llega al
              navegador. Sin correo configurado, ni el segundo paso ni el aviso
              final pueden prometer un mensaje que nunca va a salir. */}
          <FormularioRegistro conCorreo={hayCorreo()} />

          <p className="ac-nota">
            ¿Ya tienes cuenta? <Link href="/entrar">Entrar</Link>
          </p>
        </div>
      </div>
      <PanelDeRegistro />
    </main>
  )
}
