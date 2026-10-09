'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import {
  ConsolaQuirurgica,
  type VistaDelEnsayo,
} from '@/components/simulador/ConsolaQuirurgica'
import type { MandoDelLienzo } from '@/components/simulador/LienzoQuirurgico'
import { listarInstrumental } from '@/app/(frontend)/acciones/instrumental'
import { useConfirmar } from '@/components/ui/Confirmar'
import type { Campo } from '@/admin/esquema'
import { casoDesdeElFormulario, type InstrumentoParaElEditor } from '@/lib/casoQuirurgico'
import {
  agregarPieza,
  cambiarRolDePieza,
  desplazamientoEnMilimetros,
  hayFragmento,
  piezasHuerfanas,
  propuestasDelModelo,
  quitarPieza,
  rellenarDesdeElModelo,
  type PiezaEnEdicion,
  type RolDePieza,
} from '@/lib/piezasDelCaso'
import { CLAVE_DE_FILA, nuevaClave } from '@/admin/identidadDeBloques'
import { FilaDeCampos, valoresPorOmision, type Relaciones } from './Campos'

/**
 * El editor de un caso quirúrgico: la consola del residente con el panel de
 * edición encima (D-166).
 *
 * Antes el autor escribía los pasos en un formulario y, para ver cómo quedaban,
 * tenía que guardar y abrir el simulador en otra pestaña. Ahora escribe sobre la
 * propia consola: lo que cambia en el panel cambia en el lienzo, en las medidas,
 * en la bandeja y en el texto que lee el residente, y «Probar este paso» dice si
 * el gesto que se acaba de hacer pasaría con las tolerancias que se acaban de
 * escribir.
 *
 * No hay un segundo lienzo ni una segunda lista de pasos: el panel escribe en
 * los mismos valores del formulario que el resto de la ficha, y la consola se
 * rehace de ellos con `casoDesdeElFormulario`, la misma traducción que usa la
 * página del residente. Guardar, publicar, revisar y recuperar copias siguen
 * siendo del formulario de siempre.
 */

type Fila = Record<string, unknown>

/** Qué campos del paso importan según lo que se evalúa; el resto se esconde. */
const CAMPOS_DEL_OBJETIVO: Record<string, string[]> = {
  instrumento: [],
  trazo: ['trazoMinimo', 'trazoMaximo'],
  reduccion: ['toleranciaDesplazamiento', 'toleranciaDiastasis', 'toleranciaAngulacion'],
  fuerza: ['fuerzaMinima', 'fuerzaMaxima'],
}
const TODOS_LOS_RANGOS = Object.values(CAMPOS_DEL_OBJETIVO).flat()

const ROLES: { valor: RolDePieza; etiqueta: string }[] = [
  { valor: 'piel', etiqueta: 'Piel' },
  { valor: 'musculo', etiqueta: 'Músculo' },
  { valor: 'hueso', etiqueta: 'Hueso fijo' },
  { valor: 'fragmento', etiqueta: 'Fragmento móvil' },
  { valor: 'implante', etiqueta: 'Implante' },
]

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const redondear = (n: number) => Math.round(n * 10) / 10

