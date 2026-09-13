'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { CatalogoDelAtlas, PiezaDelAtlas, VistaDeInstancia } from '@/atlas/formato'
import { VISTA_INICIAL } from '@/atlas/formato'
import { cargarCatalogo } from '@/atlas/cargador'
import { ArbolAnatomico } from '@/components/atlas/ArbolAnatomico'
import { VisorAtlas, type MandoDelVisor } from '@/components/atlas/VisorAtlas'
import {
  duplicarInstancia,
  eliminarInstancia,
  exportarComoModelo,
  guardarInstancia,
  listarInstancias,
  obtenerInstancia,
  type ResumenDeInstancia,
} from '@/app/(frontend)/acciones/atlas'

/**
 * Taller del atlas anatómico.
 *
 * Aquí el traumatólogo abre el cuerpo completo, apaga lo que no le interesa y
 * guarda lo que queda como una **preparación** con nombre, que después se puede
 * insertar en cualquier ficha.
 *
 * Lo que hay que tener claro al leer esto: **el atlas no se modifica nunca**.
 * Apagar una pieza cambia un número en una textura, no borra geometría, y
 * guardar escribe una lista de identificadores. Por eso trabajar sobre una
 * preparación no puede estropear el original, y por eso una pieza que se quitó
 * se puede devolver: nunca se perdió.
 */

