import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Portada. La plataforma es cerrada (decisión D-020): sin sesión activa no se
 * muestra contenido, solo la puerta de entrada.
 */
export default async function Inicio() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  const activo = Boolean(user && (user as { activo?: boolean }).activo)

  return (
    <main>
      <h1>Plataforma docente de traumatología</h1>
      <p className="entrada">
        Estudio de la patología, exploración física, técnica quirúrgica y lectura de imágenes.
      </p>

      {!user && (
        <div className="tarjeta">
          <p>Esta plataforma requiere una cuenta activa para ver su contenido.</p>
          <a className="boton" href="/admin">
            Iniciar sesión
          </a>
        </div>
      )}

      {user && !activo && (
        <div className="tarjeta">
          <p>
            Su cuenta existe pero todavía no ha sido activada. Un administrador debe habilitarla
            antes de que pueda ver el contenido.
          </p>
        </div>
      )}

      {activo && (
        <div className="tarjeta">
          <p>
            Sesión iniciada como <strong>{(user as { nombre?: string }).nombre}</strong>.
          </p>
          <a className="boton" href="/admin">
            Ir al panel de contenido
          </a>
        </div>
      )}

      <p className="aviso">
        Prototipo en desarrollo. Sin datos de pacientes y sin uso clínico.
      </p>
    </main>
  )
}
