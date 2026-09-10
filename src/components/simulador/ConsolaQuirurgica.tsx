'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  evaluarGesto,
  fuerzaInicial,
  instruccionDelPaso,
  puntajeMaximo,
  RESULTADOS,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { desplazamientoCompleto, largoDelTrazo, medirReduccion, type EjeLargo } from '@/lib/reduccion'
import { Rico, tieneContenido } from '@/components/Rico'
import { IconoInstrumento } from './IconoInstrumento'
import type { MandoDelLienzo, Modo, PiezaDelCaso, Punto3 } from './LienzoQuirurgico'

/**
 * Consola de reducción y fijación de fracturas.
 *
 * El residente recorre el caso paso a paso: elige el instrumento de la bandeja,
 * traza la incisión sobre el modelo, reduce el fragmento y fija. Cada paso dice
 * qué se le mide, y la consola solo deja avanzar cuando el gesto sale bien.
 *
 * Lo que sostiene todo esto es el modelo: llega ya partido desde Blender, con
 * cada trozo como un objeto con nombre, y el caso declara qué es cada uno. La
 * consola no corta huesos ni adivina anatomía; enciende, apaga y mueve nodos
 * que alguien nombró.
 *
 * La aritmética no está aquí. La evaluación vive en `@/lib/simulador` y las
 * medidas de la reducción en `@/lib/reduccion`, las dos probadas sin navegador,
 * porque son la parte que puede estar mal sin que se note.
 */

// El motor 3D no viaja con la página: se carga cuando el residente abre un caso
// que de verdad tiene modelo.
const LienzoQuirurgico = dynamic(
  () => import('./LienzoQuirurgico').then((m) => m.LienzoQuirurgico),
  {
    ssr: false,
    loading: () => (
      <div className="consola-lienzo consola-lienzo-cargando">
        <span>Cargando el modelo…</span>
      </div>
    ),
  },
)

export interface PasoDeConsola extends PasoQuirurgico {
  id: string
  descripcion?: unknown
  riesgo?: unknown
  faseNombre?: string | null
  instrumentoNombre?: string | null
  /** Nombres de los nodos que se ven en este paso. Vacío: se mantiene lo anterior. */
  muestra?: string[]
}

export interface InstrumentoDeBandeja {
  id: string
  nombre: string
  icono?: string | null
}

export interface CasoDeConsola {
  nombre: string
  codigo: string | null
  hueso: string | null
  clasificacion: string | null
  tecnica: string | null
  modeloUrl: string | null
  milimetrosPorUnidad: number
  ejeLargo: EjeLargo
  piezas: PiezaDelCaso[]
  desplazamientoInicial: {
    x: number
    y: number
    z: number
    giroX: number
    giroY: number
    giroZ: number
  }
  pasos: PasoDeConsola[]
  instrumental: InstrumentoDeBandeja[]
}

interface Anotacion {
  texto: string
  clase: 'bien' | 'aviso' | 'grave'
}

const CAPAS = [
  { rol: 'piel', etiqueta: 'Piel' },
  { rol: 'musculo', etiqueta: 'Músculo' },
  { rol: 'hueso', etiqueta: 'Hueso' },
] as const

