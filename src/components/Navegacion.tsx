import Link from 'next/link'
import { ConmutadorVista } from './ConmutadorVista'

const MODULOS = [
  { ruta: '/biblioteca', etiqueta: 'Biblioteca' },
  { ruta: '/examen-fisico', etiqueta: 'Examen físico' },
  { ruta: '/tecnica-ao', etiqueta: 'Técnica AO' },
  { ruta: '/simulador', etiqueta: 'Simulador' },
  { ruta: '/imagenes', etiqueta: 'Imágenes' },
]

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
        <Link href="/" className="marca">
          Traumatología
          <span className="marca-sub">Plataforma docente</span>
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
          {rolReal !== 'lector' ? (
            <a href="/admin" className="enlace-nav">
              Panel
            </a>
          ) : null}
          {nombre ? <span className="quien">{nombre}</span> : null}
        </div>
      </div>
    </header>
  )
}
