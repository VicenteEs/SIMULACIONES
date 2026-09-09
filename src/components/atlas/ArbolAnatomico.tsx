'use client'

import { useMemo, useState } from 'react'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { armarArbol, buscarPiezas } from '@/atlas/catalogo'

/**
 * Navegación de las 2.234 piezas del atlas.
 *
 * Es la pieza que decide si el taller se puede usar. Apagar dos mil doscientas
 * treinta estructuras de una en una con el ratón no es un flujo: lo que hace
 * falta es poder decir «solo esto» sobre una rama y que el resto desaparezca.
 * De ahí que cada grupo y cada pieza tengan ese botón.
 *
 * Se puede mirar por **región** —cómo se opera— o por **sistema** —cómo se
 * estudia—. Son los dos ejes con los que un traumatólogo busca, y ninguno
 * sustituye al otro.
 */

export function ArbolAnatomico({
  catalogo,
  visibles,
  alCambiarVisibles,
  resaltada,
  alResaltar,
}: {
  catalogo: CatalogoDelAtlas
  visibles: Set<string>
  alCambiarVisibles: (nuevas: Set<string>) => void
  resaltada: string | null
  alResaltar: (id: string | null) => void
}) {
  const [eje, setEje] = useState<'region' | 'sistema'>('region')
  const [consulta, setConsulta] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const arbol = useMemo(() => armarArbol(catalogo, eje), [catalogo, eje])
  const resultados = useMemo(
    () => (consulta.trim().length >= 2 ? buscarPiezas(catalogo, consulta) : []),
    [catalogo, consulta],
  )

  const todas = useMemo(() => catalogo.piezas.map((p) => p.id), [catalogo])

  // --- operaciones sobre la selección --------------------------------------
  const encender = (ids: string[]) => {
    const nuevas = new Set(visibles)
    for (const id of ids) nuevas.add(id)
    alCambiarVisibles(nuevas)
  }

  const apagar = (ids: string[]) => {
    const nuevas = new Set(visibles)
    for (const id of ids) nuevas.delete(id)
    alCambiarVisibles(nuevas)
  }

  /** Deja encendido únicamente esto. Es el gesto central del taller. */
  const soloEsto = (ids: string[]) => alCambiarVisibles(new Set(ids))

  const alternarGrupo = (id: string) => {
    const nuevos = new Set(abiertos)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    setAbiertos(nuevos)
  }

  return (
    <div className="atlas-arbol">
      <div className="atlas-arbol-cabecera">
        <input
          className="atlas-busqueda"
          placeholder="Buscar: tibia derecha, fémur, arteria…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
        />
        <div className="atlas-ejes">
          <button
            type="button"
            className={eje === 'region' ? 'activo' : ''}
            onClick={() => setEje('region')}
          >
            Por región
          </button>
          <button
            type="button"
            className={eje === 'sistema' ? 'activo' : ''}
            onClick={() => setEje('sistema')}
          >
            Por sistema
          </button>
        </div>
        <div className="atlas-globales">
          <button type="button" onClick={() => alCambiarVisibles(new Set(todas))}>
            Encender todo
          </button>
          <button type="button" onClick={() => alCambiarVisibles(new Set())}>
            Apagar todo
          </button>
          <span className="atlas-conteo">
            {visibles.size} de {todas.length}
          </span>
        </div>
      </div>

      <div className="atlas-lista">
        {consulta.trim().length >= 2 ? (
          <ResultadosDeBusqueda
            resultados={resultados}
            visibles={visibles}
            resaltada={resaltada}
            alResaltar={alResaltar}
            alEncender={(id) => encender([id])}
            alApagar={(id) => apagar([id])}
            alSoloEsto={(id) => soloEsto([id])}
          />
        ) : (
          arbol.map((grupo) => {
            const idsGrupo = grupo.ramas.flatMap((r) => r.piezas.map((p) => p.id))
            const encendidas = idsGrupo.filter((id) => visibles.has(id)).length
            const abierto = abiertos.has(grupo.id)

            return (
              <div className="atlas-grupo" key={grupo.id}>
                <div className="atlas-grupo-fila">
                  <button
                    type="button"
                    className="atlas-plegar"
                    onClick={() => alternarGrupo(grupo.id)}
                    aria-expanded={abierto}
                  >
                    {abierto ? '▾' : '▸'}
                  </button>

                  <label className="atlas-casilla">
                    <input
                      type="checkbox"
                      checked={encendidas === idsGrupo.length && idsGrupo.length > 0}
                      ref={(el) => {
                        // Estado intermedio: el grupo tiene parte encendida.
                        if (el) el.indeterminate = encendidas > 0 && encendidas < idsGrupo.length
                      }}
                      onChange={() =>
                        encendidas === idsGrupo.length ? apagar(idsGrupo) : encender(idsGrupo)
                      }
                    />
                    {grupo.color ? (
                      <span className="atlas-color" style={{ background: grupo.color }} />
                    ) : null}
                    <span className="atlas-grupo-nombre">{grupo.nombre}</span>
                  </label>

                  <span className="atlas-grupo-conteo">
                    {encendidas}/{grupo.total}
                  </span>
                  <button
                    type="button"
                    className="atlas-solo"
                    title={`Dejar visible solo ${grupo.nombre.toLowerCase()}`}
                    onClick={() => soloEsto(idsGrupo)}
                  >
                    solo
                  </button>
                </div>

                {abierto
                  ? grupo.ramas.map((rama) => {
                      const ids = rama.piezas.map((p) => p.id)
                      const vivas = ids.filter((id) => visibles.has(id)).length
                      return (
                        <div className="atlas-rama" key={`${grupo.id}-${rama.id}`}>
                          <div className="atlas-rama-fila">
                            <label className="atlas-casilla">
                              <input
                                type="checkbox"
                                checked={vivas === ids.length && ids.length > 0}
                                ref={(el) => {
                                  if (el) el.indeterminate = vivas > 0 && vivas < ids.length
                                }}
                                onChange={() => (vivas === ids.length ? apagar(ids) : encender(ids))}
                              />
                              <span>{rama.nombre}</span>
                            </label>
                            <span className="atlas-rama-conteo">
                              {vivas}/{ids.length}
                            </span>
                            <button
                              type="button"
                              className="atlas-solo"
                              onClick={() => soloEsto(ids)}
                            >
                              solo
                            </button>
                          </div>

                          <ul className="atlas-piezas">
                            {rama.piezas.map((pieza) => (
                              <FilaDePieza
                                key={pieza.id}
                                pieza={pieza}
                                encendida={visibles.has(pieza.id)}
                                resaltada={resaltada === pieza.id}
                                alResaltar={alResaltar}
                                alAlternar={() =>
                                  visibles.has(pieza.id) ? apagar([pieza.id]) : encender([pieza.id])
                                }
                                alSoloEsto={() => soloEsto([pieza.id])}
                              />
                            ))}
                          </ul>
                        </div>
                      )
                    })
                  : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function FilaDePieza({
  pieza,
  encendida,
  resaltada,
  alResaltar,
  alAlternar,
  alSoloEsto,
}: {
  pieza: PiezaDelAtlas
  encendida: boolean
  resaltada: boolean
  alResaltar: (id: string | null) => void
  alAlternar: () => void
  alSoloEsto: () => void
}) {
  return (
    <li
      className={`atlas-pieza${resaltada ? ' atlas-pieza-resaltada' : ''}`}
      onMouseEnter={() => alResaltar(pieza.id)}
      onMouseLeave={() => alResaltar(null)}
    >
      <label className="atlas-casilla">
        <input type="checkbox" checked={encendida} onChange={alAlternar} />
        <span title={`${pieza.nombre} · ${pieza.fma}`}>{pieza.nombre}</span>
      </label>
      {/* La región deducida de la posición se marca: es una estimación y no un
          dato del atlas, y quien prepara una ficha merece saberlo. */}
      {pieza.origenRegion === 'caja' ? (
        <span className="atlas-estimada" title="Región deducida de su posición, no del atlas">
          ~
        </span>
      ) : null}
      <button type="button" className="atlas-solo" onClick={alSoloEsto}>
        solo
      </button>
    </li>
  )
}

function ResultadosDeBusqueda({
  resultados,
  visibles,
  resaltada,
  alResaltar,
  alEncender,
  alApagar,
  alSoloEsto,
}: {
  resultados: { pieza: PiezaDelAtlas }[]
  visibles: Set<string>
  resaltada: string | null
  alResaltar: (id: string | null) => void
  alEncender: (id: string) => void
  alApagar: (id: string) => void
  alSoloEsto: (id: string) => void
}) {
  if (resultados.length === 0) {
    return <p className="atlas-vacio">Ninguna estructura coincide.</p>
  }

  return (
    <>
      <p className="atlas-vacio">
        {resultados.length} coincidencia{resultados.length === 1 ? '' : 's'}
      </p>
      <ul className="atlas-piezas atlas-piezas-sueltas">
        {resultados.map(({ pieza }) => (
          <FilaDePieza
            key={pieza.id}
            pieza={pieza}
            encendida={visibles.has(pieza.id)}
            resaltada={resaltada === pieza.id}
            alResaltar={alResaltar}
            alAlternar={() => (visibles.has(pieza.id) ? alApagar(pieza.id) : alEncender(pieza.id))}
            alSoloEsto={() => alSoloEsto(pieza.id)}
          />
        ))}
      </ul>
    </>
  )
}
