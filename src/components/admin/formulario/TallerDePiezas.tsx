'use client'

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { MandoDelLienzo, Modo, PiezaDelCaso } from '@/components/simulador/LienzoQuirurgico'
import {
  agregarPieza,
  cambiarRolDePieza,
  desplazamientoEnMilimetros,
  hayFragmento,
  nodosDeclarados,
  piezasHuerfanas,
  piezasSinUsar,
  quitarPieza,
  type PiezaEnEdicion,
  type RolDePieza,
} from '@/lib/piezasDelCaso'

/**
 * Taller de piezas de un caso quirúrgico.
 *
 * Abre el modelo que el autor eligió arriba y le deja señalar cada trozo con el
 * ratón. Antes, esas filas pedían el nombre exacto del objeto de Blender
 * escrito de memoria, y equivocarse en una letra no da error: deja una pieza
 * que no se enciende ni se apaga y una capa que nunca aparece. Aquí el nombre
 * no se escribe, se pincha.
 *
 * Y el desplazamiento inicial deja de ser seis números imaginados. Se coloca el
 * fragmento con el ratón hasta que la fractura se vea como se quiere enseñar y
 * un botón los rellena. Es el mismo gesto del editor de encuadre, que ya se usa
 * en las fichas, y por la misma razón: un número que hay que adivinar se acaba
 * dejando en cero.
 *
 * **El visor es el mismo que ve el residente**, no una imitación. Un taller
 * cuya vista previa no coincide con el resultado es peor que no tener taller.
 */

const LienzoQuirurgico = dynamic(
  () => import('@/components/simulador/LienzoQuirurgico').then((m) => m.LienzoQuirurgico),
  {
    ssr: false,
    loading: () => (
      <div className="taller-piezas-marco">
        <span className="visor-3d-nota">Cargando visor…</span>
      </div>
    ),
  },
)

/** Los cinco papeles, con el nombre que entiende un traumatólogo. */
const ROLES: { valor: PiezaDelCaso['rol']; etiqueta: string }[] = [
  { valor: 'piel', etiqueta: 'Piel' },
  { valor: 'musculo', etiqueta: 'Músculo' },
  { valor: 'hueso', etiqueta: 'Hueso fijo' },
  { valor: 'fragmento', etiqueta: 'Fragmento móvil' },
  { valor: 'implante', etiqueta: 'Implante' },
]

export interface DesplazamientoInicial {
  x?: number | null
  y?: number | null
  z?: number | null
  giroX?: number | null
  giroY?: number | null
  giroZ?: number | null
}

type Fila = PiezaEnEdicion