export function ConsolaQuirurgica({ caso }: { caso: CasoDeConsola }) {
  const mando = useRef<MandoDelLienzo | null>(null)

  const [indice, setIndice] = useState(0)
  const [modo, setModo] = useState<Modo>('orbitar')
  const [fluoroscopia, setFluoroscopia] = useState(false)
  const [instrumento, setInstrumento] = useState<string | null>(null)
  const [fuerza, setFuerza] = useState(() => fuerzaInicial(caso.pasos[0] ?? {}))
  const [trazo, setTrazo] = useState<Punto3[]>([])
  const [reduccion, setReduccion] = useState(() => medidaInicial(caso))
  const [giros, setGiros] = useState(() => ({
    x: caso.desplazamientoInicial.giroX,
    y: caso.desplazamientoInicial.giroY,
    z: caso.desplazamientoInicial.giroZ,
  }))
  const [puntaje, setPuntaje] = useState(0)
  const [resueltos, setResueltos] = useState<Set<string>>(new Set())
  const [registro, setRegistro] = useState<Anotacion[]>([])
  const [capasApagadas, setCapasApagadas] = useState<Set<string>>(() => new Set(['piel', 'musculo']))

  const paso = caso.pasos[indice]
  const terminado = indice >= caso.pasos.length
  const maximo = useMemo(() => puntajeMaximo(caso.pasos), [caso.pasos])

  const largoDelTrazoMm = useMemo(
    () => largoDelTrazo(trazo, caso.milimetrosPorUnidad),
    [trazo, caso.milimetrosPorUnidad],
  )

  /** Los nodos que deben verse ahora: los del paso, menos las capas apagadas. */
  const nodosVisibles = useCallback(
    (indicePaso: number, apagadas: Set<string>): string[] => {
      // El paso manda; si no dice nada, se hereda del último que dijera algo.
      let declarados: string[] | null = null
      for (let i = indicePaso; i >= 0; i--) {
        const m = caso.pasos[i]?.muestra
        if (m && m.length > 0) {
          declarados = m
          break
        }
      }
      const base = declarados ?? caso.piezas.filter((p) => p.rol !== 'implante').map((p) => p.nodo)
      const rolDe = new Map(caso.piezas.map((p) => [p.nodo, p.rol]))
      return base.filter((nodo) => {
        const rol = rolDe.get(nodo)
        return !rol || !apagadas.has(rol)
      })
    },
    [caso.pasos, caso.piezas],
  )

  const refrescarVisibles = useCallback(
    (indicePaso: number, apagadas: Set<string>) => {
      mando.current?.mostrar(nodosVisibles(indicePaso, apagadas))
    },
    [nodosVisibles],
  )

  const alternarCapa = (rol: string) => {
    const siguientes = new Set(capasApagadas)
    if (siguientes.has(rol)) siguientes.delete(rol)
    else siguientes.add(rol)
    setCapasApagadas(siguientes)
    refrescarVisibles(indice, siguientes)
  }

  const anotar = (texto: string, clase: Anotacion['clase']) =>
    setRegistro((previo) => [{ texto, clase }, ...previo].slice(0, 10))

  // ------------------------------------------------------------- aplicar
  function aplicarPaso() {
    if (!paso) return

    const evaluacion = evaluarGesto(paso, {
      instrumento,
      instrumentoNombre: caso.instrumental.find((i) => i.id === instrumento)?.nombre ?? null,
      trazo: largoDelTrazoMm,
      desplazamiento: reduccion.desplazamiento,
      diastasis: reduccion.diastasis,
      angulacion: reduccion.angulacion,
      fuerza,
    })

    const clase: Anotacion['clase'] =
      evaluacion.resultado === RESULTADOS.CORRECTO
        ? 'bien'
        : evaluacion.complicacion
          ? 'grave'
          : 'aviso'
    anotar(`${indice + 1}. ${evaluacion.mensaje}`, clase)

    if (!evaluacion.avanza) return

    // Los puntos se ganan una sola vez por paso: reintentar hasta acertar no
    // debe puntuar igual que acertar a la primera.
    if (!resueltos.has(paso.id)) {
      setPuntaje((n) => n + evaluacion.puntos)
      setResueltos((previos) => new Set(previos).add(paso.id))
    }

    const siguiente = indice + 1
    setIndice(siguiente)
    setInstrumento(null)
    setTrazo([])
    mando.current?.borrarTrazo()
    if (caso.pasos[siguiente]) setFuerza(fuerzaInicial(caso.pasos[siguiente]))
    refrescarVisibles(siguiente, capasApagadas)
  }

  function reiniciar() {
    setIndice(0)
    setModo('orbitar')
    setInstrumento(null)
    setFuerza(fuerzaInicial(caso.pasos[0] ?? {}))
    setTrazo([])
    setPuntaje(0)
    setResueltos(new Set())
    setRegistro([])
    mando.current?.borrarTrazo()
    colocarEnDesplazamientoInicial()
    refrescarVisibles(0, capasApagadas)
  }

  /**
   * Vuelve a medir preguntándole al lienzo dónde está el fragmento.
   *
   * Se pregunta y no se lleva la cuenta aparte: el fragmento lo mueve el ratón
   * dentro del lienzo y lo giran los controles de aquí, y dos contabilidades
   * paralelas de lo mismo acaban discrepando. La verdad está en la escena.
   */
  const recalcularMedidas = useCallback(() => {
    const estado = mando.current?.estadoDelFragmento()
    if (!estado) return
    const aMm = (u: number) => u * (caso.milimetrosPorUnidad || 1000)
    setReduccion(
      medirReduccion(
        { x: aMm(estado.posicion.x), y: aMm(estado.posicion.y), z: aMm(estado.posicion.z) },
        estado.giros,
        caso.ejeLargo,
      ),
    )
    setGiros(estado.giros)
  }, [caso.milimetrosPorUnidad, caso.ejeLargo])

  /** Deja el fragmento donde empieza el caso: desplazado, sin reducir. */
  const colocarEnDesplazamientoInicial = useCallback(() => {
    const d = caso.desplazamientoInicial
    const aUnidades = (mm: number) => mm / (caso.milimetrosPorUnidad || 1000)
    mando.current?.colocarFragmento(
      { x: aUnidades(d.x), y: aUnidades(d.y), z: aUnidades(d.z) },
      { x: d.giroX, y: d.giroY, z: d.giroZ },
    )
    setGiros({ x: d.giroX, y: d.giroY, z: d.giroZ })
    setReduccion(medidaInicial(caso))
  }, [caso])

  const girar = (eje: 'x' | 'y' | 'z', valor: number) => {
    const nuevos = { ...giros, [eje]: valor }
    setGiros(nuevos)
    mando.current?.girarFragmento(nuevos)
    recalcularMedidas()
  }

  // El código lo compone el servidor con el número del hueso y el de la
  // clasificación; aquí solo se muestra si existe.
  const codigo = caso.codigo

  // ------------------------------------------------------------- pintado
  if (!caso.modeloUrl) {
    return (
      <div className="admin-aviso admin-aviso-atencion">
        <strong>Este caso todavía no tiene modelo 3D.</strong> La consola necesita un archivo .glb
        con el hueso ya partido. Súbalo en Modelos 3D y asígnelo al caso.
      </div>
    )
  }

  if (caso.pasos.length === 0) {
    return (
      <div className="admin-aviso admin-aviso-atencion">
        <strong>Este caso todavía no tiene pasos escritos.</strong> Añádalos desde el panel.
      </div>
    )
  }

  return (
    <section className="consola">
      {/* --------------------------------------------------------- barra */}
      <header className="consola-barra">
        <div>
          <p className="consola-rotulo">Consola de reducción y fijación de fracturas</p>
          <h2 className="consola-titulo">{caso.nombre}</h2>
        </div>
        <dl className="consola-datos">
          {caso.hueso ? (
            <div>
              <dt>Hueso</dt>
              <dd>{caso.hueso}</dd>
            </div>
          ) : null}
          {caso.clasificacion ? (
            <div>
              <dt>Clasificación AO</dt>
              <dd>{caso.clasificacion}</dd>
            </div>
          ) : null}
          {caso.tecnica ? (
            <div>
              <dt>Técnica</dt>
              <dd>{caso.tecnica}</dd>
            </div>
          ) : null}
        </dl>
        <div className="consola-puntaje">
          <span className="consola-puntaje-numero">{puntaje}</span>
          <span className="consola-puntaje-total">/ {maximo}</span>
          <button type="button" className="consola-boton" onClick={reiniciar}>
            Reiniciar caso
          </button>
        </div>
      </header>

      <div className="consola-cuerpo">
        {/* ------------------------------------------------ panel izquierdo */}
        <aside className="consola-panel consola-panel-izq">
          <h3 className="consola-subtitulo">Capas</h3>
          <ul className="consola-capas">
            {CAPAS.map((capa) => {
              const hay = caso.piezas.some((p) => p.rol === capa.rol)
              return (
                <li key={capa.rol}>
                  <label className={hay ? '' : 'consola-capa-vacia'}>
                    <input
                      type="checkbox"
                      checked={!capasApagadas.has(capa.rol)}
                      disabled={!hay}
                      onChange={() => alternarCapa(capa.rol)}
                    />
                    <span>{capa.etiqueta}</span>
                  </label>
                </li>
              )
            })}
          </ul>

          <h3 className="consola-subtitulo">Modo</h3>
          <div className="consola-modos">
            {(
              [
                ['orbitar', 'Orbitar'],
                ['trazar', 'Trazar'],
                ['mover', 'Mover'],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={`consola-modo${modo === valor ? ' activo' : ''}`}
                aria-pressed={modo === valor}
                onClick={() => setModo(valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="consola-boton consola-boton-ancho"
            onClick={() => mando.current?.encuadrar()}
          >
            Encuadrar
          </button>
        </aside>

        {/* -------------------------------------------------------- lienzo */}
        <div className="consola-centro">
          <div className="consola-lienzo-marco">
            <LienzoQuirurgico
              url={caso.modeloUrl}
              piezas={caso.piezas}
              modo={modo}
              fluoroscopia={fluoroscopia}
              alTrazar={setTrazo}
              alMoverFragmento={recalcularMedidas}
              // El fragmento se coloca desplazado cuando el archivo termina de
              // cargar, no antes: hasta ese momento no hay ningún nodo al que
              // aplicarle nada, y hacerlo en el montaje del componente dejaba
              // el hueso reducido y el caso resuelto de entrada.
              alCargar={() => {
                colocarEnDesplazamientoInicial()
                refrescarVisibles(indice, capasApagadas)
              }}
              mando={mando}
            />
            <button
              type="button"
              className={`consola-fluoro${fluoroscopia ? ' activo' : ''}`}
              aria-pressed={fluoroscopia}
              onClick={() => setFluoroscopia((v) => !v)}
            >
              Fluoroscopia
            </button>
            {codigo ? <span className="consola-codigo">{codigo}</span> : null}
          </div>

          <dl className="consola-medidas">
            <div>
              <dt>Desplazamiento</dt>
              <dd>{reduccion.desplazamiento} mm</dd>
              {/* De qué eje viene: sin esto, lo que queda fuera del plano que
                  se está mirando parece un número que no baja al arrastrar. */}
              {reduccion.desplazamiento > 0 ? (
                <dd className="consola-desglose">
                  {reduccion.lateral
                    .map(({ eje, mm }) => `${eje.toUpperCase()} ${mm}`)
                    .join(' · ')}
                </dd>
              ) : null}
            </div>
            <div>
              <dt>Angulación</dt>
              <dd>{reduccion.angulacion}°</dd>
            </div>
            <div>
              <dt>Diástasis</dt>
              <dd>{reduccion.diastasis} mm</dd>
            </div>
            <div>
              <dt>Incisión</dt>
              <dd>{largoDelTrazoMm} mm</dd>
            </div>
          </dl>
        </div>

        {/* ------------------------------------------------ panel derecho */}
        <aside className="consola-panel consola-panel-der">
          <h3 className="consola-subtitulo">Instrumental</h3>
          <ul className="consola-bandeja">
            {caso.instrumental.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  className={`instrumento${instrumento === it.id ? ' activo' : ''}`}
                  aria-pressed={instrumento === it.id}
                  onClick={() => setInstrumento(it.id)}
                >
                  <IconoInstrumento nombre={it.icono} />
                  <span>{it.nombre}</span>
                </button>
              </li>
            ))}
          </ul>

          {terminado ? (
            <div className="consola-fin">
              <strong>Caso terminado.</strong>
              <p>
                {puntaje} de {maximo} puntos.
              </p>
            </div>
          ) : (
            <div className="consola-objetivo">
              <h3 className="consola-subtitulo">
                Paso {indice + 1} · {paso.titulo}
              </h3>
              <p className="consola-instruccion">{instruccionDelPaso(paso)}</p>

              {paso.objetivo === 'trazo' ? (
                <button
                  type="button"
                  className="consola-boton consola-boton-ancho"
                  onClick={() => {
                    setTrazo([])
                    mando.current?.borrarTrazo()
                  }}
                >
                  Borrar trazo
                </button>
              ) : null}

              {paso.objetivo === 'reduccion' ? (
                <div className="consola-angulacion">
                  {/* El ratón traslada, que es un gesto de dos ejes; una
                      rotación tiene tres. Sin estos mandos, un caso que empieza
                      angulado no se podría reducir por mucho que se arrastrara,
                      y el residente no entendería por qué. */}
                  <p className="consola-instruccion">
                    Arrastre el fragmento para alinearlo y corrija la angulación aquí.
                  </p>
                  {(
                    [
                      ['z', 'Varo / valgo'],
                      ['x', 'Ante / recurvatum'],
                      ['y', 'Rotación'],
                    ] as const
                  ).map(([eje, etiqueta]) => (
                    <label key={eje} className="consola-giro">
                      <span>
                        {etiqueta} · {Math.round(giros[eje])}°
                      </span>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={0.5}
                        value={giros[eje]}
                        onChange={(e) => girar(eje, Number(e.target.value))}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="consola-boton consola-boton-ancho"
                    onClick={colocarEnDesplazamientoInicial}
                  >
                    Volver al desplazamiento inicial
                  </button>
                </div>
              ) : null}

              {paso.objetivo === 'fuerza' ? (
                <label className="consola-fuerza">
                  <span>Fuerza · {fuerza} N</span>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    value={fuerza}
                    onChange={(e) => setFuerza(Number(e.target.value))}
                  />
                </label>
              ) : null}

              <button
                type="button"
                className="consola-aplicar"
                onClick={aplicarPaso}
                disabled={!instrumento}
              >
                Aplicar paso
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ---------------------------------------------------------- pasos */}
      <ol className="consola-pasos">
        {caso.pasos.map((p, i) => (
          <li
            key={p.id}
            className={`consola-paso${i === indice ? ' actual' : ''}${
              resueltos.has(p.id) ? ' resuelto' : ''
            }`}
          >
            <span className="consola-paso-numero">Paso {i + 1}</span>
            <span className="consola-paso-titulo">{p.titulo}</span>
            {p.faseNombre ? <span className="consola-paso-fase">{p.faseNombre}</span> : null}
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------- retroalimentación */}
      <div className="consola-pie">
        <section>
          <h3 className="consola-subtitulo">Qué se hace en este paso</h3>
          {paso && tieneContenido(paso.descripcion) ? (
            <Rico valor={paso.descripcion} />
          ) : (
            <p className="consola-vacio">Sin descripción escrita para este paso.</p>
          )}
          {paso && tieneContenido(paso.riesgo) ? (
            <div className="consola-riesgo">
              <h4>Estructura o principio en juego</h4>
              <Rico valor={paso.riesgo} />
            </div>
          ) : null}
        </section>

        <section>
          <h3 className="consola-subtitulo">Retroalimentación clínica</h3>
          {registro.length === 0 ? (
            <p className="consola-vacio">Todavía no ha aplicado ningún paso.</p>
          ) : (
            <ul className="consola-registro">
              {registro.map((linea, i) => (
                <li key={i} className={linea.clase}>
                  {linea.texto}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

/** Las medidas del caso recién abierto, antes de tocar nada. */
function medidaInicial(caso: CasoDeConsola) {
  const d = desplazamientoCompleto(caso.desplazamientoInicial)
  return medirReduccion(
    { x: d.x, y: d.y, z: d.z },
    { x: d.giroX, y: d.giroY, z: d.giroZ },
    caso.ejeLargo,
  )
}
