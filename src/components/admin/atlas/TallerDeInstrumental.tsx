'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Pestanas, PanelDePestana } from '@/components/ui/Pestanas'
import type {
  HerramientaDelInstrumento,
  InfoDelModelo,
  MandoDelVisorDeInstrumento,
  ParteDelModelo,
} from '@/components/atlas/VisorDeInstrumento'
import {
  completarElCatalogo,
  crearInstrumento,
  editarInstrumento,
  eliminarInstrumento,
  enlazarModeloDeInstrumento,
  enlazarModeloPorNombre,
  guardarRetoquesDeInstrumento,
  listarInstrumental,
  quitarModeloDeInstrumento,
  type InstrumentoDelTaller,
} from '@/app/(frontend)/acciones/instrumental'
import { CATEGORIAS_DE_INSTRUMENTAL, INSTRUMENTAL_BASE, slugDeInstrumento } from '@/lib/instrumental'
import { hayRetoques, type AjustesDeInstrumento, type Cuaternion, type Vector3 } from '@/instrumental/modelo'
import { ruta } from '@/lib/rutas'
import { formularioDeArchivo, subidorQueAvisa } from '@/admin/subidas'

/**
 * La pestaña «Instrumental» del taller anatómico (D-165).
 *
 * Tres cosas en una pantalla, con la misma forma que el taller de al lado:
 *
 *  1. **El listado** de instrumentos, con cuáles tienen modelo 3D y a cuáles les
 *     falta. Es lo que pidió el dueño: poder ver de un vistazo qué falta cargar.
 *  2. **El visor**, para ver cada modelo como lo verá el simulador, con sus
 *     articulaciones (abrir una tijera, pulsar un botón).
 *  3. **El retoque**: quien administra puede ocultar o recolorear una parte,
 *     correrla con las asas y fijar con qué posición abre el instrumento. Se
 *     guarda con el instrumento y es lo que carga el simulador.
 *
 * Reparto de permisos: el editor crea y describe instrumentos; el administrador
 * carga el archivo y lo retoca. La interfaz lo respeta, pero quien manda es el
 * servidor (`acciones/instrumental.ts`).
 *
 * El estado de lo que se está viendo y retocando vive en `EspacioDelInstrumento`,
 * que se monta **con una clave por instrumento y por modelo**: elegir otro, o
 * cargar un archivo nuevo, lo vacía todo de una vez sin tener que ir limpiando
 * campo por campo desde un efecto.
 */

const VisorDeInstrumento = dynamic(() => import('@/components/atlas/VisorDeInstrumento').then((m) => m.VisorDeInstrumento), {
  ssr: false,
})

/**
 * Sube un `.glb` a la biblioteca de modelos por la ruta de subidas, no por una
 * acción de servidor: el archivo no tiene por qué caber en el cuerpo de una
 * acción (D-165). Devuelve el identificador del modelo creado; enlazarlo con su
 * instrumento es otra llamada, que ya solo lleva ese número.
 *
 * `anonimizado` no se manda: es la casilla de «el estudio DICOM de origen está
 * anonimizado», que en un instrumento no significa nada, y la ruta solo sabe
 * pasar texto, no booleanos.
 */
function subirModeloDeInstrumento(archivo: File, nombre: string) {
  const formulario = formularioDeArchivo('modelos-3d', archivo)
  formulario.set('nombre', nombre)
  formulario.set('alt', nombre)
  formulario.set('origen', 'sintetico')
  formulario.set('notas', 'Modelo de instrumental, generado con scripts/instrumental o subido desde el taller.')
  return subidorQueAvisa(() => {})(formulario)
}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null
type Estado = 'todos' | 'con' | 'sin' | 'retocados'
type Informar = (r: { exito: boolean; mensaje?: string }, ok: string) => boolean

const ICONOS = ['generico', 'bisturi', 'separador', 'pinza', 'tijera', 'punzon', 'guia', 'fresa', 'martillo', 'atornillador', 'aguja']
const ETIQUETA_DE_ICONO: Record<string, string> = {
  generico: 'Genérico',
  bisturi: 'Bisturí',
  separador: 'Separador',
  pinza: 'Pinza',
  tijera: 'Tijera',
  punzon: 'Punzón',
  guia: 'Guía',
  fresa: 'Fresa',
  martillo: 'Martillo',
  atornillador: 'Atornillador',
  aguja: 'Aguja',
}

const FORMULARIO_VACIO = { nombre: '', slug: '', categoria: 'fijacion', icono: 'generico', descripcion: '', especificaciones: '' }

