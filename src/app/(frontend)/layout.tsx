import type { Metadata } from 'next'
import React from 'react'
import { Navegacion } from '@/components/Navegacion'
import { AvisoActualizacion } from '@/components/AvisoActualizacion'
import { PieDePagina } from '@/components/PieDePagina'
import { LatidoDeActividad } from '@/components/LatidoDeActividad'
import { obtenerSesion } from '@/lib/sesion'
import { ProveedoresDeUI } from '@/components/ui/Proveedores'
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

  return (
    <html lang="es">
      <body>
        {sesion.activo ? (
          <Navegacion
            nombre={sesion.usuario?.nombre as string | undefined}
            rolReal={sesion.rolReal ?? 'lector'}
            simulando={sesion.simulando}
          />
        ) : null}
        {sesion.activo ? <AvisoActualizacion /> : null}
        {sesion.activo ? <LatidoDeActividad /> : null}
        {/* Los diálogos de confirmación y los avisos flotantes, para el sitio y
            el panel: los dos se montan dentro de este mismo layout. */}
        <ProveedoresDeUI>{children}</ProveedoresDeUI>
        {/* Fuera de la condición de la sesión a propósito: lo necesita sobre
            todo quien no puede entrar. En el panel lo esconde la hoja. */}
        <PieDePagina />
      </body>
    </html>
  )
}
