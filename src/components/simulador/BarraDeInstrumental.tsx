'use client'

import { Fragment, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Hand, Search, X } from 'lucide-react'
import { IconoInstrumento } from './IconoInstrumento'
import type { InstrumentoDeBandeja } from './ConsolaQuirurgica'
import { finDeLaFila, ICONO_DE_LA_FAMILIA, ROTULO_DE_LA_FAMILIA } from '@/lib/barraDeInstrumental'

/** Lo que la mesa enseña de un instrumento fuera de su lista —en la mano, el siguiente, los recientes—: nombre y dibujo. */
export type InstrumentoDeLaMesa = Pick<InstrumentoDeBandeja, 'id' | 'nombre' | 'icono'>

/** Un sitio de la mesa de Mayo (P-012 E5): el instrumento, la tecla que lo coge y si es el de la mano. */
export type SitioDeLaMesa = InstrumentoDeLaMesa & { tecla: number; enLaMano: boolean }

/** Una familia de la mesa: cuántos instrumentos tiene en la bandeja y cuáles deja ver el buscador. */
export interface FamiliaDeLaMesa {
  clave: string
  titulo: string
  total: number
  /** Los que coinciden con lo escrito en el buscador; sin nada escrito, todos. */
  instrumentos: InstrumentoDeBandeja[]
}

/**
 * La mesa de instrumental, en la columna izquierda (P-008 E6): lo que hay en la mano, los últimos usados, el buscador y
 * un cuadro con dibujo por familia. Al pinchar un cuadro se despliega su lista debajo de su fila; al coger un
 * instrumento, la lista se cierra.
 *
 * Las filas de la lista las pinta la consola (`lista`): llevan las marcas que solo ella conoce —«siguiente», «para esta
 * placa», las del editor—, los tornillos partidos por tipo y la placa a medida. Aquí se decide dónde y cuándo se ven.
 */
