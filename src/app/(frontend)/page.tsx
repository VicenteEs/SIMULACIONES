import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Esta página consulta la sesión en cada visita, de modo que nunca debe
 * prerenderizarse: una portada estática mostraría el mismo HTML a todo el
 * mundo sin comprobar quién entra, y además rompe la compilación cuando no hay
 * base de datos accesible, como ocurre al construir la imagen de producción.
 */
export const dynamic = 'force-dynamic'

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
          <div className="row-botones">
            <a className="boton" href="/biblioteca">
              Ver la biblioteca
            </a>
            <a className="boton secundario" href="/admin">
              Panel de contenido
            </a>
          </div>
        </div>
      )}

      <p className="aviso">
        Prototipo en desarrollo. Sin datos de pacientes y sin uso clínico.
      </p>
    </main>
  )
}
