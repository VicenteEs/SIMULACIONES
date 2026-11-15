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
import { temaDeLaPlataforma } from '@/lib/temaDeLaPlataforma'
// La fuente va antes que las hojas propias: `--sans` la nombra primero.
import '@fontsource-variable/inter'
import './estilos.css'
import './ui.css'
import { ruta } from '@/lib/rutas'
import { AvisoDeServidorDePruebas } from '@/components/AvisoDeServidorDePruebas'
import { PREFIJO_DEL_TITULO, servidorDePruebas } from '@/lib/servidorDePruebas'

const TITULO = 'Plataforma docente de traumatología'

const METADATOS: Metadata = {
  title: TITULO,
  description: 'Estudio, exploración física, técnica quirúrgica y lectura de imágenes.',
  // Acceso cerrado: la plataforma no debe indexarse (decisión D-020).
  robots: { index: false, follow: false },
  icons: {
    icon: ruta('/icon.png'),
    shortcut: ruta('/favicon.ico'),
    apple: ruta('/apple-touch-icon.png'),
  },
}

/**
 * En el servidor de pruebas cada pestaña empieza por «[Pruebas]» (D-385): con
 * ved y `traumahub.cl` abiertos a la vez, la franja de la página no se ve desde
 * la barra de pestañas. Es una función y no la constante de antes porque la
 * variable se lee en cada petición, no al compilar.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!servidorDePruebas(process.env.SERVIDOR_DE_PRUEBAS)) return METADATOS
  return {
    ...METADATOS,
    // La plantilla vale para los títulos de las páginas hijas; `default`, para las que no ponen ninguno.
    title: { default: `${PREFIJO_DEL_TITULO} ${TITULO}`, template: `${PREFIJO_DEL_TITULO} %s` },
  }
}

export const dynamic = 'force-dynamic'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion()
  const pruebas = servidorDePruebas(process.env.SERVIDOR_DE_PRUEBAS)
  // Una cuenta que no ha aceptado la versión vigente del aviso ve el aviso en
  // lugar de lo que pidió, sea la página que sea (D-292). Aquí y no en cada
  // página porque esta plantilla envuelve a todas, el panel incluido: la
  // guardia que vive en un solo sitio no se puede olvidar en ninguno. Se mira
  // la cuenta real (`usuario`) y no la de la vista previa de rol, porque quien
  // acepta es la persona y no el papel que está mirando.
  const pideElAviso = sesion.activo && debeAceptarElAviso(sesion.usuario)
  const dentro = sesion.activo && !pideElAviso
  // La paleta del simulador (P-014 E7), en `<body>` y en ningún otro sitio. La consola aparece en tres lugares
  // —la página del caso, su silueta de carga y el editor del caso, dentro del panel— y de aquí cuelgan los
  // tres. Antes iba en el `<main>` de la página y en el contorno del panel, y la silueta, que no puede preguntar
  // nada, salía con la paleta original un instante antes de cada caso: marino, y luego blanco. Con dos sitios,
  // además, podían no decir lo mismo. No lanza nunca: sin base, la de fábrica.
  const tema = await temaDeLaPlataforma()

  return (
    <html lang="es">
      <body data-tema={tema}>
        {/* Lo primero de la página, también antes de entrar y con el aviso de
            privacidad delante: es en `/entrar` donde se decide en qué servidor
            se va a trabajar. */}
        {pruebas ? <AvisoDeServidorDePruebas produccion={pruebas.produccion} /> : null}
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