export function EditorDelSimulador({
  campos,
  valores,
  alCambiar,
  relaciones,
  alRecargarRelacion,
  documentoId,
}: {
  /** Los campos de la sección, tal cual los declara el esquema. */
  campos: Campo[]
  valores: Fila
  alCambiar: (nombre: string, valor: unknown) => void
  relaciones: Relaciones
  alRecargarRelacion?: (coleccion: string) => void
  documentoId: string | null
}) {
  const confirmar = useConfirmar()
  const mando = useRef<MandoDelLienzo | null>(null)
  const [indice, setIndice] = useState(0)
  const [pestana, setPestana] = useState<'paso' | 'piezas' | 'caso'>('paso')
  const [instrumentos, setInstrumentos] = useState<InstrumentoParaElEditor[]>([])
  const [errorDeInstrumentos, setErrorDeInstrumentos] = useState<string | null>(null)
  const [clasicoAbierto, setClasicoAbierto] = useState(false)

  // El catálogo entero con sus modelos: es lo que la bandeja del editor enseña.
  useEffect(() => {
    let vivo = true
    void listarInstrumental().then((r) => {
      if (!vivo) return
      if (!r.exito || !r.datos) {
        setErrorDeInstrumentos(r.mensaje ?? 'No se pudo leer el instrumental.')
        return
      }
      setInstrumentos(
        r.datos.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          slug: i.slug,
          icono: i.icono,
          descripcion: i.descripcion,
          categoria: i.categoria,
          modeloUrl: i.modelo?.url ?? null,
          ajustes: i.ajustes,
        })),
      )
    })
    return () => {
      vivo = false
    }
  }, [])

  const campoDePasos = campos.find((c) => c.nombre === 'pasos' && c.tipo === 'lista')
  const camposDelPaso = campoDePasos && campoDePasos.tipo === 'lista' ? campoDePasos.campos : []
  const camposDelCaso = campos.filter((c) => c.nombre !== 'pasos' && c.nombre !== 'piezas')

  const pasos = useMemo(
    () => (Array.isArray(valores.pasos) ? (valores.pasos as Fila[]) : []),
    [valores.pasos],
  )
  const piezas = useMemo(
    () => (Array.isArray(valores.piezas) ? (valores.piezas as PiezaEnEdicion[]) : []),
    [valores.piezas],
  )
  const indiceVigente = Math.min(indice, Math.max(0, pasos.length - 1))
  const pasoActual = pasos[indiceVigente]

  const caso = useMemo(
    () =>
      casoDesdeElFormulario(valores, {
        opciones: relaciones,
        instrumentos,
      }),
    [valores, relaciones, instrumentos],
  )

  // ------------------------------------------------------------ los pasos
  const escribirPasos = useCallback((nuevos: Fila[]) => alCambiar('pasos', nuevos), [alCambiar])

  const cambiarDelPaso = (nombre: string, valor: unknown) =>
    escribirPasos(pasos.map((p, i) => (i === indiceVigente ? { ...p, [nombre]: valor } : p)))

  const escribirVariosDelPaso = (cambios: Fila) =>
    escribirPasos(pasos.map((p, i) => (i === indiceVigente ? { ...p, ...cambios } : p)))

  const anadirPaso = () => {
    const nuevo = { ...valoresPorOmision(camposDelPaso), [CLAVE_DE_FILA]: nuevaClave() }
    escribirPasos([...pasos, nuevo])
    setIndice(pasos.length)
    setPestana('paso')
  }

  const moverPaso = (direccion: -1 | 1) => {
    const destino = indiceVigente + direccion
    if (destino < 0 || destino >= pasos.length) return
    const copia = [...pasos]
    const [movido] = copia.splice(indiceVigente, 1)
    copia.splice(destino, 0, movido)
    escribirPasos(copia)
    setIndice(destino)
  }

  const quitarPaso = async () => {
    if (!pasoActual) return
    const si = await confirmar({
      titulo: `¿Quitar el paso ${indiceVigente + 1}?`,
      mensaje: 'Se pierde lo que tenga escrito.',
      confirmar: 'Quitar paso',
      peligro: true,
    })
    if (!si) return
    escribirPasos(pasos.filter((_, i) => i !== indiceVigente))
    setIndice(Math.max(0, indiceVigente - 1))
  }

  // ------------------------------------------------------- la bandeja
  const idsDeLaBandeja = (): string[] =>
    (Array.isArray(valores.instrumental) ? (valores.instrumental as unknown[]) : []).map((v) =>
      typeof v === 'object' && v !== null ? String((v as { id?: unknown }).id) : String(v),
    )

  const alternarEnLaBandeja = (id: string) => {
    const actuales = idsDeLaBandeja()
    alCambiar('instrumental', actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id])
  }

  // ------------------------------------------------------- las piezas
  const escalaMm = esNumero(valores.milimetrosPorUnidad) && valores.milimetrosPorUnidad > 0 ? valores.milimetrosPorUnidad : 1000

  const sinPasos = pasos.length === 0
  const sinModelo = !caso.modeloUrl

  if (sinModelo || sinPasos) {
    return (
      <div className="editor-simulador editor-simulador-vacio">
        <div className="editor-simulador-aviso" role="status">
          <strong>
            {sinModelo ? 'Falta elegir el modelo 3D del caso.' : 'Este caso todavía no tiene pasos.'}
          </strong>
          <p>
            {sinModelo
              ? 'Elija abajo el modelo 3D: en cuanto lo haga, aparece aquí la consola tal como la ve el residente, y los pasos se escriben sobre ella.'
              : 'Añada el primero y se abre la consola: desde ahí se escriben todos los demás.'}
          </p>
          {!sinModelo ? (
            <button type="button" className="admin-btn admin-btn-primary" onClick={anadirPaso}>
              <Plus size={16} aria-hidden /> Añadir el primer paso
            </button>
          ) : null}
          {errorDeInstrumentos ? <p className="campo-error">{errorDeInstrumentos}</p> : null}
        </div>
        <FilaDeCampos
          campos={camposDelCaso}
          valores={valores}
          alCambiar={alCambiar}
          relaciones={relaciones}
          alRecargarRelacion={alRecargarRelacion}
        />
      </div>
    )
  }

  const camposVisiblesDelPaso = (): Campo[] => {
    const objetivo = typeof pasoActual?.objetivo === 'string' ? pasoActual.objetivo : 'instrumento'
    const delObjetivo = CAMPOS_DEL_OBJETIVO[objetivo] ?? []
    return camposDelPaso.filter((c) => {
      if (!TODOS_LOS_RANGOS.includes(c.nombre)) return true
      // Un rango que no toca a este objetivo se esconde, salvo que ya tenga un
      // valor: escondido y lleno, el servidor lo rechazaría (`exigeAlguno` /
      // `prohibeAlguno`) y nadie sabría dónde está.
      return delObjetivo.includes(c.nombre) || esNumero(pasoActual?.[c.nombre])
    })
  }

  const panel = (vivo: VistaDelEnsayo) => (
    <>
      <div className="editor-simulador-pestanas" role="tablist" aria-label="Qué se edita">
        {(
          [
            ['paso', `Paso ${indiceVigente + 1}`],
            ['piezas', 'Piezas'],
            ['caso', 'El caso'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={pestana === valor}
            className={`editor-simulador-pestana${pestana === valor ? ' activa' : ''}`}
            onClick={() => setPestana(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'paso' && pasoActual ? (
        <div className="editor-simulador-cuerpo" role="tabpanel">
          <FilaDeCampos
            campos={camposVisiblesDelPaso()}
            valores={pasoActual}
            alCambiar={cambiarDelPaso}
            relaciones={relaciones}
            alRecargarRelacion={alRecargarRelacion}
          />
          <CapturasDelPaso
            paso={pasoActual}
            vivo={vivo}
            mando={mando}
            escribir={escribirVariosDelPaso}
          />
        </div>
      ) : null}

      {pestana === 'piezas' ? (
        <div className="editor-simulador-cuerpo" role="tabpanel">
          <PanelDePiezas
            piezas={piezas}
            vivo={vivo}
            mando={mando}
            escalaMm={escalaMm}
            desplazamiento={(valores.desplazamientoInicial ?? {}) as Fila}
            alCambiarPiezas={(nuevas) => alCambiar('piezas', nuevas)}
            alCambiarDesplazamiento={(nuevo) =>
              alCambiar('desplazamientoInicial', { ...(valores.desplazamientoInicial as Fila), ...nuevo })
            }
          />
        </div>
      ) : null}

      {pestana === 'caso' ? (
        <div className="editor-simulador-cuerpo" role="tabpanel">
          <FilaDeCampos
            campos={camposDelCaso}
            valores={valores}
            alCambiar={alCambiar}
            relaciones={relaciones}
            alRecargarRelacion={alRecargarRelacion}
          />
        </div>
      ) : null}
    </>
  )

  return (
    <div className="editor-simulador">
      <ConsolaQuirurgica
        // Con otro modelo se rehace entera: el lienzo ya lo hace solo, pero el
        // estado de la consola —capas, avisos, ensayo— era del modelo anterior.
        key={caso.modeloUrl}
        caso={caso}
        documentoId={documentoId ?? ''}
        alMarcarComoLeido={() => {}}
        mandoRef={mando}
        editor={{
          indice: indiceVigente,
          alCambiarIndice: setIndice,
          panel,
          barraDePasos: (
            <>
              <button type="button" className="consola-boton" onClick={anadirPaso}>
                <Plus size={14} aria-hidden /> Paso
              </button>
              <button
                type="button"
                className="consola-boton"
                onClick={() => moverPaso(-1)}
                disabled={indiceVigente === 0}
                aria-label="Mover el paso hacia atrás"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="consola-boton"
                onClick={() => moverPaso(1)}
                disabled={indiceVigente >= pasos.length - 1}
                aria-label="Mover el paso hacia delante"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
              <button
                type="button"
                className="consola-boton"
                onClick={() => void quitarPaso()}
                aria-label={`Quitar el paso ${indiceVigente + 1}`}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </>
          ),
          alSenalar: (nodo) => {
            const propuesta = propuestasDelModelo(mando.current?.datosDeLosNodos() ?? []).find(
              (p) => p.nodo === nodo,
            )
            const nuevas = agregarPieza(piezas, nodo, propuesta)
            if (nuevas !== piezas) alCambiar('piezas', nuevas)
          },
          alAlternarEnLaBandeja: alternarEnLaBandeja,
          alUsarEnElPaso: (id) => escribirVariosDelPaso({ instrumento: id, instrumentoPropuesto: '' }),
          instrumentoDelPaso:
            pasoActual?.instrumento === undefined || pasoActual.instrumento === null
              ? null
              : typeof pasoActual.instrumento === 'object'
                ? String((pasoActual.instrumento as { id?: unknown }).id)
                : String(pasoActual.instrumento),
        }}
      />
      {errorDeInstrumentos ? <p className="campo-error">{errorDeInstrumentos}</p> : null}

      {/* Los mismos campos, como formulario de toda la vida: para quien prefiera
          escribir las cifras o use un lector de pantalla, y por si alguna vez
          hace falta un campo que el panel todavía no enseña. Solo se monta con
          el detalle abierto: trae su propio visor 3D y no tiene sentido pagar un
          segundo lienzo para algo que casi nunca se abre. */}
      <details
        className="editor-simulador-clasico"
        onToggle={(e) => setClasicoAbierto((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Ver todos los campos como formulario</summary>
        {clasicoAbierto ? (
          <FilaDeCampos
            campos={campos}
            valores={valores}
            alCambiar={alCambiar}
            relaciones={relaciones}
            alRecargarRelacion={alRecargarRelacion}
          />
        ) : null}
      </details>
    </div>
  )
}

/**
 * Los botones que llenan un rango con lo que el autor acaba de hacer en el
 * lienzo: trazar la incisión y «usarla», dejar el fragmento en el límite de lo
 * aceptable y «fijarlo». Es más rápido y más fiel que adivinar milímetros, que
 * es lo que obliga a hacer el formulario.
 */
function CapturasDelPaso({
  paso,
  vivo,
  mando,
  escribir,
}: {
  paso: Fila
  vivo: VistaDelEnsayo
  mando: React.MutableRefObject<MandoDelLienzo | null>
  escribir: (cambios: Fila) => void
}) {
  const objetivo = typeof paso.objetivo === 'string' ? paso.objetivo : 'instrumento'
  return (
    <div className="editor-simulador-capturas">
      <p className="campo-ayuda">
        Desde el lienzo: haga el gesto y capture el resultado en vez de escribir las cifras.
      </p>
      <div className="editor-simulador-capturas-botones">
        {objetivo === 'trazo' ? (
          <button
            type="button"
            className="consola-boton"
            disabled={vivo.trazoMm <= 0}
            onClick={() =>
              escribir({
                trazoMinimo: redondear(vivo.trazoMm * 0.8),
                trazoMaximo: redondear(vivo.trazoMm * 1.2),
              })
            }
          >
            {vivo.trazoMm > 0
              ? `Usar la incisión trazada (${vivo.trazoMm} mm ± 20 %)`
              : 'Trace una incisión para capturarla'}
          </button>
        ) : null}
        {objetivo === 'reduccion' ? (
          <button
            type="button"
            className="consola-boton"
            onClick={() =>
              escribir({
                toleranciaDesplazamiento: Math.max(1, Math.ceil(vivo.reduccion.desplazamiento)),
                toleranciaDiastasis: Math.max(1, Math.ceil(vivo.reduccion.diastasis)),
                toleranciaAngulacion: Math.max(1, Math.ceil(vivo.reduccion.angulacion)),
              })
            }
          >
            Fijar como límite lo que mide el fragmento ahora ({vivo.reduccion.desplazamiento} mm ·{' '}
            {vivo.reduccion.diastasis} mm · {vivo.reduccion.angulacion}°)
          </button>
        ) : null}
        {objetivo === 'fuerza' ? (
          <button
            type="button"
            className="consola-boton"
            onClick={() =>
              escribir({
                fuerzaMinima: Math.round(vivo.fuerza * 0.75),
                fuerzaMaxima: Math.round(vivo.fuerza * 1.25),
              })
            }
          >
            Usar la fuerza del deslizador ({vivo.fuerza} N ± 25 %)
          </button>
        ) : null}
        <button
          type="button"
          className="consola-boton"
          onClick={() =>
            escribir({
              muestra: (mando.current?.nodosVisibles() ?? []).map((nodo) => ({ nodo, [CLAVE_DE_FILA]: nuevaClave() })),
            })
          }
        >
          Que este paso muestre lo que se ve ahora
        </button>
      </div>
    </div>
  )
}

/**
 * La lista de piezas del caso, sobre el lienzo de la consola.
 *
 * Es el taller de piezas de siempre sin su visor: el que señala, aísla y
 * arrastra es el lienzo de la consola, que ya está en pantalla. Señalar se hace
 * con el modo «Señalar» del panel izquierdo.
 */
function PanelDePiezas({
  piezas,
  vivo,
  mando,
  escalaMm,
  desplazamiento,
  alCambiarPiezas,
  alCambiarDesplazamiento,
}: {
  piezas: PiezaEnEdicion[]
  vivo: VistaDelEnsayo
  mando: React.MutableRefObject<MandoDelLienzo | null>
  escalaMm: number
  desplazamiento: Fila
  alCambiarPiezas: (nuevas: PiezaEnEdicion[]) => void
  alCambiarDesplazamiento: (nuevo: Fila) => void
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const propuestas = propuestasDelModelo(vivo.datosDeLosNodos)
  const huerfanas = vivo.modeloCargado ? piezasHuerfanas(piezas, vivo.nodosDelArchivo) : []
  const sinUsar = vivo.nodosDelArchivo.filter((n) => !piezas.some((p) => p.nodo === n))

  const rellenar = () => {
    const resultado = rellenarDesdeElModelo(piezas, propuestas)
    if (resultado.piezas === piezas) {
      setAviso('Todas las piezas del modelo ya estaban en la lista. No se cambió nada.')
      return
    }
    alCambiarPiezas(resultado.piezas)
    setAviso(
      `${resultado.nuevas > 0 ? `Añadidas ${resultado.nuevas}` : 'Ninguna nueva'}` +
        `${resultado.etiquetadas > 0 ? `, etiquetadas ${resultado.etiquetadas}` : ''} desde el modelo.` +
        (hayFragmento(resultado.piezas) ? '' : ' Falta marcar cuál es el fragmento móvil.'),
    )
  }

  const quitarLasQueNoEstan = () => {
    let nuevas = piezas
    for (const nodo of huerfanas) nuevas = quitarPieza(nuevas, nodo)
    alCambiarPiezas(nuevas)
    setAviso(`Quitadas ${huerfanas.length} piezas que no estaban en el archivo.`)
  }

  const capturar = () => {
    if (!hayFragmento(piezas)) {
      setAviso('Marque antes una pieza como fragmento móvil: es la que se desplaza.')
      return
    }
    const estado = mando.current?.estadoDelFragmento()
    if (!estado) {
      setAviso('Espere a que el modelo termine de cargar.')
      return
    }
    const quieto = [
      estado.posicion.x,
      estado.posicion.y,
      estado.posicion.z,
      estado.giros.x,
      estado.giros.y,
      estado.giros.z,
    ].every((n) => n === 0)
    if (quieto) {
      setAviso('El fragmento está en su sitio: con el modo «Mover», arrástrelo antes de capturar.')
      return
    }
    alCambiarDesplazamiento(desplazamientoEnMilimetros(estado, escalaMm))
    setAviso('Desplazamiento inicial capturado.')
  }

  return (
    <div className="editor-simulador-piezas">
      {huerfanas.length > 0 ? (
        <div className="editor-simulador-alerta" role="alert">
          <strong>
            {huerfanas.length === piezas.length
              ? 'Ninguna de las piezas del caso está en este modelo.'
              : `${huerfanas.length} de ${piezas.length} piezas no están en este modelo.`}
          </strong>
          <p>
            El lienzo muestra el modelo entero mientras tanto. Suele pasar al volver a exportar el
            hueso con otros nombres.
          </p>
          <div className="editor-simulador-capturas-botones">
            {propuestas.length > 0 ? (
              <button type="button" className="consola-boton" onClick={rellenar}>
                Rellenar desde el modelo
              </button>
            ) : null}
            <button type="button" className="consola-boton" onClick={quitarLasQueNoEstan}>
              Quitar las que no están
            </button>
          </div>
        </div>
      ) : null}

      <p className="campo-ayuda">
        Con el modo <strong>Señalar</strong> (a la izquierda), pinche un trozo del modelo y se añade
        con su nombre exacto. Marque un solo <strong>fragmento móvil</strong>: es el que el residente
        reduce. Con <strong>Mover</strong> colóquelo como quiere enseñar la fractura y capture.
      </p>

      <div className="editor-simulador-capturas-botones">
        {propuestas.length > 0 && huerfanas.length === 0 ? (
          <button type="button" className="consola-boton" onClick={rellenar}>
            Rellenar desde el modelo ({propuestas.length})
          </button>
        ) : null}
        <button type="button" className="consola-boton" onClick={capturar}>
          Capturar el desplazamiento actual como inicial
        </button>
      </div>
      <p className="campo-ayuda" role="status">
        {aviso}
      </p>

      {sinUsar.length > 0 ? (
        <details className="editor-simulador-sinusar">
          <summary>En el archivo y sin usar ({sinUsar.length})</summary>
          <div className="editor-simulador-capturas-botones">
            {sinUsar.map((nodo) => (
              <button
                key={nodo}
                type="button"
                className="consola-boton"
                onClick={() =>
                  alCambiarPiezas(
                    agregarPieza(piezas, nodo, propuestas.find((p) => p.nodo === nodo)),
                  )
                }
              >
                {nodo}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <table className="editor-simulador-tabla">
        <thead>
          <tr>
            <th scope="col">Objeto</th>
            <th scope="col">Qué es</th>
            <th scope="col" aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {piezas.map((p, i) => {
            const nodo = typeof p.nodo === 'string' ? p.nodo : ''
            const existe = !vivo.modeloCargado || !huerfanas.includes(nodo)
            return (
              <tr key={`${nodo}-${i}`} className={existe ? undefined : 'huerfana'}>
                <th scope="row">
                  <code>{nodo || '(sin nombre)'}</code>
                  {!existe ? <span className="editor-simulador-falta"> no está en el archivo</span> : null}
                </th>
                <td>
                  <select
                    className="campo-control"
                    aria-label={`Qué es «${nodo || 'sin nombre'}»`}
                    value={typeof p.rol === 'string' ? p.rol : 'hueso'}
                    onChange={(e) => alCambiarPiezas(cambiarRolDePieza(piezas, nodo, e.target.value as RolDePieza))}
                  >
                    {ROLES.map((r) => (
                      <option key={r.valor} value={r.valor}>
                        {r.etiqueta}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="editor-simulador-acciones">
                  <button
                    type="button"
                    className="consola-boton"
                    onClick={() => mando.current?.mostrar([nodo])}
                    aria-label={`Ver solo «${nodo || 'sin nombre'}»`}
                    disabled={!existe}
                  >
                    Solo esto
                  </button>
                  <button
                    type="button"
                    className="consola-boton"
                    onClick={() => alCambiarPiezas(quitarPieza(piezas, nodo))}
                    aria-label={`Quitar «${nodo || 'sin nombre'}» de la lista`}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {piezas.length > 0 ? (
        <button type="button" className="consola-boton" onClick={() => mando.current?.mostrar(null)}>
          Ver todo otra vez
        </button>
      ) : (
        <p className="campo-ayuda">Todavía no hay piezas: la consola muestra el modelo entero.</p>
      )}
    </div>
  )
}
