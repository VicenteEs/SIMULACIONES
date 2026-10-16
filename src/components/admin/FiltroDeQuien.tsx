import Link from 'next/link'
import { OPCIONES_DE_QUIEN, type QuienLee } from '@/lib/seguimiento'

/**
 * Elige de quién son las lecturas que se cuentan: todos, solo residentes o solo el equipo (D-175).
 *
 * Son enlaces y no un formulario ni un estado de cliente: la elección va en la dirección (`?quien=`), de modo que se
 * puede copiar, volver atrás con ella y recargar sin perderla, y la página sigue siendo de servidor. El motivo del filtro
 * está en `src/lib/seguimiento.ts`: sin él, el equipo que prueba la plataforma contaba como si fuera un residente.
 *
 * `nota` dice cuántas lecturas hay de cada lado, para que quien elige sepa qué va a ver antes de pulsar.
 */
export function FiltroDeQuien({ actual, ruta, nota }: { actual: QuienLee; ruta: string; nota?: string }) {
  return (
    <div className="seguimiento-quien" role="group" aria-label="De quién son las lecturas">
      <span className="seguimiento-quien-rotulo">Lecturas de</span>
      <div className="seguimiento-quien-opciones">
        {OPCIONES_DE_QUIEN.map((opcion) => (
          <Link
            key={opcion.valor}
            href={opcion.valor === 'todos' ? ruta : `${ruta}?quien=${opcion.valor}`}
            className={`seguimiento-quien-opcion${opcion.valor === actual ? ' activa' : ''}`}
            aria-current={opcion.valor === actual ? 'true' : undefined}
            scroll={false}
          >
            {opcion.etiqueta}
          </Link>
        ))}
      </div>
      {nota ? <span className="seguimiento-quien-nota">{nota}</span> : null}
    </div>
  )
}
