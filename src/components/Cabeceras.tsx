import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { InsigniaMantencion } from '@/components/ui/InsigniaMantencion'

/**
 * Las cabeceras de los cinco módulos: la del listado y la de cada ficha.
 *
 * Cada listado escribía la suya —un `<h1>` y una entradilla—, tres de ellos
 * sin miga, y ninguno decía en qué módulo se estaba más que con el título. Con
 * una sola pieza, la miga, el antetítulo con el icono y el color del módulo y
 * el título salen iguales en las diez pantallas, y el color sale de la clase
 * `mod-N` que `IDENTIDAD_DE_MODULO` asigna: ni la cabecera ni la página tienen
 * que saber cuál es.
 *
 * Son de servidor y sin estado: las monta tanto una página de servidor como el
 * listado filtrable de la biblioteca, que es de cliente.
 */

export type PasoDeMiga = { href?: string; texto: string }

/** La miga: «Inicio › Biblioteca › Rodilla». El último paso no es enlace. */
export function MigaDePan({ pasos }: { pasos: PasoDeMiga[] }) {
  return (
    <nav className="miga" aria-label="Miga de pan">
      {pasos.map((paso, i) => (
        <Fragment key={`${paso.texto}-${i}`}>
          {i > 0 ? <ChevronRight size={14} className="miga-separador" aria-hidden="true" /> : null}
          {paso.href ? (
            <Link href={paso.href}>{paso.texto}</Link>
          ) : (
            <span className="miga-actual" aria-current="page">
              {paso.texto}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

/** El antetítulo con el icono y el número del módulo, en su color. */
export function EyebrowDeModulo({ slug, children }: { slug: string; children?: ReactNode }) {
  const identidad = IDENTIDAD_DE_MODULO[slug]
  if (!identidad) return children ? <span className="eyebrow">{children}</span> : null
  const Icono = identidad.icono
  return (
    <span className="eyebrow-modulo">
      <span className="icono-modulo icono-modulo-sm" aria-hidden="true">
        <Icono size={15} strokeWidth={2} />
      </span>
      {children ?? `Módulo 0${identidad.numero}`}
    </span>
  )
}

/** Clase `mod-N` de un módulo, para el `<main>` que lo pinta. */
export function claseDeModulo(slug: string): string {
  return IDENTIDAD_DE_MODULO[slug]?.clase ?? ''
}

/**
 * Cabecera de un listado: miga, antetítulo del módulo, título y entradilla.
 * `acciones` es el hueco de la derecha —el «Nueva ficha» de quien escribe—.
 */
export function CabeceraDeModulo({
  slug,
  titulo,
  entradilla,
  acciones,
  enMantencion = false,
}: {
  slug: string
  titulo: string
  entradilla?: ReactNode
  acciones?: ReactNode
  /** El módulo está en mantención y quien lo mira puede verlo: se le avisa (D-156). */
  enMantencion?: boolean
}) {
  return (
    <header className="cabecera-modulo">
      <MigaDePan pasos={[{ href: '/', texto: 'Inicio' }, { texto: titulo }]} />
      <div className="cabecera-modulo-fila">
        <div>
          <EyebrowDeModulo slug={slug} />
          <h1>{titulo}</h1>
          {enMantencion ? <InsigniaMantencion /> : null}
          {entradilla ? <p className="entrada">{entradilla}</p> : null}
        </div>
        {acciones}
      </div>
    </header>
  )
}
