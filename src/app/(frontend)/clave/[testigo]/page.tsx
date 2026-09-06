import type { Metadata } from 'next'
import { FormularioClaveNueva } from './FormularioClaveNueva'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Elegir contraseña · Plataforma docente de traumatología',
  robots: { index: false, follow: false },
}

/**
 * Pantalla de contraseña nueva.
 *
 * El testigo llega en la ruta y no se comprueba aquí: comprobarlo antes de que
 * la persona escriba nada obligaría a gastarlo para saber si vale. Se valida al
 * enviar, que es cuando importa.
 */
export default async function PaginaClaveNueva({
  params,
}: {
  params: Promise<{ testigo: string }>
}) {
  const { testigo } = await params

  return (
    <main className="acceso">
      <div className="acceso-caja">
        <div className="acceso-marca">
          <img src="/logo.png" alt="TraumaHub" className="acceso-logo" />
        </div>
        <h1 className="acceso-titulo">Elija su contraseña</h1>

        <FormularioClaveNueva testigo={testigo} />

        <p className="acceso-nota">
          Mínimo doce caracteres. Una frase con varias palabras es más segura y más fácil de
          recordar que una palabra con símbolos.
        </p>
      </div>
    </main>
  )
}
