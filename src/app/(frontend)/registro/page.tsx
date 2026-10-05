import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { hayCorreo } from '@/correo/enviar'
import { FormularioRegistro } from './FormularioRegistro'
import { ruta } from '@/lib/rutas'
import { MallaDeNodos } from '@/components/MallaDeNodos'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Solicitar una cuenta · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * Solicitud pública de cuenta (D-119).
 *
 * Pedir no es entrar: la cuenta nace desactivada y un administrador la revisa
 * antes de activarla. La pantalla lo dice antes del formulario y no solo
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
    <main className="acceso">
      <div className="acceso-fondo" aria-hidden="true">
        <MallaDeNodos className="portada-malla" />
      </div>
      <div className="acceso-caja">
        <div className="acceso-marca">
          <img src={ruta('/logo-hd.png')} alt="TraumaHub" className="acceso-logo" />
        </div>
        <h1 className="acceso-titulo">Solicitar una cuenta</h1>

        <p className="advertencia">
          Complete sus datos. La cuenta queda <strong>pendiente</strong> hasta que un administrador
          revise la solicitud y la active; mientras tanto no podrá entrar.
        </p>

        {/* Se pregunta aquí, en el servidor, porque la variable no llega al
            navegador. Sin correo configurado el aviso final no puede prometer
            un mensaje que nunca va a salir. */}
        <FormularioRegistro conCorreo={hayCorreo()} />

        <p className="acceso-nota">
          ¿Ya tiene cuenta? <Link href="/entrar">Entrar</Link>
        </p>
      </div>
    </main>
  )
}