export function TallerDeAtlas() {
  const [catalogo, setCatalogo] = useState<CatalogoDelAtlas | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  const [visibles, setVisibles] = useState<Set<string>>(new Set())
  const [resaltada, setResaltada] = useState<string | null>(null)
  const [separacion, setSeparacion] = useState(0)

  const [instancia, setInstancia] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vistaInicial, setVistaInicial] = useState<VistaDeInstancia>(VISTA_INICIAL)

  const [guardadas, setGuardadas] = useState<ResumenDeInstancia[]>([])
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [enCurso, iniciar] = useTransition()

  // --- exportar la preparación como modelo de un caso -----------------------
  //
  // El atlas y la consola son dos motores distintos: el atlas funde todas las
  // piezas de un sistema en una malla y decide qué se ve con una textura; la
  // consola abre un archivo con objetos con nombre, mueve uno y mide
  // milímetros. Por eso el puente va de aquí hacia allá y no al revés: lo que
  // se prepara aquí se **escribe** como un .glb igual que el que sale de
  // Blender, y para la consola es un modelo más.
  //
  // Las protagonistas son las piezas que salen como objeto suelto en vez de
  // fundirse con su sistema: la tibia que se va a romper, el fragmento que hay
  // que reducir. Sin marcar ninguna, el archivo sale con un objeto por sistema
  // y no habría nada que mover en el simulador.
  const [panelExportar, setPanelExportar] = useState(false)
  const [protagonistas, setProtagonistas] = useState<Set<string>>(new Set())
  const [filtroProtagonista, setFiltroProtagonista] = useState('')
  const [exportado, setExportado] = useState<{
    nombre: string
    bytes: number
    nodos: string[]
    perdidas: string[]
  } | null>(null)

  const mando = useRef<MandoDelVisor | null>(null)

  // --- trabajo sin guardar --------------------------------------------------
  //
  // Apagar piezas una a una hasta dejar la tibia sola es media hora de trabajo,
  // y hasta ahora se perdía en silencio: «Cuerpo completo» reiniciaba todo sin
  // preguntar, abrir otra preparación pisaba la que había encima, y cerrar la
  // pestaña se lo llevaba sin una palabra. Nada de eso daba error, que es lo
  // que lo hacía peor: el traumatólogo se enteraba al volver a mirar.
  //
  // Para saber si hay algo que perder se compara el estado de ahora con el de
  // la última vez que se guardó o se abrió algo.
  const [referencia, setReferencia] = useState({ nombre: '', descripcion: '', piezas: '' })

  const clavePiezas = useMemo(() => [...visibles].sort().join(','), [visibles])

  const sucio =
    catalogo !== null &&
    (clavePiezas !== referencia.piezas ||
      nombre.trim() !== referencia.nombre ||
      descripcion.trim() !== referencia.descripcion)

  /** Toma el estado de ahora como «lo guardado»: nada que perder. */
  const fijarReferencia = useCallback((piezas: Set<string>, titulo: string, texto: string) => {
    setReferencia({
      nombre: titulo.trim(),
      descripcion: texto.trim(),
      piezas: [...piezas].sort().join(','),
    })
  }, [])

  /** Pregunta antes de tirar el trabajo. Devuelve si se puede continuar. */
  const confirmarDescarte = (queVaAPasar: string) =>
    !sucio ||
    confirm(
      `Hay cambios sin guardar en esta preparación.\n\n${queVaAPasar}\n\n` +
        '¿Continuar y perderlos?',
    )

  // Y el mismo aviso al cerrar la pestaña que usa el editor de fichas.
  useEffect(() => {
    if (!sucio) return
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [sucio])

  // --- catálogo -------------------------------------------------------------
  useEffect(() => {
    const aborto = new AbortController()
    cargarCatalogo(aborto.signal)
      .then((c) => {
        const todas = new Set(c.piezas.map((p) => p.id))
        setCatalogo(c)
        setVisibles(todas)
        // El cuerpo entero y sin nombre es el punto de partida: todavía no hay
        // nada que perder.
        fijarReferencia(todas, '', '')
      })
      .catch((e: unknown) => {
        if (aborto.signal.aborted) return
        setFallo(e instanceof Error ? e.message : 'No se pudo leer el catálogo del atlas.')
      })
    return () => aborto.abort()
  }, [fijarReferencia])

  const refrescarLista = useCallback(() => {
    void listarInstancias().then((r) => {
      if (r.exito && r.datos) setGuardadas(r.datos)
    })
  }, [])

  useEffect(refrescarLista, [refrescarLista])

  // --- acciones -------------------------------------------------------------
  /**
   * Vuelve al cuerpo completo.
   *
   * `preguntar` es false cuando llega desde otra acción que ya preguntó, como
   * eliminar la preparación abierta: encadenar dos confirmaciones seguidas por
   * el mismo gesto enseña a pulsar «aceptar» sin leer.
   */
  const empezarDeCero = (preguntar = true) => {
    if (!catalogo) return
    if (preguntar && !confirmarDescarte('Se volverá al cuerpo completo, sin nombre.')) return
    const todas = new Set(catalogo.piezas.map((p) => p.id))
    setInstancia(null)
    setNombre('')
    setDescripcion('')
    setVisibles(todas)
    setSeparacion(0)
    setVistaInicial(VISTA_INICIAL)
    mando.current?.irA(VISTA_INICIAL)
    fijarReferencia(todas, '', '')
    setAviso(null)
  }

  const abrir = (id: string) => {
    if (!confirmarDescarte('Se abrirá otra preparación en su lugar.')) return
    setAviso(null)
    iniciar(async () => {
      const r = await obtenerInstancia(id)
      if (!r.exito || !r.datos) {
        setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo abrir la preparación.' })
        return
      }
      setInstancia(r.datos.id)
      setNombre(r.datos.nombre)
      setDescripcion(r.datos.descripcion ?? '')
      setVisibles(new Set(r.datos.contenido.piezas.map((p) => p.id)))
      setSeparacion(r.datos.contenido.vista.separacion)
      setVistaInicial(r.datos.contenido.vista)
      fijarReferencia(
        new Set(r.datos.contenido.piezas.map((p) => p.id)),
        r.datos.nombre,
        r.datos.descripcion ?? '',
      )
      // Y además se le ordena al visor que vaya: la escena ya está montada y no
      // se vuelve a montar, así que sin esto la cámara se quedaba donde
      // estuviera. Como al guardar se escribe la cámara actual, abrir una
      // preparación y volver a guardarla borraba su encuadre sin avisar.
      mando.current?.irA(r.datos.contenido.vista)
      if (r.datos.perdidas.length > 0) {
        setAviso({
          tipo: 'error',
          texto:
            `Esta preparación se hizo con otra versión del atlas y ${r.datos.perdidas.length} ` +
            'de sus piezas ya no existen. Revísela antes de volver a guardarla.',
        })
      }
    })
  }

  const guardar = () => {
    if (!nombre.trim()) {
      setAviso({ tipo: 'error', texto: 'Póngale un nombre a la preparación.' })
      return
    }
    if (visibles.size === 0) {
      setAviso({ tipo: 'error', texto: 'No queda ninguna pieza encendida.' })
      return
    }
    setAviso(null)

    iniciar(async () => {
      const r = await guardarInstancia(instancia, {
        nombre,
        descripcion,
        piezas: [...visibles],
        vista: mando.current?.vistaActual() ?? { ...VISTA_INICIAL, separacion },
      })
      if (!r.exito || !r.datos) {
        setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo guardar.' })
        return
      }
      setInstancia(r.datos.id)
      // Lo recién guardado pasa a ser la referencia: ya no hay nada que perder.
      fijarReferencia(visibles, nombre, descripcion)
      setAviso({
        tipo: 'ok',
        texto: `Guardada con ${r.datos.piezas} pieza${r.datos.piezas === 1 ? '' : 's'}. Ya se puede insertar en una ficha.`,
      })
      refrescarLista()
    })
  }

  /**
   * Escribe la preparación como un modelo 3D de la biblioteca.
   *
   * Exige tenerla guardada y sin cambios sueltos porque el servidor exporta lo
   * que hay en la base, no lo que se ve en pantalla: exportar con la pantalla
   * por delante entregaría un archivo que no se parece a lo que el
   * traumatólogo está mirando, y nada lo avisaría.
   */
  const exportar = () => {
    if (!instancia) {
      setAviso({
        tipo: 'error',
        texto: 'Guarde la preparación antes de exportarla: se exporta lo guardado.',
      })
      return
    }
    if (sucio) {
      setAviso({
        tipo: 'error',
        texto:
          'Hay cambios sin guardar. Guárdelos primero: se exporta lo que hay en la base, no lo que se ve.',
      })
      return
    }
    setAviso(null)
    setExportado(null)

    iniciar(async () => {
      const r = await exportarComoModelo(instancia, { protagonistas: [...protagonistas] })
      if (!r.exito || !r.datos) {
        setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo exportar.' })
        return
      }
      setExportado(r.datos)
      setAviso({
        tipo: 'ok',
        texto: `«${r.datos.nombre}» ya está en la biblioteca de modelos 3D.`,
      })
    })
  }

  /**
   * Las piezas encendidas, para elegir cuáles salen sueltas.
   *
   * Se enseñan las cien primeras y se dice cuántas quedan fuera: el cuerpo
   * completo son ciento treinta y nueve y pintarlas todas convierte el panel en
   * una lista imposible de recorrer. Callar el recorte sería peor: parecería
   * que la pieza que se busca no está encendida.
   */
  const candidatas = useMemo<{ lista: PiezaDelAtlas[]; total: number }>(() => {
    if (!catalogo) return { lista: [], total: 0 }
    const busca = filtroProtagonista.trim().toLowerCase()
    const encendidas = catalogo.piezas
      .filter((p) => visibles.has(p.id))
      .filter((p) => !busca || p.nombre.toLowerCase().includes(busca))
    return { lista: encendidas.slice(0, 100), total: encendidas.length }
  }, [catalogo, visibles, filtroProtagonista])

  const conAviso = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string }>,
    exitoso: string,
  ) => {
    setAviso(null)
    iniciar(async () => {
      const r = await tarea()
      if (r.exito) {
        setAviso({ tipo: 'ok', texto: exitoso })
        refrescarLista()
      } else {
        setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
      }
    })
  }

  const resumen = useMemo(() => {
    if (!catalogo) return null
    const porRegion = new Map<string, number>()
    for (const pieza of catalogo.piezas) {
      if (!visibles.has(pieza.id)) continue
      porRegion.set(pieza.region, (porRegion.get(pieza.region) ?? 0) + 1)
    }
    const nombres = new Map(catalogo.regiones.map((r) => [r.id, r.nombre]))
    return [...porRegion.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${nombres.get(id) ?? id} (${n})`)
      .join(' · ')
  }, [catalogo, visibles])

  // --- pintado --------------------------------------------------------------
  if (fallo) {
    return (
      <div className="admin-aviso admin-aviso-error">
        <strong>El atlas no está instalado en este servidor.</strong> {fallo}
        <br />
        Ejecute <code>node scripts/atlas/preparar.mjs</code> y vuelva a desplegar.
      </div>
    )
  }

  if (!catalogo) return <p className="admin-subtitle">Leyendo el catálogo del atlas…</p>

  return (
    <>
      {/* En pantalla estrecha se enseña esto en lugar del taller. Es CSS y no
          JavaScript a propósito: medir el ancho al pintar da un primer fotograma
          equivocado y, en el servidor, no hay ancho que medir. */}
      <section className="atlas-solo-escritorio">
        <h2>El taller anatómico necesita un computador</h2>
        <p>
          Aquí se trabaja con tres cosas a la vez: el árbol de {catalogo.piezas.length} piezas, el
          modelo en tres dimensiones y la ficha de la preparación. En un teléfono no caben, y el
          visor queda tan pequeño que no se distingue una pieza de otra.
        </p>
        <p>
          Abra esta página desde un computador. Las preparaciones que ya haya guardado sí se ven
          bien en el móvil dentro de sus fichas.
        </p>
      </section>

      <div className="atlas-taller">
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Taller anatómico</h1>
          <p className="admin-subtitle">
            {catalogo.piezas.length} piezas · {catalogo.sujeto}
            {instancia ? ' · editando una preparación guardada' : ' · preparación nueva'}
            {sucio ? <span className="editor-sucio"> · cambios sin guardar</span> : null}
          </p>
        </div>
        <div className="admin-acciones">
          <button className="admin-btn admin-btn-secondary" onClick={() => empezarDeCero()}>
            Cuerpo completo
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => mando.current?.encuadrar()}
          >
            Encuadrar
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            aria-expanded={panelExportar}
            onClick={() => setPanelExportar((abierto) => !abierto)}
          >
            {panelExportar ? 'Cerrar exportación' : 'Exportar como modelo'}
          </button>
          <button className="admin-btn admin-btn-primary" disabled={enCurso} onClick={guardar}>
            {enCurso ? 'Guardando…' : instancia ? 'Guardar cambios' : 'Guardar preparación'}
          </button>
        </div>
      </div>

      {panelExportar ? (
        <div className="admin-aviso admin-aviso-info">
          <strong>Exportar esta preparación como modelo 3D</strong>
          <p>
            Se escribe un archivo .glb en la biblioteca de modelos, igual que si lo hubiera subido
            desde Blender, y desde ahí se elige en cualquier caso del simulador. El atlas no se
            toca: esto no quita ni mueve nada de aquí.
          </p>
          <p>
            Marque las piezas que tengan que salir <strong>sueltas</strong>: la que se va a
            fracturar y el fragmento que hay que reducir. Todo lo demás sale fundido en un objeto
            por sistema, que es lo que hace que el archivo pese poco. Sin ninguna marcada no habrá
            nada que mover en la consola.
          </p>

          <input
            className="atlas-busqueda"
            type="search"
            value={filtroProtagonista}
            placeholder="Buscar entre las piezas encendidas…"
            aria-label="Buscar entre las piezas encendidas"
            onChange={(e) => setFiltroProtagonista(e.target.value)}
          />

          <div className="atlas-lista" style={{ maxHeight: 220, marginTop: 8 }}>
            {candidatas.lista.map((pieza) => (
              <label className="atlas-casilla" key={pieza.id}>
                <input
                  type="checkbox"
                  checked={protagonistas.has(pieza.id)}
                  onChange={(e) => {
                    setProtagonistas((antes) => {
                      const ahora = new Set(antes)
                      if (e.target.checked) ahora.add(pieza.id)
                      else ahora.delete(pieza.id)
                      return ahora
                    })
                  }}
                />
                <span>{pieza.nombre}</span>
              </label>
            ))}
            {candidatas.total === 0 ? (
              <p className="atlas-conteo">Ninguna pieza encendida coincide con esa búsqueda.</p>
            ) : null}
            {candidatas.total > candidatas.lista.length ? (
              <p className="atlas-conteo">
                Se enseñan {candidatas.lista.length} de {candidatas.total}. Escriba en el buscador
                para encontrar el resto.
              </p>
            ) : null}
          </div>

          <div className="admin-acciones" style={{ marginTop: 10 }}>
            <button className="admin-btn admin-btn-primary" disabled={enCurso} onClick={exportar}>
              {enCurso ? 'Exportando…' : 'Crear el modelo'}
            </button>
            <span className="atlas-conteo">
              {protagonistas.size === 0
                ? 'Ninguna pieza suelta'
                : `${protagonistas.size} pieza${protagonistas.size === 1 ? '' : 's'} suelta${
                    protagonistas.size === 1 ? '' : 's'
                  }`}
              {' · '}
              {visibles.size} encendida{visibles.size === 1 ? '' : 's'}
            </span>
          </div>

          {exportado ? (
            <div className="admin-aviso admin-aviso-ok" style={{ marginTop: 10 }}>
              <strong>
                {exportado.nombre} · {(exportado.bytes / 1024 / 1024).toFixed(2)} MB
              </strong>
              <p>
                Estos son los nombres que el caso tiene que escribir en sus piezas. Son los que la
                consola ve dentro del archivo, no los del atlas: three.js cambia los espacios por
                guiones bajos al cargar, y escribir el otro deja una pieza que no se enciende nunca
                y ningún error que lo explique.
              </p>
              <ul>
                {exportado.nodos.map((n) => (
                  <li key={n}>
                    <code>{n}</code>
                  </li>
                ))}
              </ul>
              {exportado.perdidas.length ? (
                <p>
                  <strong>Atención:</strong> {exportado.perdidas.length} pieza
                  {exportado.perdidas.length === 1 ? '' : 's'} de la preparación ya no
                  {exportado.perdidas.length === 1 ? ' existe' : ' existen'} en el atlas instalado y
                  no {exportado.perdidas.length === 1 ? 'salió' : 'salieron'} en el archivo.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

      {sucio ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>Hay cambios sin guardar.</strong> Lo que apague o encienda aquí no queda en
          ninguna parte hasta que pulse{' '}
          <em>{instancia ? 'Guardar cambios' : 'Guardar preparación'}</em>. Cerrar la pestaña,
          volver al cuerpo completo o abrir otra preparación se lo llevará.
        </div>
      ) : null}

      <div className="atlas-marco">
        <aside className="atlas-panel">
          <ArbolAnatomico
            catalogo={catalogo}
            visibles={visibles}
            alCambiarVisibles={setVisibles}
            resaltada={resaltada}
            alResaltar={setResaltada}
          />
        </aside>

        <div className="atlas-centro">
          <VisorAtlas
            catalogo={catalogo}
            visibles={visibles}
            resaltada={resaltada}
            separacion={separacion}
            vistaInicial={vistaInicial}
            mando={mando}
            // Pulsar una pieza en el visor la apaga: es el gesto directo de
            // «esto me estorba, fuera».
            alPulsarPieza={(id) => {
              const nuevas = new Set(visibles)
              nuevas.delete(id)
              setVisibles(nuevas)
            }}
          />

          <div className="atlas-mandos">
            <label className="atlas-separador-mando">
              <span>Separar</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(separacion * 100)}
                onChange={(e) => setSeparacion(Number(e.target.value) / 100)}
              />
              <span className="atlas-separador-valor">{Math.round(separacion * 100)}%</span>
            </label>
            <span className="atlas-resumen">{resumen || 'Nada encendido'}</span>
          </div>
        </div>

        <aside className="atlas-panel atlas-panel-derecho">
          <div className="atlas-ficha">
            <label className="campo-etiqueta" htmlFor="atlas-nombre">
              Nombre de la preparación *
            </label>
            <input
              id="atlas-nombre"
              className="campo-control"
              placeholder="Tibia derecha con peroné"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <label className="campo-etiqueta" htmlFor="atlas-descripcion">
              Para qué sirve
            </label>
            <textarea
              id="atlas-descripcion"
              className="campo-control"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />

            <p className="campo-ayuda">
              Se guardan las piezas encendidas y el encuadre de la cámara. El atlas original no se
              toca: lo que apague aquí se puede volver a encender siempre.
            </p>
          </div>

          <h3 className="atlas-subtitulo">Preparaciones guardadas</h3>
          {guardadas.length === 0 ? (
            <p className="atlas-vacio">Todavía no hay ninguna.</p>
          ) : (
            <ul className="atlas-guardadas">
              {guardadas.map((g) => (
                <li key={g.id} className={g.id === instancia ? 'atlas-guardada-activa' : ''}>
                  <button type="button" className="atlas-guardada-abrir" onClick={() => abrir(g.id)}>
                    <strong>{g.nombre}</strong>
                    <span>
                      {g.piezas} pieza{g.piezas === 1 ? '' : 's'}
                      {g.desfasada ? ' · atlas antiguo' : ''}
                    </span>
                  </button>
                  <div className="atlas-guardada-acciones">
                    <button
                      type="button"
                      disabled={enCurso}
                      onClick={() =>
                        conAviso(() => duplicarInstancia(g.id), 'Copia creada.')
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="lista-quitar"
                      disabled={enCurso}
                      onClick={() => {
                        if (confirm(`¿Eliminar «${g.nombre}»? No se puede deshacer.`)) {
                          conAviso(() => eliminarInstancia(g.id), 'Preparación eliminada.')
                          if (g.id === instancia) empezarDeCero(false)
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      </div>
    </>
  )
}