function formatearBytes(n: number | null): string {
  if (n === null) return '—'
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** La profundidad de una parte en el árbol, para sangrar la lista. */
function profundidadDe(partes: ParteDelModelo[], nombre: string): number {
  const porNombre = new Map(partes.map((p) => [p.nombre, p]))
  let n = 0
  let actual = porNombre.get(nombre)
  while (actual?.padre) {
    n += 1
    actual = porNombre.get(actual.padre)
  }
  return n
}

// =====================================================================
// El taller: listado y reparto
// =====================================================================

export function TallerDeInstrumental({ esAdmin }: { esAdmin: boolean }) {
  const [lista, setLista] = useState<InstrumentoDelTaller[] | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [enCurso, iniciar] = useTransition()

  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<Estado>('todos')
  const [categoria, setCategoria] = useState('todas')
  const [elegido, setElegido] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [pestana, setPestana] = useState('ficha')
  const [resultadoDeCarga, setResultadoDeCarga] = useState<{ ok: string[]; fallas: { archivo: string; motivo: string }[] } | null>(null)
  // Si el espacio de trabajo tiene retoques sin guardar: se pregunta antes de cambiar de instrumento.
  const hayCambios = useRef(false)

  const instrumento = useMemo(() => lista?.find((i) => i.id === elegido) ?? null, [lista, elegido])

  // Con `.then` y no con `async`: es la forma de pedir datos al montar que el
  // linter reconoce como suscripción y no como un estado escrito dentro del efecto.
  const refrescar = useCallback(
    () =>
      listarInstrumental()
        .then((r) => {
          if (r.exito && r.datos) setLista(r.datos)
          else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo leer el instrumental.' })
        })
        .catch(() => setAviso({ tipo: 'error', texto: 'No se pudo contactar con el servidor. Compruebe la conexión.' })),
    [],
  )

  useEffect(() => {
    void refrescar()
  }, [refrescar])

  const conModelo = lista?.filter((i) => i.modelo).length ?? 0
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (lista ?? []).filter((i) => {
      if (q && !`${i.nombre} ${i.slug} ${i.descripcion}`.toLowerCase().includes(q)) return false
      if (categoria !== 'todas' && i.categoria !== categoria) return false
      if (estado === 'con' && !i.modelo) return false
      if (estado === 'sin' && i.modelo) return false
      if (estado === 'retocados' && !hayRetoques(i.ajustes)) return false
      return true
    })
  }, [lista, buscar, estado, categoria])

  const grupos = useMemo(() => {
    const por = new Map<string, InstrumentoDelTaller[]>()
    for (const i of visibles) por.set(i.categoria, [...(por.get(i.categoria) ?? []), i])
    return CATEGORIAS_DE_INSTRUMENTAL.filter((c) => por.has(c.value)).map((c) => ({ ...c, items: por.get(c.value)! }))
  }, [visibles])

  const faltanDelCatalogo = useMemo(() => {
    const slugs = new Set((lista ?? []).map((i) => i.slug))
    return INSTRUMENTAL_BASE.filter((b) => !slugs.has(b.slug)).length
  }, [lista])

  const descartarSiHaceFalta = () =>
    !hayCambios.current || window.confirm('Hay retoques sin guardar en este instrumento. ¿Descartarlos?')

  const elegir = (id: string) => {
    if (id !== elegido && !descartarSiHaceFalta()) return
    hayCambios.current = false
    setCreando(false)
    setElegido(id)
    setAviso(null)
  }

  const informar: Informar = (r, ok) => {
    setAviso(r.exito ? { tipo: 'ok', texto: ok } : { tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
    return r.exito
  }

  const completar = () =>
    iniciar(async () => {
      const r = await completarElCatalogo()
      if (r.exito && r.datos) {
        setAviso({
          tipo: 'ok',
          texto: r.datos.creados === 0 ? 'El catálogo ya estaba completo.' : `Se añadieron ${r.datos.creados} instrumentos del documento, sin modelo todavía.`,
        })
        await refrescar()
      } else setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar el catálogo.' })
    })

  const cargarVarios = (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return
    const todos = [...archivos]
    iniciar(async () => {
      const ok: string[] = []
      const fallas: { archivo: string; motivo: string }[] = []
      for (const archivo of todos) {
        const subido = await subirModeloDeInstrumento(archivo, `${archivo.name.replace(/\.[^.]+$/, '')} · instrumental`)
        if (!subido.exito || !subido.datos) {
          fallas.push({ archivo: archivo.name, motivo: subido.mensaje ?? 'No se pudo subir.' })
          continue
        }
        const r = await enlazarModeloPorNombre(archivo.name, subido.datos.id)
        if (r.exito && r.datos) ok.push(r.datos.nombre)
        else fallas.push({ archivo: archivo.name, motivo: r.mensaje ?? 'No se pudo cargar.' })
      }
      setResultadoDeCarga({ ok, fallas })
      setAviso({
        tipo: fallas.length === 0 ? 'ok' : 'error',
        texto: `${ok.length} modelo${ok.length === 1 ? '' : 's'} cargado${ok.length === 1 ? '' : 's'}${fallas.length ? `, ${fallas.length} con problemas` : ''}.`,
      })
      await refrescar()
      setPestana('modelo')
    })
  }

  return (
    <div className="atlas-taller">
      <div className="atlas-marco instr-marco">
        {/* ------------------------------------------------------------ listado */}
        <aside className="atlas-panel instr-listado">
          <div className="instr-cabecera">
            <strong>Instrumental</strong>
            <span className="atlas-conteo" aria-live="polite">
              {lista ? `${conModelo} de ${lista.length} con modelo 3D` : 'Cargando…'}
            </span>
            <div className="instr-avance" role="progressbar" aria-valuemin={0} aria-valuemax={lista?.length ?? 0} aria-valuenow={conModelo} aria-label="Instrumentos con modelo 3D">
              <span style={{ width: lista && lista.length ? `${(conModelo / lista.length) * 100}%` : '0%' }} />
            </div>
            <div className="instr-botones">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  if (!descartarSiHaceFalta()) return
                  hayCambios.current = false
                  setCreando(true)
                  setElegido(null)
                  setPestana('ficha')
                }}
              >
                + Nuevo instrumento
              </button>
              {esAdmin ? (
                <>
                  <label className="admin-btn admin-btn-secondary instr-subir" title="Elija varios .glb: cada uno se enlaza con el instrumento de su mismo nombre (tijera-mayo.glb va con tijera-mayo)">
                    Cargar varios modelos…
                    <input
                      type="file"
                      accept=".glb,model/gltf-binary"
                      multiple
                      hidden
                      disabled={enCurso}
                      onChange={(e) => {
                        cargarVarios(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {faltanDelCatalogo > 0 ? (
                    <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={completar} title="Añade los instrumentos del documento del traumatólogo que todavía no están">
                      Completar el catálogo ({faltanDelCatalogo})
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            <input className="atlas-busqueda" type="search" placeholder="Buscar un instrumento…" aria-label="Buscar un instrumento" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <div className="instr-filtros">
              <select className="campo-control" aria-label="Estado del modelo" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
                <option value="todos">Todos</option>
                <option value="sin">Sin modelo 3D</option>
                <option value="con">Con modelo 3D</option>
                <option value="retocados">Retocados</option>
              </select>
              <select className="campo-control" aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="todas">Todas las categorías</option>
                {CATEGORIAS_DE_INSTRUMENTAL.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="atlas-lista instr-lista">
            {lista && visibles.length === 0 ? (
              <p className="atlas-conteo" style={{ padding: 12 }}>
                {lista.length === 0
                  ? esAdmin
                    ? 'No hay instrumentos todavía. Pulse «Completar el catálogo» para traer los del documento.'
                    : 'No hay instrumentos todavía. Cree el primero con «Nuevo instrumento».'
                  : 'Ninguno coincide con el filtro.'}
              </p>
            ) : null}
            {grupos.map((g) => (
              <div key={g.value} className="instr-grupo">
                <div className="instr-grupo-titulo">
                  {g.label}{' '}
                  <span>
                    {g.items.filter((i) => i.modelo).length}/{g.items.length}
                  </span>
                </div>
                {g.items.map((i) => (
                  <button key={i.id} type="button" className="instr-fila" aria-pressed={i.id === elegido} onClick={() => elegir(i.id)}>
                    <span className="instr-fila-nombre">{i.nombre}</span>
                    {i.modelo ? (
                      <span className={`instr-etiqueta ${hayRetoques(i.ajustes) ? 'instr-etiqueta-retocado' : 'instr-etiqueta-ok'}`}>{hayRetoques(i.ajustes) ? '3D · retocado' : '3D'}</span>
                    ) : (
                      <span className="instr-etiqueta instr-etiqueta-falta">Falta</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <EspacioDelInstrumento
          // Otro instrumento, o el mismo con un modelo nuevo, parte de cero.
          key={`${creando ? 'nuevo' : (instrumento?.id ?? 'ninguno')}:${instrumento?.modelo?.id ?? ''}`}
          instrumento={creando ? null : instrumento}
          creando={creando}
          esAdmin={esAdmin}
          pestana={pestana}
          alCambiarPestana={setPestana}
          iniciar={iniciar}
          enCurso={enCurso}
          informar={informar}
          refrescar={refrescar}
          marcarCambios={(hay) => {
            hayCambios.current = hay
          }}
          alCrear={(id) => {
            setCreando(false)
            setElegido(id)
          }}
          alBorrar={() => setElegido(null)}
          alCancelarCreacion={() => setCreando(false)}
          resultadoDeCarga={resultadoDeCarga}
          cerrarResultado={() => setResultadoDeCarga(null)}
        />
      </div>

      <div className="atlas-avisos-flotantes">
        <div role="status">
          {aviso ? (
            <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>
              {aviso.texto}
              <button type="button" className="atlas-aviso-cerrar" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}>
                ×
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// El espacio de trabajo de UN instrumento: visor, articulaciones y panel derecho
// =====================================================================

function EspacioDelInstrumento({
  instrumento,
  creando,
  esAdmin,
  pestana,
  alCambiarPestana,
  iniciar,
  enCurso,
  informar,
  refrescar,
  marcarCambios,
  alCrear,
  alBorrar,
  alCancelarCreacion,
  resultadoDeCarga,
  cerrarResultado,
}: {
  instrumento: InstrumentoDelTaller | null
  creando: boolean
  esAdmin: boolean
  pestana: string
  alCambiarPestana: (id: string) => void
  iniciar: (tarea: () => Promise<void>) => void
  enCurso: boolean
  informar: Informar
  refrescar: () => Promise<void>
  marcarCambios: (hay: boolean) => void
  alCrear: (id: string) => void
  alBorrar: () => void
  alCancelarCreacion: () => void
  resultadoDeCarga: { ok: string[]; fallas: { archivo: string; motivo: string }[] } | null
  cerrarResultado: () => void
}) {
  const [formulario, setFormulario] = useState(
    instrumento
      ? {
          nombre: instrumento.nombre,
          slug: instrumento.slug,
          categoria: instrumento.categoria,
          icono: instrumento.icono,
          descripcion: instrumento.descripcion,
          especificaciones: instrumento.especificaciones,
        }
      : FORMULARIO_VACIO,
  )
  const [info, setInfo] = useState<InfoDelModelo | null>(null)
  const [errorDelModelo, setErrorDelModelo] = useState<string | null>(null)
  const [parte, setParte] = useState<string | null>(null)
  const [herramienta, setHerramienta] = useState<HerramientaDelInstrumento>('girar')
  const [rayosX, setRayosX] = useState(false)
  const [ortografica, setOrtografica] = useState(false)
  const [articulaciones, setArticulaciones] = useState<Record<string, number>>({})
  const [retoques, setRetoques] = useState<AjustesDeInstrumento>(instrumento?.ajustes ?? {})
  const [sucio, setSucio] = useState(false)
  const mando = useRef<MandoDelVisorDeInstrumento>(null)
  // Los valores con que abre el instrumento: los guardados, o los que declara el archivo.
  const guardadas = useRef(instrumento?.ajustes?.articulaciones)

  const modeloUrl = instrumento?.modelo?.url ?? null

  const hacerSucio = () => {
    setSucio(true)
    marcarCambios(true)
  }

  const alCargarElModelo = useCallback((cargado: InfoDelModelo | null, error?: string) => {
    setInfo(cargado)
    setErrorDelModelo(error ?? null)
    const inicial: Record<string, number> = {}
    for (const a of cargado?.meta?.articulaciones ?? []) inicial[a.nombre] = guardadas.current?.[a.nombre] ?? a.inicial
    setArticulaciones(inicial)
  }, [])

  const cambiarRetoque = useCallback(
    (nombre: string, cambio: Partial<NonNullable<AjustesDeInstrumento['partes']>[string]> | null) => {
      setRetoques((antes) => {
        const partes = { ...(antes.partes ?? {}) }
        if (cambio === null) delete partes[nombre]
        else partes[nombre] = { ...(partes[nombre] ?? {}), ...cambio }
        return { ...antes, partes }
      })
      setSucio(true)
      marcarCambios(true)
    },
    [marcarCambios],
  )
  const alMoverParte = useCallback((nombre: string, r: { mover: Vector3; girar: Cuaternion }) => cambiarRetoque(nombre, { mover: r.mover, girar: r.girar }), [cambiarRetoque])

  // ---------------------------------------------------------- acciones
  const crear = () =>
    iniciar(async () => {
      const r = await crearInstrumento(formulario)
      if (informar(r, 'Instrumento creado. Falta el modelo 3D: lo carga el administrador.') && r.datos) {
        await refrescar()
        alCrear(r.datos.id)
      }
    })

  const guardarFicha = () =>
    iniciar(async () => {
      if (!instrumento) return
      const r = await editarInstrumento(instrumento.id, formulario)
      if (informar(r, 'Ficha guardada.')) await refrescar()
    })

  const borrar = () => {
    if (!instrumento) return
    if (!window.confirm(`¿Eliminar «${instrumento.nombre}»? Los pasos de cirugía que lo piden quedarán sin instrumento.`)) return
    iniciar(async () => {
      const r = await eliminarInstrumento(instrumento.id)
      if (informar(r, 'Instrumento eliminado.')) {
        marcarCambios(false)
        alBorrar()
        await refrescar()
      }
    })
  }

  const cargarUno = (archivos: FileList | null) => {
    if (!instrumento || !archivos?.[0]) return
    const archivo = archivos[0]
    iniciar(async () => {
      const subido = await subirModeloDeInstrumento(archivo, `${instrumento.nombre} · instrumental`)
      if (!subido.exito || !subido.datos) {
        informar(subido, '')
        return
      }
      const r = await enlazarModeloDeInstrumento(instrumento.id, subido.datos.id)
      if (informar(r, 'Modelo cargado.')) {
        marcarCambios(false)
        await refrescar()
      }
    })
  }

  const quitarModelo = () => {
    if (!instrumento || !window.confirm('¿Quitar el modelo de este instrumento? El archivo se queda en la biblioteca de modelos.')) return
    iniciar(async () => {
      const r = await quitarModeloDeInstrumento(instrumento.id)
      if (informar(r, 'Modelo quitado.')) {
        marcarCambios(false)
        await refrescar()
      }
    })
  }

  const guardarRetoques = () =>
    iniciar(async () => {
      if (!instrumento) return
      const completos: AjustesDeInstrumento = { ...retoques, articulaciones: Object.keys(articulaciones).length ? articulaciones : undefined }
      const r = await guardarRetoquesDeInstrumento(instrumento.id, completos)
      if (informar(r, 'Retoques guardados: es lo que carga el simulador.')) {
        setSucio(false)
        marcarCambios(false)
        await refrescar()
      }
    })

  const partes = info?.partes ?? []
  const partesRetocadas = Object.keys(retoques.partes ?? {}).length
  const elegidaDelModelo = partes.find((p) => p.nombre === parte) ?? null

  return (
    <>
      {/* ------------------------------------------------------------ visor */}
      <div className="atlas-centro">
        <div className="atlas-lienzo instr-lienzo">
          <VisorDeInstrumento
            url={modeloUrl}
            ajustes={retoques}
            articulaciones={articulaciones}
            seleccion={parte}
            herramienta={herramienta}
            puedeRetocar={esAdmin}
            rayosX={rayosX}
            ortografica={ortografica}
            alSeleccionar={setParte}
            alCargar={alCargarElModelo}
            alMoverParte={alMoverParte}
            mando={mando}
          />
          {!modeloUrl ? (
            <div className="atlas-cargando" style={{ background: 'transparent' }}>
              <p style={{ maxWidth: 360, textAlign: 'center' }}>
                {creando
                  ? 'Describa el instrumento a la derecha. El modelo 3D lo carga el administrador.'
                  : instrumento
                    ? esAdmin
                      ? 'Este instrumento todavía no tiene modelo 3D. Cárguelo en la pestaña «Modelo», o suba varios a la vez desde el listado.'
                      : 'Este instrumento todavía no tiene modelo 3D. Lo carga el administrador.'
                    : 'Elija un instrumento del listado para verlo aquí.'}
              </p>
            </div>
          ) : null}
          {errorDelModelo ? (
            <div className="admin-aviso admin-aviso-error" style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
              {errorDelModelo}
            </div>
          ) : null}
          {modeloUrl ? (
            <>
              <div className="atlas-flota-columna">
                <div className="atlas-herramientas-grupo atlas-flota atlas-flota-utiles" role="toolbar" aria-label="Herramientas">
                  <button type="button" className="atlas-herramienta" aria-pressed={herramienta === 'girar'} title="Girar la vista arrastrando; un clic elige una parte" onClick={() => setHerramienta('girar')}>
                    Girar
                  </button>
                  {esAdmin ? (
                    <>
                      <button type="button" className="atlas-herramienta" aria-pressed={herramienta === 'mover'} disabled={!parte} title="Mover la parte elegida con las asas" onClick={() => setHerramienta('mover')}>
                        Mover
                      </button>
                      <button type="button" className="atlas-herramienta" aria-pressed={herramienta === 'rotar'} disabled={!parte} title="Girar la parte elegida con las asas, sobre su propio origen" onClick={() => setHerramienta('rotar')}>
                        Rotar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="atlas-herramientas-grupo atlas-flota atlas-flota-vistas" role="toolbar" aria-label="Vistas">
                <button type="button" className="atlas-herramienta" onClick={() => mando.current?.mirarDesde('frente')}>
                  Frente
                </button>
                <button type="button" className="atlas-herramienta" onClick={() => mando.current?.mirarDesde('lateral')}>
                  Lateral
                </button>
                <button type="button" className="atlas-herramienta" onClick={() => mando.current?.mirarDesde('superior')}>
                  Superior
                </button>
                <button type="button" className="atlas-herramienta" aria-pressed={ortografica} title="Vista ortográfica, sin fuga" onClick={() => setOrtografica((v) => !v)}>
                  Orto
                </button>
                <button type="button" className="atlas-herramienta" aria-pressed={rayosX} title="Ver a través de lo que no está elegido" onClick={() => setRayosX((v) => !v)}>
                  Rayos X
                </button>
                <button type="button" className="atlas-herramienta" onClick={() => mando.current?.encuadrar()}>
                  Centrar
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Las articulaciones que declara el modelo, para probarlas aquí antes de llevarlo al simulador. */}
        {info && (info.meta?.articulaciones.length ?? 0) > 0 ? (
          <div className="instr-articulaciones atlas-panel" style={{ padding: '8px 12px' }}>
            {info.meta!.articulaciones.map((a) => (
              <label key={a.nombre} className="atlas-aspecto-fila">
                <span>{a.etiqueta}</span>
                <input
                  type="range"
                  min={a.min}
                  max={a.max}
                  step={a.unidad === '°' ? 0.5 : 0.1}
                  value={articulaciones[a.nombre] ?? a.inicial}
                  aria-label={`${a.etiqueta}, en ${a.unidad === '°' ? 'grados' : 'milímetros'}`}
                  onChange={(e) => {
                    setArticulaciones((antes) => ({ ...antes, [a.nombre]: Number(e.target.value) }))
                    hacerSucio()
                  }}
                />
                <span className="atlas-separador-valor">
                  {(articulaciones[a.nombre] ?? a.inicial).toFixed(a.unidad === '°' ? 0 : 1)} {a.unidad}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        <div className="atlas-panel" style={{ padding: '8px 12px' }} role="status" aria-live="polite">
          {instrumento ? (
            <span>
              <strong>{instrumento.nombre}</strong>
              {info ? ` · ${info.triangulos.toLocaleString('es-CL')} triángulos · ${info.caja.map((n) => Math.round(n)).join(' × ')} mm` : ''}
              {parte ? ` · elegida: ${parte}` : ''}
            </span>
          ) : (
            'Ningún instrumento elegido'
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ panel derecho */}
      <aside className="atlas-panel atlas-panel-derecho">
        <Pestanas
          base="instr"
          etiqueta="Instrumento"
          pestanas={[
            { id: 'ficha', etiqueta: 'Ficha' },
            { id: 'partes', etiqueta: partesRetocadas > 0 ? `Partes (${partesRetocadas})` : 'Partes' },
            { id: 'modelo', etiqueta: 'Modelo' },
          ]}
          activa={pestana}
          alCambiar={alCambiarPestana}
        />

        <PanelDePestana base="instr" id="ficha" activa={pestana}>
          {creando || instrumento ? (
            <div className="atlas-ficha">
              <label className="campo-etiqueta" htmlFor="instr-nombre">
                Nombre *
              </label>
              <input id="instr-nombre" className="campo-control" value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} />
              <label className="campo-etiqueta" htmlFor="instr-slug">
                Identificador del modelo
              </label>
              <input id="instr-slug" className="campo-control" value={formulario.slug} placeholder={slugDeInstrumento(formulario.nombre) || 'tijera-mayo'} onChange={(e) => setFormulario({ ...formulario, slug: e.target.value })} />
              <p className="campo-ayuda">El archivo «{slugDeInstrumento(formulario.slug || formulario.nombre) || 'nombre'}.glb» se enlaza solo con este instrumento.</p>
              <label className="campo-etiqueta" htmlFor="instr-cat">
                Categoría
              </label>
              <select id="instr-cat" className="campo-control" value={formulario.categoria} onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })}>
                {CATEGORIAS_DE_INSTRUMENTAL.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label className="campo-etiqueta" htmlFor="instr-icono">
                Icono de la bandeja
              </label>
              <select id="instr-icono" className="campo-control" value={formulario.icono} onChange={(e) => setFormulario({ ...formulario, icono: e.target.value })}>
                {ICONOS.map((i) => (
                  <option key={i} value={i}>
                    {ETIQUETA_DE_ICONO[i]}
                  </option>
                ))}
              </select>
              <label className="campo-etiqueta" htmlFor="instr-desc">
                Para qué sirve
              </label>
              <textarea id="instr-desc" className="campo-control" rows={3} value={formulario.descripcion} onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })} />
              <label className="campo-etiqueta" htmlFor="instr-esp">
                Medidas y especificaciones
              </label>
              <textarea id="instr-esp" className="campo-control" rows={4} value={formulario.especificaciones} onChange={(e) => setFormulario({ ...formulario, especificaciones: e.target.value })} />
              <div className="admin-acciones" style={{ marginTop: 8 }}>
                {creando ? (
                  <>
                    <button type="button" className="admin-btn admin-btn-primary" disabled={enCurso || !formulario.nombre.trim()} onClick={crear}>
                      Crear instrumento
                    </button>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={alCancelarCreacion}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="admin-btn admin-btn-primary" disabled={enCurso || !formulario.nombre.trim()} onClick={guardarFicha}>
                      Guardar ficha
                    </button>
                    {esAdmin ? (
                      <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={borrar}>
                        Eliminar
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {creando ? <p className="campo-ayuda">Al crearlo queda «Falta»: el modelo 3D lo carga el administrador.</p> : null}
            </div>
          ) : (
            <p className="campo-ayuda">Elija un instrumento del listado, o cree uno nuevo.</p>
          )}
        </PanelDePestana>

        <PanelDePestana base="instr" id="partes" activa={pestana}>
          {!modeloUrl ? (
            <p className="campo-ayuda">Sin modelo no hay partes que ver.</p>
          ) : !info ? (
            <p className="campo-ayuda">Cargando las partes…</p>
          ) : (
            <>
              {info.meta?.medidas ? (
                <p className="campo-ayuda">
                  <strong>En el archivo:</strong> {info.meta.medidas}
                </p>
              ) : null}
              <h3 className="atlas-subtitulo">Partes ({partes.filter((p) => p.tipo === 'malla').length} mallas)</h3>
              <ul className="instr-partes">
                {partes.map((p) => (
                  <li key={p.nombre} style={{ paddingLeft: profundidadDe(partes, p.nombre) * 14 }}>
                    <button type="button" className="instr-parte" aria-pressed={p.nombre === parte} onClick={() => setParte(p.nombre === parte ? null : p.nombre)}>
                      <span className="instr-muestra" style={{ background: p.color || 'transparent', borderStyle: p.tipo === 'malla' ? 'solid' : 'dashed' }} aria-hidden="true" />
                      <span>{p.nombre}</span>
                      {p.articulacion ? <em title={`Obedece a «${p.articulacion.mueve}»`}> ↻ {p.articulacion.mueve}</em> : null}
                      {retoques.partes?.[p.nombre] ? <strong title="Retocada"> •</strong> : null}
                    </button>
                  </li>
                ))}
              </ul>

              {elegidaDelModelo ? (
                <div className="atlas-ficha" style={{ marginTop: 12 }}>
                  <h3 className="atlas-subtitulo">{elegidaDelModelo.nombre}</h3>
                  <p className="campo-ayuda">
                    {elegidaDelModelo.tipo === 'malla' ? `Malla de ${elegidaDelModelo.triangulos.toLocaleString('es-CL')} triángulos · material «${elegidaDelModelo.material}»` : 'Nodo que agrupa o articula otras partes.'}
                    {elegidaDelModelo.articulacion ? ` Gira sobre su origen con la articulación «${elegidaDelModelo.articulacion.mueve}» (factor ${elegidaDelModelo.articulacion.factor}).` : ''}
                  </p>
                  {esAdmin ? (
                    <>
                      <label className="atlas-aspecto-fila">
                        <input type="checkbox" checked={retoques.partes?.[elegidaDelModelo.nombre]?.ocultar === true} onChange={(e) => cambiarRetoque(elegidaDelModelo.nombre, { ocultar: e.target.checked || undefined })} />
                        <span>Ocultar esta parte en el simulador</span>
                      </label>
                      {elegidaDelModelo.tipo === 'malla' ? (
                        <label className="atlas-aspecto-fila">
                          <span>Color</span>
                          <input type="color" value={retoques.partes?.[elegidaDelModelo.nombre]?.color ?? (elegidaDelModelo.color || '#aaaaaa')} onChange={(e) => cambiarRetoque(elegidaDelModelo.nombre, { color: e.target.value })} aria-label="Color propio de la parte" />
                          <button type="button" className="atlas-herramienta" disabled={!retoques.partes?.[elegidaDelModelo.nombre]?.color} onClick={() => cambiarRetoque(elegidaDelModelo.nombre, { color: undefined })}>
                            El del modelo
                          </button>
                        </label>
                      ) : null}
                      <p className="campo-ayuda">Con «Mover» o «Rotar» (arriba, en el visor) se corre la parte con las asas.</p>
                      <button type="button" className="admin-btn admin-btn-secondary" disabled={!retoques.partes?.[elegidaDelModelo.nombre]} onClick={() => cambiarRetoque(elegidaDelModelo.nombre, null)}>
                        Quitar los retoques de esta parte
                      </button>
                    </>
                  ) : (
                    <p className="campo-ayuda">Los retoques los hace el administrador.</p>
                  )}
                </div>
              ) : (
                <p className="campo-ayuda">Elija una parte en el visor o en la lista.</p>
              )}

              {esAdmin ? (
                <>
                  <div className="admin-acciones" style={{ marginTop: 12 }}>
                    <button type="button" className="admin-btn admin-btn-primary" disabled={enCurso || !sucio} onClick={guardarRetoques}>
                      Guardar retoques
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      disabled={!sucio}
                      onClick={() => {
                        setRetoques(instrumento?.ajustes ?? {})
                        setArticulaciones(Object.fromEntries((info?.meta?.articulaciones ?? []).map((a) => [a.nombre, guardadas.current?.[a.nombre] ?? a.inicial])))
                        setSucio(false)
                        marcarCambios(false)
                      }}
                    >
                      Descartar
                    </button>
                  </div>
                  <p className="campo-ayuda">Se guarda también la posición actual de los deslizadores de articulación, que es con la que abre el instrumento en el simulador.</p>
                </>
              ) : null}
            </>
          )}
        </PanelDePestana>

        <PanelDePestana base="instr" id="modelo" activa={pestana}>
          {!instrumento ? (
            <p className="campo-ayuda">Elija un instrumento del listado.</p>
          ) : (
            <div className="atlas-ficha">
              <p>
                <strong>{instrumento.modelo ? 'Tiene modelo 3D' : 'Falta el modelo 3D'}</strong>
              </p>
              {instrumento.modelo ? (
                <ul className="instr-datos">
                  <li>Archivo: {instrumento.modelo.nombre}</li>
                  <li>Peso: {formatearBytes(instrumento.modelo.bytes)}</li>
                  {info ? <li>Triángulos: {info.triangulos.toLocaleString('es-CL')}</li> : null}
                  {info?.meta?.articulaciones.length ? <li>Articulaciones: {info.meta.articulaciones.map((a) => a.etiqueta).join(', ')}</li> : <li>Sin articulaciones</li>}
                  <li>
                    <a href={instrumento.modelo.url.startsWith('http') ? instrumento.modelo.url : ruta(instrumento.modelo.url)} download>
                      Descargar el .glb
                    </a>
                  </li>
                </ul>
              ) : (
                <p className="campo-ayuda">
                  Se enlaza con el archivo «{instrumento.slug}.glb». Los modelos se generan con <code>scripts/instrumental/</code> y salen en <code>ejemplos/instrumental/</code>.
                </p>
              )}
              {esAdmin ? (
                <>
                  <label className="admin-btn admin-btn-primary instr-subir">
                    {instrumento.modelo ? 'Reemplazar el modelo…' : 'Cargar el modelo…'}
                    <input
                      type="file"
                      accept=".glb,model/gltf-binary"
                      hidden
                      disabled={enCurso}
                      onChange={(e) => {
                        cargarUno(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {instrumento.modelo ? (
                    <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={quitarModelo} style={{ marginTop: 8 }}>
                      Quitar el modelo
                    </button>
                  ) : null}
                  <p className="campo-ayuda">Solo .glb, hasta 5 MB. Un modelo nuevo descarta los retoques del anterior: apuntaban a nombres que pueden no existir.</p>
                </>
              ) : (
                <p className="campo-ayuda">El modelo lo carga el administrador.</p>
              )}
            </div>
          )}
          {resultadoDeCarga ? (
            <div className="admin-aviso admin-aviso-info" style={{ marginTop: 12 }}>
              <strong>Última carga por lotes</strong>
              <p>{resultadoDeCarga.ok.length} enlazados.</p>
              {resultadoDeCarga.fallas.length ? (
                <ul>
                  {resultadoDeCarga.fallas.map((f) => (
                    <li key={f.archivo}>
                      <code>{f.archivo}</code>: {f.motivo}
                    </li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="atlas-aviso-cerrar" aria-label="Cerrar el resumen" onClick={cerrarResultado}>
                ×
              </button>
            </div>
          ) : null}
        </PanelDePestana>
      </aside>
    </>
  )
}
