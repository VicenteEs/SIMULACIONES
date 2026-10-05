'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import { armarArbol } from '@/atlas/catalogo'
import { catalogoDeLoQueQuedo } from '@/atlas/loQueQuedo'
import {
  buscarEnEspanol,
  ordenarArbolEnEspanol,
  type BusquedaEnEspanol,
} from '@/atlas/arbolEnEspanol'
import { nombreEnEspanol, tieneTraduccion } from '@/atlas/nombres'
import { nombreDeTrozo } from '@/atlas/formato'

/**
 * Lo que una fila necesita saber de los trozos de su pieza (D-141), en forma de
 * props que se comparan barato: la lista es la misma entre pintados mientras no
 * cambien los cortes, y lo apagado y lo seleccionado van como texto.
 */
interface TrozosDeLaFila {
  hojas?: readonly string[]
  apagadas?: string
  seleccionadas?: string
  alAlternarTrozo?: (id: string) => void
  alSoloTrozo?: (id: string) => void
}

const claveDe = (hojas: readonly string[] | undefined, conjunto: ReadonlySet<string> | null | undefined) =>
  hojas && conjunto ? hojas.filter((hoja) => conjunto.has(hoja)).join(',') : ''

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
  alEncenderTodo,
  universo = null,
  alQuedarseCon,
  trozos = null,
  trozosApagados = null,
  trozosSeleccionados = null,
  alAlternarTrozo,
  alSoloTrozo,
}: {
  catalogo: CatalogoDelAtlas
  visibles: Set<string>
  alCambiarVisibles: (nuevas: Set<string>) => void
  /**
   * «Encender todo» de la cabecera. El taller lo da para encender también los
   * trozos apagados (D-141); sin él, enciende todas las piezas y deja los
   * trozos como estaban.
   */
  alEncenderTodo?: () => void
  /**
   * Las piezas con las que se está trabajando —lo que quedó tras recortar o
   * quedarse con «solo»—, **apagadas o no**. Con ellas se arma la lista: lo que
   * se apague sigue ahí para volver a encenderlo, y una casilla de grupo solo
   * mueve lo que hay dentro. `null`: el atlas entero (ver `src/atlas/loQueQuedo.ts`).
   */
  universo?: ReadonlySet<string> | null
  /**
   * Los botones «solo» no son un apagado más: son decidir con qué piezas se
   * trabaja. Si el taller lo da, los avisa por aquí para estrechar el
   * conjunto; sin él, hacen lo de siempre.
   */
  alQuedarseCon?: (ids: Set<string>) => void
  /**
   * Los trozos de cada pieza partida (D-141), que se enseñan debajo de ella
   * con su propia casilla: «Tibia derecha_1», «Tibia derecha_2». Solo las
   * piezas partidas tienen entrada.
   */
  trozos?: ReadonlyMap<string, readonly string[]> | null
  /** Trozos apagados de piezas encendidas. */
  trozosApagados?: ReadonlySet<string> | null
  /** La selección con los trozos dentro: `seleccion` trae solo piezas. */
  trozosSeleccionados?: ReadonlySet<string> | null
  alAlternarTrozo?: (id: string) => void
  alSoloTrozo?: (id: string) => void
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
  /**
   * Qué lista se enseña: lo que quedó o el atlas entero.
   *
   * «Lo que quedó» es lo de entrada, y es lo que arregla el fallo de las casillas
   * de grupo: cada grupo actuaba sobre todas sus piezas del atlas, así que con
   * la mano sola, apagar un músculo y pulsar «Músculos» encendía los de todo el
   * cuerpo. Con la lista acotada al conjunto de trabajo, un grupo no tiene nada
   * fuera de él que encender (ver `src/atlas/loQueQuedo.ts`).
   *
   * «Todo el atlas» sigue ahí para lo contrario: traer una pieza que no está.
   * Solo tiene sentido cuando hay conjunto; sin él las dos listas son la misma
   * y el selector no se enseña.
   */
  const [modo, setModo] = useState<'quedo' | 'todo'>('quedo')

  // Reordenado en español encima de `armarArbol`, que ordena por el nombre
  // original: sin esto el árbol enseña «Tibia derecha» colocada entre las «R»
  // de «Right…», que es donde estaría si se leyera en inglés.
  //
  // El catálogo que se recorre es el reducido al conjunto de trabajo cuando se
  // mira «Lo que quedó»; sin conjunto es el mismo objeto, y no se rehace nada.
  // Depende de `universo` y no de `visibles`: apagar una pieza no cambia lo que
  // se lista, y recorrer 2.234 piezas por cada casilla sería un gasto sin motivo.
  const catalogoVisto = useMemo(
    () => (modo === 'quedo' ? catalogoDeLoQueQuedo(catalogo, universo) : catalogo),
    [modo, catalogo, universo],
  )
  const arbol = useMemo(
    () => ordenarArbolEnEspanol(armarArbol(catalogoVisto, eje)),
    [catalogoVisto, eje],
  )
  const busqueda = useMemo(
    () => (consulta.trim().length >= 2 ? buscarEnEspanol(catalogoVisto, consulta) : null),
    [catalogoVisto, consulta],
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

  /**
   * Deja encendido únicamente esto. Es el gesto central del taller, y además
   * acota el conjunto de trabajo: quedarse con algo es decidir con qué se sigue.
   */
  const soloEsto = (ids: string[]) =>
    alQuedarseCon ? alQuedarseCon(new Set(ids)) : alCambiarVisibles(new Set(ids))

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
    (id: string) =>
      alQuedarseCon ? alQuedarseCon(new Set([id])) : alCambiarVisibles(new Set([id])),
    [alCambiarVisibles, alQuedarseCon],
  )

  /** Las props de trozos de la fila de una pieza, vacías si no está partida. */
  const trozosDe = (id: string): TrozosDeLaFila => {
    const hojas = trozos?.get(id)
    if (!hojas) return {}
    return {
      hojas,
      apagadas: claveDe(hojas, trozosApagados),
      seleccionadas: claveDe(hojas, trozosSeleccionados),
      alAlternarTrozo,
      alSoloTrozo,
    }
  }

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
        {universo ? (
          <div className="atlas-ejes atlas-modo" role="group" aria-label="Qué piezas se listan">
            <button
              type="button"
              className={modo === 'quedo' ? 'activo' : ''}
              aria-pressed={modo === 'quedo'}
              onClick={() => setModo('quedo')}
            >
              Lo que quedó
            </button>
            <button
              type="button"
              className={modo === 'todo' ? 'activo' : ''}
              aria-pressed={modo === 'todo'}
              onClick={() => setModo('todo')}
            >
              Todo el atlas
            </button>
          </div>
        ) : null}
        <div className="atlas-globales">
          <button
            type="button"
            onClick={() => (alEncenderTodo ? alEncenderTodo() : alCambiarVisibles(new Set(todas)))}
          >
            Encender todo
          </button>
          <button type="button" onClick={() => alCambiarVisibles(new Set())}>
            Apagar todo
          </button>
          <span className="atlas-conteo">
            {universo && modo === 'quedo'
              ? `${visibles.size} encendidas de ${universo.size}`
              : `${visibles.size} de ${todas.length}`}
          </span>
        </div>
        {universo && modo === 'quedo' ? (
          <p className="atlas-modo-ayuda">
            La lista conserva lo que quedó tras recortar o dejar «solo»: lo que apague sigue aquí
            para volver a encenderlo. «Todo el atlas» muestra también lo que no está.
          </p>
        ) : null}
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
            trozosDe={trozosDe}
            acotada={universo !== null && modo === 'quedo'}
          />
        ) : catalogoVisto.piezas.length === 0 ? (
          <p className="atlas-vacio">
            No queda ninguna pieza en la lista. Pulse «Encender todo» o mire «Todo el atlas» para
            elegir qué traer.
          </p>
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
                                {...trozosDe(pieza.id)}
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
  hojas,
  apagadas = '',
  seleccionadas = '',
  alAlternarTrozo,
  alSoloTrozo,
}: {
  pieza: PiezaDelAtlas
  encendida: boolean
  resaltada: boolean
  seleccionada?: boolean
  alResaltar: (id: string | null) => void
  alAlternar: (id: string) => void
  alSoloEsto: (id: string) => void
  alSeleccionar?: (id: string, sumar: boolean) => void
} & TrozosDeLaFila) {
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
  const nombre = nombreEnEspanol(pieza.nombre)
  const apagadasDeLaPieza = new Set(apagadas ? apagadas.split(',') : [])
  const seleccionadasDeLaPieza = new Set(seleccionadas ? seleccionadas.split(',') : [])
  return (
    <>
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
            // A medias si la pieza está partida y algún trozo suyo apagado
            // (D-141): encendida, pero no entera a la vista.
            ref={(el) => {
              if (el) el.indeterminate = encendida && apagadasDeLaPieza.size > 0
            }}
            aria-label={`Encender ${nombre}`}
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
    {/* Los trozos de la pieza partida, cada uno con su casilla (D-141). Como
        filas hermanas y no anidadas: la fila de la pieza es una línea flexible
        y una lista dentro la rompería. */}
    {hojas?.map((hoja) => {
      const seVe = encendida && !apagadasDeLaPieza.has(hoja)
      const suNombre = nombreDeTrozo(nombre, hoja)
      return (
        <li
          key={hoja}
          className={`atlas-pieza atlas-trozo${seleccionadasDeLaPieza.has(hoja) ? ' atlas-pieza-seleccionada' : ''}`}
        >
          <span className="atlas-casilla">
            <input
              type="checkbox"
              checked={seVe}
              aria-label={`Encender ${suNombre}`}
              onChange={() => alAlternarTrozo?.(hoja)}
            />
            {alSeleccionar ? (
              <button
                type="button"
                className="atlas-pieza-nombre"
                aria-pressed={seleccionadasDeLaPieza.has(hoja)}
                disabled={!seVe}
                title={`${pieza.nombre}${suNombre.slice(nombre.length)} · trozo de ${nombre}`}
                onClick={(evento) => alSeleccionar(hoja, evento.shiftKey || evento.ctrlKey)}
              >
                {suNombre}
              </button>
            ) : (
              <span>{suNombre}</span>
            )}
          </span>
          <button type="button" className="atlas-solo" onClick={() => alSoloTrozo?.(hoja)}>
            solo
          </button>
        </li>
      )
    })}
    </>
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
  trozosDe,
  acotada = false,
}: {
  busqueda: BusquedaEnEspanol
  visibles: Set<string>
  resaltada: string | null
  alResaltar: (id: string | null) => void
  alAlternar: (id: string) => void
  alSoloEsto: (id: string) => void
  seleccion?: ReadonlySet<string> | null
  alSeleccionar?: (id: string, sumar: boolean) => void
  trozosDe: (id: string) => TrozosDeLaFila
  /** Se busca solo entre lo que quedó: lo dice el mensaje de «sin resultados». */
  acotada?: boolean
}) {
  const { piezas, total } = busqueda
  if (total === 0) {
    return (
      <p className="atlas-vacio">
        {acotada
          ? 'Ninguna estructura de lo que quedó coincide. Mire «Todo el atlas» para buscar fuera.'
          : 'Ninguna estructura coincide.'}
      </p>
    )
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
            {...trozosDe(pieza.id)}
          />
        ))}
      </ul>
    </>
  )
}
