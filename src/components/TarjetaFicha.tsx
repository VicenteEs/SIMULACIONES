import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleCheck } from 'lucide-react'

/**
 * La tarjeta de una ficha en los listados y en «Continúa leyendo».
 *
 * Había cinco copias del mismo marcado —una por listado, más las dos de la
 * portada— y cada una enseñaba una cosa: el subtítulo solo en la biblioteca,
 * la marca de borrador en tres de cinco, ninguna decía si ya se había leído.
 * Con una sola tarjeta, lo que existe en los datos se ve en todas igual.
 *
 * Sin estado ni efectos a propósito: la monta el listado filtrable de la
 * biblioteca, que es de cliente, y las páginas de servidor de los otros
 * módulos. El color lo hereda de la clase `mod-N` de quien la contiene.
 */
export function TarjetaFicha({
  href,
  titulo,
  codigo,
  resumen,
  borrador,
  leida,
  insignias,
  accion = 'Abrir',
}: {
  href: string
  titulo: string
  codigo?: string | null
  resumen?: ReactNode
  borrador?: boolean
  leida?: boolean
  /** Insignias de más, delante del código: el módulo en «Continúa leyendo». */
  insignias?: ReactNode
  accion?: string
}) {
  const hayEtiquetas = Boolean(insignias || codigo || borrador)
  return (
    <Link href={href} className="tarjeta-ficha">
      {hayEtiquetas ? (
        <div className="etiquetas">
          {insignias}
          {codigo ? <span className="codigo">{codigo}</span> : null}
          {borrador ? <span className="borrador">Borrador</span> : null}
        </div>
      ) : null}
      <h3>{titulo}</h3>
      {resumen ? <p>{resumen}</p> : null}
      <div className="tarjeta-ficha-pie">
        <span className="tarjeta-ficha-accion">
          {accion}
          <ArrowRight size={15} aria-hidden="true" />
        </span>
        {leida ? (
          <span className="insignia insignia-ok">
            <CircleCheck size={13} aria-hidden="true" />
            Leída
          </span>
        ) : null}
      </div>
    </Link>
  )
}
