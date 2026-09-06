import Link from 'next/link'
import { ConmutadorVista } from './ConmutadorVista'
import { BotonSalir } from './BotonSalir'

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
 * El enlace al panel lo ven administrador y editor, y en ambos casos lleva al
 * panel propio: la interfaz de Payload no se ofrece a nadie.
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
        <nav className="modulos">
          {MODULOS.map((m) => (
            <Link key={m.ruta} href={m.ruta}>
              {m.etiqueta}
            </Link>
          ))}
        </nav>
        <div className="barra-derecha">
          <ConmutadorVista rolReal={rolReal} simulando={simulando} />
          {rolReal === 'admin' || rolReal === 'editor' ? (
            <Link href="/admin-panel" className="enlace-nav">
              Panel
            </Link>
          ) : null}
          {nombre ? <span className="quien">{nombre}</span> : null}
          <BotonSalir />
        </div>
      </div>
    </header>
  )
}
