'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { CatalogoDelAtlas, VistaDeInstancia } from '@/atlas/formato'
import { VISTA_INICIAL } from '@/atlas/formato'
import { cargarCatalogo } from '@/atlas/cargador'
import { ArbolAnatomico } from '@/components/atlas/ArbolAnatomico'
import { VisorAtlas, type MandoDelVisor } from '@/components/atlas/VisorAtlas'
import {
  duplicarInstancia,
  eliminarInstancia,
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

  const mando = useRef<MandoDelVisor | null>(null)

  // --- catálogo -------------------------------------------------------------
  useEffect(() => {
    const aborto = new AbortController()
    cargarCatalogo(aborto.signal)
      .then((c) => {
        setCatalogo(c)
        setVisibles(new Set(c.piezas.map((p) => p.id)))
      })
      .catch((e: unknown) => {
        if (aborto.signal.aborted) return
        setFallo(e instanceof Error ? e.message : 'No se pudo leer el catálogo del atlas.')
      })
    return () => aborto.abort()
  }, [])

  const refrescarLista = useCallback(() => {
    void listarInstancias().then((r) => {
      if (r.exito && r.datos) setGuardadas(r.datos)
    })
  }, [])

  useEffect(refrescarLista, [refrescarLista])

  // --- acciones -------------------------------------------------------------
  const empezarDeCero = () => {
    if (!catalogo) return
    setInstancia(null)
    setNombre('')
    setDescripcion('')
    setVisibles(new Set(catalogo.piezas.map((p) => p.id)))
    setSeparacion(0)
    setVistaInicial(VISTA_INICIAL)
    mando.current?.irA(VISTA_INICIAL)
    setAviso(null)
  }

  const abrir = (id: string) => {
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
      setAviso({
        tipo: 'ok',
        texto: `Guardada con ${r.datos.piezas} pieza${r.datos.piezas === 1 ? '' : 's'}. Ya se puede insertar en una ficha.`,
      })
      refrescarLista()
    })
  }

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
    <div className="atlas-taller">
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Taller anatómico</h1>
          <p className="admin-subtitle">
            {catalogo.piezas.length} piezas · {catalogo.sujeto}
            {instancia ? ' · editando una preparación guardada' : ' · preparación nueva'}
          </p>
        </div>
        <div className="admin-acciones">
          <button className="admin-btn admin-btn-secondary" onClick={empezarDeCero}>
            Cuerpo completo
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => mando.current?.encuadrar()}
          >
            Encuadrar
          </button>
          <button className="admin-btn admin-btn-primary" disabled={enCurso} onClick={guardar}>
            {enCurso ? 'Guardando…' : instancia ? 'Guardar cambios' : 'Guardar preparación'}
          </button>
        </div>
      </div>

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

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
                          if (g.id === instancia) empezarDeCero()
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
  )
}