export function TallerDePiezas({
  url,
  nombre,
  piezas,
  alCambiarPiezas,
  desplazamiento,
  alCambiarDesplazamiento,
  milimetrosPorUnidad,
}: {
  /** Dirección del modelo elegido arriba, o null si todavía no hay ninguno. */
  url: string | null
  nombre?: string
  piezas: Fila[]
  alCambiarPiezas: (nuevas: Fila[]) => void
  desplazamiento: DesplazamientoInicial
  alCambiarDesplazamiento: (nuevo: DesplazamientoInicial) => void
  milimetrosPorUnidad: number
}) {
  const mando = useRef<MandoDelLienzo | null>(null)
  const [modo, setModo] = useState<Modo>('senalar')
  const [enElArchivo, setEnElArchivo] = useState<string[]>([])
  const [aislado, setAislado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const declaradas = nodosDeclarados(piezas)
  const huerfanas = piezasHuerfanas(piezas, enElArchivo)

  /** Lo que el lienzo necesita para saber qué es cada cosa mientras se edita. */
  const piezasParaElLienzo: PiezaDelCaso[] = piezas.flatMap((p) => {
    const nodo = typeof p.nodo === 'string' ? p.nodo : ''
    if (!nodo) return []
    return [{ nodo, rol: (typeof p.rol === 'string' ? p.rol : 'hueso') as PiezaDelCaso['rol'] }]
  })

  const alCargar = useCallback(() => {
    // La lista sale del archivo, no de lo que alguien recuerde. Si un nombre
    // cambió en Blender, aquí se ve en cuanto se abre.
    setEnElArchivo(mando.current?.nodosDelModelo() ?? [])
  }, [])

  if (!url) {
    return (
      <p className="campo-ayuda">
        Elija primero un modelo en <strong>Modelo 3D del caso</strong> y aquí aparecerá para
        señalar sus piezas.
      </p>
    )
  }

  const agregar = (nodo: string) => {
    const nuevas = agregarPieza(piezas, nodo)
    if (nuevas === piezas) {
      setAviso(`«${nodo}» ya está en la lista.`)
      return
    }
    alCambiarPiezas(nuevas)
    setAviso(`Añadida «${nodo}».`)
  }

  const quitar = (nodo: string) => {
    alCambiarPiezas(quitarPieza(piezas, nodo))
    if (aislado === nodo) mostrarTodo()
    setAviso(`Quitada «${nodo}».`)
  }

  const cambiarRol = (nodo: string, rol: string) =>
    alCambiarPiezas(cambiarRolDePieza(piezas, nodo, rol as RolDePieza))

  const aislar = (nodo: string) => {
    mando.current?.mostrar([nodo])
    setAislado(nodo)
    setAviso(`Viendo solo «${nodo}».`)
  }

  const mostrarTodo = () => {
    mando.current?.mostrar(null)
    setAislado(null)
  }

  /**
   * Lee del visor dónde quedó el fragmento y lo guarda en milímetros y grados.
   *
   * El visor trabaja en las unidades del archivo y el caso se escribe en
   * milímetros, así que la conversión pasa por el mismo número que declara el
   * caso. Con ese número mal puesto, los seis valores salen mil veces grandes o
   * mil veces pequeños y la consola mide contra ellos sin quejarse.
   */
  const capturarDesplazamiento = () => {
    const estado = mando.current?.estadoDelFragmento()
    if (!estado) {
      setAviso('Espere a que el modelo termine de cargar.')
      return
    }
    if (!hayFragmento(piezas)) {
      setAviso('Marque antes una pieza como fragmento móvil: es la que se desplaza.')
      return
    }
    alCambiarDesplazamiento({
      ...desplazamiento,
      ...desplazamientoEnMilimetros(estado, milimetrosPorUnidad),
    })
    setAviso('Desplazamiento capturado.')
  }

  const sinDeclarar = piezasSinUsar(piezas, enElArchivo)

  return (
    <div className="taller-piezas">
      <div className="taller-piezas-lienzo">
        <LienzoQuirurgico
          // Al cambiar de modelo hay que rehacer el lienzo entero.
          key={url}
          url={url}
          piezas={piezasParaElLienzo}
          modo={modo}
          fluoroscopia={false}
          alCargar={alCargar}
          alSenalar={agregar}
          alFallar={setAviso}
          mando={mando}
        />
      </div>

      <div className="taller-piezas-mandos">
        <div className="taller-piezas-modos">
          <button
            type="button"
            className={`admin-btn ${modo === 'senalar' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setModo('senalar')}
          >
            Señalar piezas
          </button>
          <button
            type="button"
            className={`admin-btn ${modo === 'mover' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setModo('mover')}
          >
            Colocar el fragmento
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setModo('orbitar')}>
            Solo girar la vista
          </button>
          {aislado ? (
            <button type="button" className="admin-btn admin-btn-secondary" onClick={mostrarTodo}>
              Ver todo otra vez
            </button>
          ) : null}
        </div>

        {modo === 'mover' ? (
          <button type="button" className="admin-btn admin-btn-primary" onClick={capturarDesplazamiento}>
            Capturar desplazamiento
          </button>
        ) : null}
      </div>

      {sinDeclarar.length > 0 ? (
        <div className="taller-piezas-sueltas">
          <span className="taller-piezas-titulo">En el archivo y sin usar:</span>
          {sinDeclarar.map((n) => (
            <button key={n} type="button" className="taller-piezas-suelta" onClick={() => agregar(n)}>
              {n}
            </button>
          ))}
        </div>
      ) : null}

      {declaradas.length > 0 ? (
        <table className="taller-piezas-tabla">
          <thead>
            <tr>
              <th>Objeto</th>
              <th>Qué es</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {piezas.map((p, i) => {
              const nodo = typeof p.nodo === 'string' ? p.nodo : ''
              const existe = !huerfanas.includes(nodo)
              return (
                <tr key={`${nodo}-${i}`} className={existe ? undefined : 'taller-piezas-huerfana'}>
                  <td>
                    <code>{nodo || '(sin nombre)'}</code>
                    {!existe ? (
                      <span className="taller-piezas-alerta"> no está en este archivo</span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className="campo-control"
                      value={typeof p.rol === 'string' ? p.rol : 'hueso'}
                      onChange={(e) => cambiarRol(nodo, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="taller-piezas-acciones">
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => aislar(nodo)}>
                      Solo esto
                    </button>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => quitar(nodo)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}

      <p className="campo-ayuda">
        En <strong>Señalar piezas</strong>, pinche cada trozo del modelo y se añade con su nombre
        exacto. Marque uno como <strong>fragmento móvil</strong>: es el que el residente reduce.
        Después pase a <strong>Colocar el fragmento</strong>, arrástrelo hasta que la fractura se
        vea como quiere enseñarla y pulse <strong>Capturar desplazamiento</strong>.
        {aviso ? <span className="encuadre-aviso"> {aviso}</span> : null}
      </p>
    </div>
  )
}
