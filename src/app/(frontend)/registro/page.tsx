import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'
import { hayCorreo } from '@/correo/enviar'
import { ruta } from '@/lib/rutas'
import { lugarDeLaPeticion } from '@/lib/institucionesServidor'
import { codigoDeLaInstitucion, codigosIguales } from '@/lib/invitacionesServidor'
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
 *
 * En el subdominio de una institución, la cuenta se pide con su enlace de
 * invitación (D-402), que lleva el código en `?invitacion=`. Sin él, o con uno
 * que ya no vale, la página explica a quién pedírselo y no enseña el
 * formulario: rellenar tres pasos para leer al final «el enlace no es válido»
 * es lo que no puede pasar. La acción lo vuelve a comprobar, porque se llama
 * sin pasar por aquí.
 */
export default async function PaginaRegistro({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sesion = await obtenerSesion()
  if (sesion.usuario && sesion.activo) redirect('/')
  if (await faltaLaPrimeraCuenta()) redirect('/instalar')

  const payload = await getPayload({ config })
  const lugar = await lugarDeLaPeticion(payload, await headers())
  const pedida = (await searchParams).invitacion
  const invitacion = typeof pedida === 'string' ? pedida : ''
  // Un subdominio sin institución no llega hasta aquí (`proxy.ts` lo para), y
  // si llegara, tampoco tiene enlace que valga.
  const conInvitacion = lugar.institucion
    ? codigosIguales(invitacion, await codigoDeLaInstitucion(payload, lugar.institucion.id))
    : !lugar.subdominio

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
          {conInvitacion ? (
            <FormularioRegistro conCorreo={hayCorreo()} invitacion={lugar.institucion ? invitacion : undefined} />
          ) : (
            <section className="ac-tarjeta" aria-labelledby="registro-sin-invitacion">
              <h1 id="registro-sin-invitacion" className="ac-titulo">
                Solicitar una cuenta
              </h1>
              <p className="ac-bajada">
                {invitacion ? 'Este enlace de invitación ya no vale: puede que lo hayan cambiado. ' : ''}
                En {lugar.institucion?.nombre ?? 'esta institución'} la cuenta se pide con el enlace de invitación que
                reparte quien administra TraumaHub allí. Pídele el enlace vigente.
              </p>
            </section>
          )}

          {/* El aviso, aquí además de en la casilla del último paso: esta nota
              se ve desde el primero, y quien quiera saber qué se hace con sus
              datos lo lee antes de escribirlos. En otra pestaña por lo mismo
              que la casilla: navegar en esta perdería lo escrito. */}
          <p className="ac-nota">
            ¿Ya tienes cuenta? <Link href="/entrar">Entrar</Link>
            <br />
            Qué hacemos con tus datos:{' '}
            <Link href="/privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </Link>
            .
          </p>
        </div>
      </div>
      <PanelDeRegistro />
    </main>
  )
}
