import type { Metadata } from 'next'
import React from 'react'
import './estilos.css'

export const metadata: Metadata = {
  title: 'Plataforma docente de traumatología',
  description: 'Estudio, exploración física, técnica quirúrgica y lectura de imágenes.',
  // Acceso cerrado: la plataforma no debe indexarse (decisión D-020).
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
