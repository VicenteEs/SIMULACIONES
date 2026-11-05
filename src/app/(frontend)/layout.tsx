import type { Metadata } from 'next'
import React from 'react'
import { Navegacion } from '@/components/Navegacion'
import { AvisoActualizacion } from '@/components/AvisoActualizacion'
import { PieDePagina } from '@/components/PieDePagina'
import { LatidoDeActividad } from '@/components/LatidoDeActividad'
import { obtenerSesion } from '@/lib/sesion'
import { ProveedoresDeUI } from '@/components/ui/Proveedores'
import { PantallaDelAviso } from '@/components/privacidad/PantallaDelAviso'
import { debeAceptarElAviso } from '@/lib/avisoDePrivacidad'
// La fuente va antes que las hojas propias: `--sans` la nombra primero.
import '@fontsource-variable/inter'
import './estilos.css'
import './ui.css'
import { ruta } from '@/lib/rutas'

export const metadata: Metadata = {
  title: 'Plataforma docente de traumatología',
  description: 'Estudio, exploración física, técnica quirúrgica y lectura de imágenes.',
  // Acceso cerrado: la plataforma no debe indexarse (decisión D-020).
  robots: { index: false, follow: false },
  icons: {
    icon: ruta('/icon.png'),
    shortcut: ruta('/favicon.ico'),
    apple: ruta('/apple-touch-icon.png'),
  },
}

export const dynamic = 'force-dynamic'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  // Una cuenta que no ha aceptado la versión vigente del aviso ve el aviso en
  // lugar de lo que pidió, sea la página que sea (D-292). Aquí y no en cada
  // página porque esta plantilla envuelve a todas, el panel incluido: la
  // guardia que vive en un solo sitio no se puede olvidar en ninguno. Se mira
  // la cuenta real (`usuario`) y no la de la vista previa de rol, porque quien
  // acepta es la persona y no el papel que está mirando.
  const pideElAviso = sesion.activo && debeAceptarElAviso(sesion.usuario)
  const dentro = sesion.activo && !pideElAviso

  return (
    <html lang="es">
      <body>
        {dentro ? (
          <Navegacion
            nombre={sesion.usuario?.nombre as string | undefined}
            rolReal={sesion.rolReal ?? 'lector'}
            simulando={sesion.simulando}
          />
        ) : null}
        {dentro ? <AvisoActualizacion /> : null}
        {/* Sin latido mientras el aviso espera: el tiempo activo es uno de los
            datos que se piden consentir, y contarlo antes del «acepto» sería
            guardarlo sin permiso. */}
        {dentro ? <LatidoDeActividad /> : null}
        {/* Los diálogos de confirmación y los avisos flotantes, para el sitio y
            el panel: los dos se montan dentro de este mismo layout. */}
        <ProveedoresDeUI>
          {pideElAviso ? (
            <PantallaDelAviso nombre={sesion.usuario?.nombre as string | undefined} />
          ) : (
            children
          )}
        </ProveedoresDeUI>
        {/* Fuera de la condición de la sesión a propósito: lo necesita sobre
            todo quien no puede entrar. En el panel lo esconde la hoja. */}
        <PieDePagina />
      </body>
    </html>
  )
}