export function BarraDeInstrumental({
  accion,
  familias,
  total,
  abierta,
  alAbrir,
  busqueda,
  alBuscar,
  enLaMano,
  familiaEnLaMano,
  siguiente,
  recientes,
  alCoger,
  alSoltar,
  lista,
  pie,
  vacia,
}: {
  /** Lo que va junto al título: en la consola del residente, «Plegar la mesa» (P-012 E5). */
  accion?: ReactNode
  familias: FamiliaDeLaMesa[]
  total: number
  /** La familia desplegada. */
  abierta: string | null
  alAbrir: (clave: string | null) => void
  busqueda: string
  alBuscar: (texto: string) => void
  enLaMano: InstrumentoDeLaMesa | null
  familiaEnLaMano: string | null
  /** El que toca después en la secuencia brocar · medir · atornillar, si no es el de la mano. */
  siguiente: InstrumentoDeLaMesa | null
  /** Los sitios ocupados de la mesa de Mayo, en el orden de sus teclas (P-012 E5). */
  recientes: SitioDeLaMesa[]
  alCoger: (id: string) => void
  alSoltar: () => void
  lista: (familia: FamiliaDeLaMesa) => ReactNode
  /** Lo del editor, debajo de la mesa: qué ve el residente y añadir a la bandeja. */
  pie?: ReactNode
  /** Lo que se dice con la bandeja vacía. */
  vacia?: ReactNode
}) {
  const base = useId()
  const idDeLaLista = `${base}-lista`
  const cuadros = useRef<Record<string, HTMLButtonElement | null>>({})
  const buscando = busqueda.trim() !== ''
  const encontradas = familias.filter((f) => f.instrumentos.length > 0)
  const indiceAbierta = buscando ? -1 : familias.findIndex((f) => f.clave === abierta)
  const desplegada = indiceAbierta >= 0 ? familias[indiceAbierta] : null
  const tras = desplegada ? finDeLaFila(indiceAbierta, familias.length) : -1

  const cerrar = () => {
    const clave = abierta
    alAbrir(null)
    if (clave) cuadros.current[clave]?.focus()
  }

  // Esc cierra la lista y devuelve el foco a su cuadro, como cualquier desplegable. Dentro del buscador, Esc ya lo
  // vacía el propio navegador y no se toca.
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !desplegada || (e.target instanceof HTMLInputElement && e.target.type === 'search')) return
    e.preventDefault()
    cerrar()
  }

  const listaDe = (f: FamiliaDeLaMesa) => (
    <div className="barra-instrumental-lista" id={idDeLaLista} role="region" aria-label={f.titulo}>
      <div className="barra-instrumental-lista-cabecera">
        <IconoInstrumento nombre={ICONO_DE_LA_FAMILIA[f.clave] ?? 'generico'} />
        <span className="barra-instrumental-lista-titulo">{f.titulo}</span>
        <button type="button" className="barra-instrumental-cerrar" aria-label={`Cerrar ${f.titulo}`} title="Cerrar (Esc)" onClick={cerrar}>
          <X size={14} aria-hidden />
        </button>
      </div>
      {lista(f)}
    </div>
  )

  return (
    <div className="consola-bandeja-bloque barra-instrumental" onKeyDown={alTeclear}>
      {/* «Mesa de instrumental» en todas partes (P-012 E5): eran «Instrumental» aquí, «la bandeja» en los avisos y «la mesa»
          a secas también para la de modelado, y el residente no sabía si eran tres sitios. */}
      <div className="barra-instrumental-cabecera">
        <h3 className="consola-subtitulo">Mesa de instrumental · {total}</h3>
        {accion}
      </div>

      {/* Lo primero que se mira: qué hay en la mano. Grande, con su dibujo, y con «Soltar» a un clic; antes solo se sabía
          por un borde naranja en una fila de la bandeja, que con la familia cerrada ni se veía. */}
      <div className={`barra-instrumental-mano${enLaMano ? ' con-instrumento' : ''}`} aria-live="polite">
        <span className="barra-instrumental-mano-icono" aria-hidden>
          {enLaMano ? <IconoInstrumento nombre={enLaMano.icono} /> : <Hand size={18} />}
        </span>
        <span className="barra-instrumental-mano-texto">
          <span className="consola-rotulo">En la mano</span>
          {enLaMano ? <strong>{enLaMano.nombre}</strong> : <span>Nada: elija un instrumento de la mesa.</span>}
        </span>
        {enLaMano ? (
          <button type="button" className="barra-instrumental-soltar" onClick={alSoltar} title="Dejarlo en la mesa">
            Soltar
          </button>
        ) : null}
      </div>

      {siguiente ? (
        <button
          type="button"
          className="barra-instrumental-siguiente"
          onClick={() => alCoger(siguiente.id)}
          title="Lo que sigue en la secuencia brocar · medir · atornillar"
        >
          <IconoInstrumento nombre={siguiente.icono} />
          <span>
            <span className="barra-instrumental-siguiente-rotulo">Siguiente</span> {siguiente.nombre}
          </span>
        </button>
      ) : null}

      {/* La mesa de Mayo (P-012 E5): cada instrumento en el sitio de su tecla, también el de la mano, para que el orden no
          cambie al coger. Antes eran «los recientes», el último primero y sin el de la mano: la lista se reordenaba con
          cada instrumento y el número de las teclas con ella. */}
      {recientes.length > 0 ? (
        <div className="barra-instrumental-recientes">
          <p className="consola-rotulo">Mesa de Mayo · teclas 1 a 5</p>
          <ul>
            {recientes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`barra-instrumental-reciente${r.enLaMano ? ' en-la-mano' : ''}`}
                  title={`${r.nombre} · tecla ${r.tecla}`}
                  aria-label={`${r.nombre}, tecla ${r.tecla}${r.enLaMano ? ', en la mano' : ''}`}
                  aria-pressed={r.enLaMano}
                  onClick={() => alCoger(r.id)}
                >
                  <span className="barra-instrumental-tecla u-num" aria-hidden>
                    {r.tecla}
                  </span>
                  <IconoInstrumento nombre={r.icono} />
                  <span>{r.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Siempre con buscador: con la mesa completa son más de ochenta instrumentos. Por palabras y sin tildes; con uno
          solo que coincida, Enter lo coge («farab» y Enter, y el Farabeuf está en la mano). */}
      <label className="consola-busqueda-envoltorio">
        <Search size={14} aria-hidden />
        <input
          type="search"
          className="consola-busqueda"
          placeholder="Buscar un instrumento…"
          aria-label="Buscar un instrumento"
          value={busqueda}
          onChange={(e) => alBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const todos = encontradas.flatMap((f) => f.instrumentos)
            if (todos.length !== 1) return
            e.preventDefault()
            alCoger(todos[0].id)
          }}
        />
      </label>

      {vacia}

      {familias.length > 0 ? (
        <div className="barra-instrumental-familias" role="group" aria-label="Familias de instrumental">
          {familias.map((f, i) => {
            const cuenta = buscando ? f.instrumentos.length : f.total
            const esLaAbierta = desplegada?.clave === f.clave
            return (
              <Fragment key={f.clave}>
                <button
                  type="button"
                  ref={(b) => {
                    cuadros.current[f.clave] = b
                  }}
                  className={`barra-instrumental-familia${esLaAbierta ? ' abierta' : ''}${f.clave === familiaEnLaMano ? ' con-mano' : ''}`}
                  aria-expanded={esLaAbierta}
                  aria-controls={esLaAbierta ? idDeLaLista : undefined}
                  aria-label={`${f.titulo}: ${cuenta} ${cuenta === 1 ? 'instrumento' : 'instrumentos'}${f.clave === familiaEnLaMano ? ', tiene el de la mano' : ''}`}
                  title={f.titulo}
                  disabled={buscando && cuenta === 0}
                  onClick={() => alAbrir(esLaAbierta ? null : f.clave)}
                >
                  <IconoInstrumento nombre={ICONO_DE_LA_FAMILIA[f.clave] ?? 'generico'} />
                  <span className="barra-instrumental-familia-rotulo">{ROTULO_DE_LA_FAMILIA[f.clave] ?? f.titulo}</span>
                  <span className="barra-instrumental-familia-cuenta u-num" aria-hidden>
                    {cuenta}
                  </span>
                </button>
                {i === tras && desplegada ? listaDe(desplegada) : null}
              </Fragment>
            )
          })}
        </div>
      ) : null}

      {/* Con algo escrito, las listas de todas las familias que tienen coincidencias, una tras otra: buscar es saltarse el
          recorrido por la mesa. */}
      {buscando ? (
        encontradas.length > 0 ? (
          <div className="barra-instrumental-resultados">
            {encontradas.map((f) => (
              <section key={f.clave} className="barra-instrumental-resultado" aria-label={f.titulo}>
                <h4 className="barra-instrumental-resultado-familia">
                  <IconoInstrumento nombre={ICONO_DE_LA_FAMILIA[f.clave] ?? 'generico'} /> {f.titulo}
                </h4>
                {lista(f)}
              </section>
            ))}
          </div>
        ) : (
          <p className="consola-vacio">Ningún instrumento coincide con la búsqueda.</p>
        )
      ) : null}

      {pie}
    </div>
  )
}
