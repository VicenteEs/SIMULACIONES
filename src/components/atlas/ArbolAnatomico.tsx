'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { armarArbol } from '@/atlas/catalogo'
import {
  buscarEnEspanol,
  ordenarArbolEnEspanol,
  type BusquedaEnEspanol,
} from '@/atlas/arbolEnEspanol'
import { nombreEnEspanol, tieneTraduccion } from '@/atlas/nombres'

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
 *
 * Las estructuras se enseñan en español, con el nombre original en el título
 * de la fila, y se ordenan y se buscan por lo que se ve: ver
 * `src/atlas/arbolEnEspanol.ts`. El catálogo que llega ya trae los sistemas
 * corregidos (`cargarCatalogo`), así que «Por sistema» mete los peroneos en
 * músculos sin que este archivo tenga que saberlo.
 */

export function ArbolAnatomico({
  catalogo,
  visibles,
  alCambiarVisibles,
  resaltada,
  alResaltar,
  seleccion = null,
  alSeleccionar,
}: {
  catalogo: CatalogoDelAtlas
  visibles: Set<string>
  alCambiarVisibles: (nuevas: Set<string>) => void
  resaltada: string | null
  alResaltar: (id: string | null) => void
  /**
   * Piezas seleccionadas en el visor, para marcarlas aquí también (D-132): el
   * árbol y el lienzo enseñan la misma selección, como el Outliner de Blender.
   */
  seleccion?: ReadonlySet<string> | null
  /**
   * Si llega, pulsar el NOMBRE de una pieza la selecciona (con Mayús, la suma o
   * la quita) y la casilla sigue encendiendo y apagando. Tiene que llegar
   * estable entre pintados, como las demás: es prop de una fila memorizada.
   */
  alSeleccionar?: (id: string, sumar: boolean) => void
}) {
  const [eje, setEje] = useState<'region' | 'sistema'>('region')
  const [consulta, setConsulta] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  // Reordenado en español encima de `armarArbol`, que ordena por el nombre
  // original: sin esto el árbol enseña «Tibia derecha» colocada entre las «R»
  // de «Right…», que es donde estaría si se leyera en inglés.
  const arbol = useMemo(() => ordenarArbolEnEspanol(armarArbol(catalogo, eje)), [catalogo, eje])
  const busqueda = useMemo(
    () => (consulta.trim().length >= 2 ? buscarEnEspanol(catalogo, consulta) : null),
    [catalogo, consulta],
  )

  const todas = useMemo(() => catalogo.piezas.map((p) => p.id), [catalogo])

  /**
   * Los identificadores de cada grupo y de cada rama, con cuántos siguen
   * encendidos.
   *
   * Memorizado sobre `visibles` y no calculado al pintar porque recorre las
   * 2.234 piezas: al pasar el ratón por una fila cambia `resaltada` en el
   * taller, que repinta este árbol entero, y con ello se rehacían los quince
   * `flatMap` y sus recuentos en cada paso del ratón por la lista.
   *
   * Va indexado por posición y no por identificador para no tener que
   * defenderse de un `undefined` que no puede ocurrir: se construye del mismo
   * `arbol` que se recorre abajo, en el mismo pintado.
   */
  const cuentas = useMemo(
    () =>
      arbol.map((grupo) => {
        const ramas = grupo.ramas.map((rama) => {
          const ids = rama.piezas.map((p) => p.id)
          let encendidas = 0
          for (const id of ids) if (visibles.has(id)) encendidas += 1
          return { ids, encendidas }
        })
        const ids: string[] = []
        let encendidas = 0
        for (const rama of ramas) {
          for (const id of rama.ids) ids.push(id)
          encendidas += rama.encendidas
        }
        return { ids, encendidas, ramas }
      }),
    [arbol, visibles],
  )

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

  /**
   * Las dos operaciones de una sola pieza, estables entre pintados.
   *
   * Son props de `FilaDePieza`, que va memorizada: una función nueva en cada
   * pintado la desmemorizaría entera y el `memo` no serviría de nada. Por eso
   * reciben el identificador como argumento en vez de venir ya cerradas sobre
   * él, que es como estaban.
   *
   * `alternarPieza` depende de `visibles`, así que cambia cuando cambia la
   * selección —y entonces las filas tienen que repintarse igualmente, porque su
   * casilla cambia—, pero no cuando lo único que cambia es el resaltado.
   */
  const alternarPieza = useCallback(
    (id: string) => {
      const nuevas = new Set(visibles)
      if (nuevas.has(id)) nuevas.delete(id)
      else nuevas.add(id)
      alCambiarVisibles(nuevas)
    },
    [visibles, alCambiarVisibles],
  )

  const soloEstaPieza = useCallback(
    (id: string) => alCambiarVisibles(new Set([id])),
    [alCambiarVisibles],
  )

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
          placeholder="Buscar en español o en inglés: peroné, fibula…"
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
        {busqueda ? (
          <ResultadosDeBusqueda
            busqueda={busqueda}
            visibles={visibles}
            resaltada={resaltada}
            alResaltar={alResaltar}
            alAlternar={alternarPieza}
            alSoloEsto={soloEstaPieza}
            seleccion={seleccion}
            alSeleccionar={alSeleccionar}
          />
        ) : (
          arbol.map((grupo, posicionGrupo) => {
            const { ids: idsGrupo, encendidas } = cuentas[posicionGrupo]
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
                  ? grupo.ramas.map((rama, posicionRama) => {
                      const { ids, encendidas: vivas } =
                        cuentas[posicionGrupo].ramas[posicionRama]
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
                                seleccionada={seleccion?.has(pieza.id) ?? false}
                                alResaltar={alResaltar}
                                alAlternar={alternarPieza}
                                alSoloEsto={soloEstaPieza}
                                alSeleccionar={alSeleccionar}
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

/**
 * Una pieza del árbol.
 *
 * Memorizada, y no por afición: aquí hay hasta 2.234 de estas, y el ratón
 * pasando por la lista cambia `resaltada` en el taller, que repinta el árbol
 * entero. Sin `memo`, cruzar una fila rehacía todas las demás —con su casilla,
 * su título y su botón—, y el árbol se arrastraba justo durante el gesto que
 * más se repite al preparar una pieza.
 *
 * Para que el `memo` sirva de algo, las tres devoluciones de llamada tienen que
 * llegar estables desde arriba: de ahí que reciban el identificador como
 * argumento en lugar de venir cerradas sobre él, que es lo que las hacía nuevas
 * en cada pintado. Quien las cierre de vuelta no romperá nada visible, solo
 * volverá a dejar el árbol lento sin que nada lo diga.
 */
const FilaDePieza = memo(function FilaDePieza({
  pieza,
  encendida,
  resaltada,
  seleccionada = false,
  alResaltar,
  alAlternar,
  alSoloEsto,
  alSeleccionar,
}: {
  pieza: PiezaDelAtlas
  encendida: boolean
  resaltada: boolean
  seleccionada?: boolean
  alResaltar: (id: string | null) => void
  alAlternar: (id: string) => void
  alSoloEsto: (id: string) => void
  alSeleccionar?: (id: string, sumar: boolean) => void
}) {
  // El original va en el título y no en una segunda línea: la fila es de una
  // sola línea con puntos suspensivos, y en el ancho de la columna del taller
  // un segundo nombre al lado se comería el primero (ver `.atlas-casilla span`
  // en `admin.css`). En el título se lee al pasar el ratón, con el código FMA,
  // que es lo que hace falta para encontrar la pieza en la bibliografía.
  //
  // `lang="en"` en las que siguen sin traducción, para que un lector de
  // pantalla no lea «Right fibularis brevis» con fonética española. Mientras la
  // tabla se llena conviven las dos lenguas en la misma lista, y eso es
  // deliberado: mejor el original que una traducción inventada.
  const traducida = tieneTraduccion(pieza.nombre)
  return (
    <li
      className={`atlas-pieza${resaltada ? ' atlas-pieza-resaltada' : ''}${
        seleccionada ? ' atlas-pieza-seleccionada' : ''
      }`}
      onMouseEnter={() => alResaltar(pieza.id)}
      onMouseLeave={() => alResaltar(null)}
    >
      {alSeleccionar ? (
        // Con selección, la casilla y el nombre hacen cosas distintas y ya no
        // pueden compartir un `<label>`: pulsar el nombre encendería la pieza
        // además de seleccionarla. La casilla se nombra entonces por su cuenta.
        <span className="atlas-casilla">
          <input
            type="checkbox"
            checked={encendida}
            aria-label={`Encender ${nombreEnEspanol(pieza.nombre)}`}
            onChange={() => alAlternar(pieza.id)}
          />
          <button
            type="button"
            className="atlas-pieza-nombre"
            aria-pressed={seleccionada}
            // Una pieza apagada no se selecciona: no se ve, y lo que se hiciera
            // con ella sería a ciegas.
            disabled={!encendida}
            lang={traducida ? undefined : 'en'}
            title={`${pieza.nombre} · ${pieza.fma}`}
            onClick={(evento) => alSeleccionar(pieza.id, evento.shiftKey || evento.ctrlKey)}
          >
            {nombreEnEspanol(pieza.nombre)}
          </button>
        </span>
      ) : (
        <label className="atlas-casilla">
          <input type="checkbox" checked={encendida} onChange={() => alAlternar(pieza.id)} />
          <span lang={traducida ? undefined : 'en'} title={`${pieza.nombre} · ${pieza.fma}`}>
            {nombreEnEspanol(pieza.nombre)}
          </span>
        </label>
      )}
      {/* La región deducida de la posición se marca: es una estimación y no un
          dato del atlas, y quien prepara una ficha merece saberlo. */}
      {pieza.origenRegion === 'caja' ? (
        <span className="atlas-estimada" title="Región deducida de su posición, no del atlas">
          ~
        </span>
      ) : null}
      <button type="button" className="atlas-solo" onClick={() => alSoloEsto(pieza.id)}>
        solo
      </button>
    </li>
  )
})

function ResultadosDeBusqueda({
  busqueda,
  visibles,
  resaltada,
  alResaltar,
  alAlternar,
  alSoloEsto,
  seleccion,
  alSeleccionar,
}: {
  busqueda: BusquedaEnEspanol
  visibles: Set<string>
  resaltada: string | null
  alResaltar: (id: string | null) => void
  alAlternar: (id: string) => void
  alSoloEsto: (id: string) => void
  seleccion?: ReadonlySet<string> | null
  alSeleccionar?: (id: string, sumar: boolean) => void
}) {
  const { piezas, total } = busqueda
  if (total === 0) {
    return <p className="atlas-vacio">Ninguna estructura coincide.</p>
  }

  return (
    <>
      {/* Con tope se dice que hay tope. Antes ponía «60 coincidencias» cuando
          había doscientas, y quien no veía la suya creía que no existía. */}
      <p className="atlas-vacio">
        {piezas.length < total
          ? `Las ${piezas.length} más parecidas de ${total}: afine la búsqueda para ver el resto.`
          : `${total} coincidencia${total === 1 ? '' : 's'}`}
      </p>
      <ul className="atlas-piezas atlas-piezas-sueltas">
        {piezas.map((pieza) => (
          <FilaDePieza
            key={pieza.id}
            pieza={pieza}
            encendida={visibles.has(pieza.id)}
            resaltada={resaltada === pieza.id}
            seleccionada={seleccion?.has(pieza.id) ?? false}
            alResaltar={alResaltar}
            alAlternar={alAlternar}
            alSoloEsto={alSoloEsto}
            alSeleccionar={alSeleccionar}
          />
        ))}
      </ul>
    </>
  )
}
