import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Minigrafico } from '@/components/admin/Graficos'
import { cifra } from '@/lib/graficos'

export type TonoDeCifra = 'ok' | 'atencion' | 'info'

/**
 * Cuánto cambió la cifra respecto del periodo anterior, para el chip «▲ +14 %».
 *
 * `buenoSiSube` decide el color y no la flecha: más lecturas es buena noticia,
 * más fichas en cola no lo es, y las dos suben con la misma flecha. Un chip
 * verde junto a una cola que crece se lee como «vamos bien».
 */
export interface Cambio {
  valor: number
  /** «%» para una variación relativa; vacío para una diferencia en unidades («+9»). */
  unidad?: '%' | ''
  buenoSiSube?: boolean
  /** «que los 7 días anteriores»: completa la frase que lee el lector de pantalla. */
  respecto: string
}

/**
 * La tarjeta de cifra de los tableros del panel: icono, rótulo, la cifra en
 * grande, a su lado hacia dónde va, y una nota que la explica (P-007 E5, D-238).
 *
 * Era `Indicador`, dentro del Resumen. Salió de ahí cuando las dieciséis
 * pestañas pasaron a abrir con su fila de cifras, como en Penpot: copiada en
 * cada una, la tarjeta ilegible habría vuelto a parecer un cero en alguna.
 *
 * Con `href`, el título es el enlace y su `::after` cubre la tarjeta entera
 * (`.kpi-enlace`): toda ella se pulsa, pero el nombre accesible es solo el del
 * rótulo. Sin `href` la tarjeta no finge ser pulsable: ni flecha ni sombra.
 *
 * `serie` dibuja el minigráfico. Solo se pasa cuando sale de datos que de
 * verdad se guardan por fecha; una línea inventada para que la tarjeta se
 * parezca al diseño es justo lo que P-007 prohíbe (decisión 6).
 */
export function Cifra({
  href,
  titulo,
  icono: Icono,
  tono,
  valor,
  nota,
  ilegible,
  claseValor,
  secundario,
  serie,
  descripcionDeLaSerie,
  cambio,
}: {
  href?: string
  titulo: string
  icono: LucideIcon
  tono: TonoDeCifra
  valor: ReactNode
  nota: ReactNode
  ilegible?: boolean
  claseValor?: string
  secundario?: ReactNode
  serie?: number[]
  /** «Lecturas por día, últimos 14 días»: lo que dice la línea, en palabras. */
  descripcionDeLaSerie?: string
  cambio?: Cambio | null
}) {
  const clases = ['admin-card', 'kpi', href ? 'admin-card-enlace' : null, ilegible ? 'admin-card-ilegible' : null]
  return (
    <div className={clases.filter(Boolean).join(' ')}>
      <div className="kpi-cabeza">
        <span className={`icono-modulo icono-modulo-sm kpi-icono-${tono}`} aria-hidden>
          <Icono size={16} />
        </span>
        {href ? (
          <Link href={href} className="admin-card-title kpi-enlace">
            {titulo}
          </Link>
        ) : (
          <span className="admin-card-title">{titulo}</span>
        )}
        {href ? <ArrowRight aria-hidden size={18} className="kpi-flecha" /> : null}
      </div>
      <div className="kpi-cuerpo">
        <div className={`admin-card-value${claseValor ? ` ${claseValor}` : ''}`}>{valor}</div>
        {!ilegible && cambio ? <ChipDeCambio cambio={cambio} /> : null}
        {!ilegible && serie && serie.length > 1 ? (
          <Minigrafico
            valores={serie}
            // Más angosto que el de serie: a 1280 px, con la cifra y su flecha,
            // el de 96 bajaba a la línea siguiente.
            ancho={80}
            color={tono === 'atencion' ? 'var(--ambar-texto)' : tono === 'ok' ? 'var(--verde)' : 'var(--marca)'}
            descripcion={descripcionDeLaSerie}
          />
        ) : null}
      </div>
      <p className="admin-card-note">{nota}</p>
      {secundario}
    </div>
  )
}

function ChipDeCambio({ cambio }: { cambio: Cambio }) {
  const { valor, unidad = '%', buenoSiSube = true, respecto } = cambio
  if (valor === 0) {
    return (
      <span className="kpi-cambio kpi-cambio-igual">
        <span aria-hidden>=</span>
        <span className="sr-only">Igual {respecto}</span>
      </span>
    )
  }
  const sube = valor > 0
  const bien = sube === buenoSiSube
  const texto = `${sube ? '+' : '−'}${cifra(Math.abs(valor))}${unidad ? ` ${unidad}` : ''}`
  return (
    <span className={`kpi-cambio ${bien ? 'kpi-cambio-bien' : 'kpi-cambio-mal'}`}>
      <span aria-hidden>
        {sube ? '▲' : '▼'} {texto}
      </span>
      <span className="sr-only">
        {sube ? 'Sube' : 'Baja'} {cifra(Math.abs(valor))}
        {unidad === '%' ? ' %' : ''} {respecto}
      </span>
    </span>
  )
}
