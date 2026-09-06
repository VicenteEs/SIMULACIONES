import Link from 'next/link'
import { ConmutadorVista } from './ConmutadorVista'
import { BotonSalir } from './BotonSalir'
import { MenuMovil } from './MenuMovil'

const MODULOS = [
  { ruta: '/biblioteca', etiqueta: 'Biblioteca' },
  { ruta: '/examen-fisico', etiqueta: 'Examen físico' },
  { ruta: '/tecnica-ao', etiqueta: 'Técnica AO' },
  { ruta: '/simulador', etiqueta: 'Simulador' },
  { ruta: '/imagenes', etiqueta: 'Imágenes' },
]

/**
 * Barra superior de la plataforma.
 *
 * Dos navegaciones para el mismo destino: la fila de módulos en pantalla ancha
 * y un panel desplegable en el teléfono. Se pintan las dos y CSS decide cuál se
 * ve, en lugar de medir la ventana en JavaScript: así la primera pintada ya es
 * la correcta y no hay un salto cuando el componente descubre el tamaño.
 *
 * El enlace al panel lo ven administrador y editor, y lleva al panel propio:
 * la interfaz de Payload no se ofrece a nadie.
 */
export function Navegacion({
  nombre,
  rolReal,
  simulando,
}: {
  nombre?: string
  rolReal: string
  simulando: boolean
}) {
  const hayPanel = rolReal === 'admin' || rolReal === 'editor'

  return (
    <header className="barra">
      <div className="barra-interior">
        {/* La marca sola, no el logotipo completo: el archivo `logo.png` ya
            lleva el nombre escrito, y ponerlo al lado de un texto distinto
            deja dos nombres compitiendo en el mismo sitio. */}
        <Link href="/" className="marca">
          <img src="/icon.png" alt="" className="marca-logo" />
          <div>
            TraumaHub
            <span className="marca-sub">Plataforma docente</span>
          </div>
        </Link>

        <nav className="modulos" aria-label="Módulos">
          {MODULOS.map((m) => (
            <Link key={m.ruta} href={m.ruta}>
              {m.etiqueta}
            </Link>
          ))}
        </nav>

        <div className="barra-derecha">
          <ConmutadorVista rolReal={rolReal} simulando={simulando} />
          {hayPanel ? (
            <Link href="/admin-panel" className="enlace-nav">
              Panel
            </Link>
          ) : null}
          {nombre ? <span className="quien">{nombre}</span> : null}
          <BotonSalir />
        </div>

        <div className="barra-movil">
          <MenuMovil
            modulos={MODULOS}
            nombre={nombre}
            rolReal={rolReal}
            simulando={simulando}
            hayPanel={hayPanel}
          />
        </div>
      </div>
    </header>
  )
}
