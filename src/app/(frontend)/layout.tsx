import type { Metadata } from 'next'
import React from 'react'
import { Navegacion } from '@/components/Navegacion'
import { AvisoActualizacion } from '@/components/AvisoActualizacion'
import { obtenerSesion } from '@/lib/sesion'
import './estilos.css'

export const metadata: Metadata = {
  title: 'Plataforma docente de traumatología',
  description: 'Estudio, exploración física, técnica quirúrgica y lectura de imágenes.',
  // Acceso cerrado: la plataforma no debe indexarse (decisión D-020).
  robots: { index: false, follow: false },
}

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
        {children}
      </body>
    </html>
  )
}
