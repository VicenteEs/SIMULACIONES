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
    if (!hayFragmento(piezas)) {
      setAviso('Marque antes una pieza como fragmento móvil: es la que se desplaza.')
      return
    }
    const estado = mando.current?.estadoDelFragmento()
    if (!estado) {
      setAviso('Espere a que el modelo termine de cargar.')
      return
    }
    // Capturar seis ceros diciendo «capturado» es peor que no capturar: el caso
    // queda ya reducido y su paso de reducción se aprueba sin tocar nada.
    const quieto =
      estado.posicion.x === 0 &&
      estado.posicion.y === 0 &&
      estado.posicion.z === 0 &&
      estado.giros.x === 0 &&
      estado.giros.y === 0 &&
      estado.giros.z === 0
    if (quieto) {
      setAviso('El fragmento está en su sitio: arrástrelo antes de capturar.')
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
      {/*
        Por debajo de 640 px el visor y su botonera no están —señalar un trozo
        y arrastrar un fragmento con el dedo no sale—, así que todo lo que los
        explica se va con ellos dentro de `.solo-ancho` y aquí queda lo que se
        puede hacer de verdad desde un teléfono. Antes se escondían las tres
        piezas por su nombre en `admin.css` y la instrucción de abajo se
        quedaba puesta: el autor leía «pinche cada trozo… pulse Capturar
        desplazamiento» debajo de un hueco.
      */}
      <p className="solo-estrecho aviso-solo-escritorio">
        Señalar las piezas y colocar el fragmento con el dedo no sale: abra esta ficha desde un
        computador. La tabla de aquí abajo y los seis números del desplazamiento inicial siguen
        siendo editables a mano.
      </p>

      <div className="solo-ancho">
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
      </div>

      {declaradas.length > 0 ? (
        <table className="taller-piezas-tabla">
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
              const existe = !huerfanas.includes(nodo)
              return (
                <tr key={`${nodo}-${i}`} className={existe ? undefined : 'taller-piezas-huerfana'}>
                  {/*
                    `<th scope="row">` y no `<td>`: esta celda no es un dato de
                    la fila, es lo que la identifica. Con ella marcada, el lector
                    de pantalla antepone el nombre del objeto al leer el
                    desplegable y los dos botones de al lado, que es exactamente
                    lo que hace falta en una tabla de quince trozos de .glb
                    llamados casi igual. El aspecto no cambia: `admin.css` acotó
                    su regla de cabecera a `thead th` justamente para esto —el
                    `text-transform: uppercase` sacaría el nombre en mayúsculas y
                    tiene que coincidir letra por letra con el del archivo— y dio
                    a `tbody th` el mismo trato que al `<td>`.
                  */}
                  <th scope="row">
                    <code>{nodo || '(sin nombre)'}</code>
                    {!existe ? (
                      <span className="taller-piezas-alerta"> no está en este archivo</span>
                    ) : null}
                  </th>
                  <td>
                    {/*
                      Cada control lleva el nombre del objeto en su etiqueta, y
                      no es adorno. Un caso trae diez o quince filas, y el
                      nombre del objeto vive en la celda de al lado: quien
                      recorre la tabla con el lector oía «cuadro combinado,
                      Hueso fijo» quince veces seguidas, sin nada que dijera a
                      qué trozo del .glb correspondía cada una. Marcar el rol en
                      la fila equivocada es exactamente el fallo que este taller
                      existe para impedir.
                    */}
                    <select
                      className="campo-control"
                      aria-label={`Qué es «${nodo || 'sin nombre'}»`}
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
                    {/*
                      «Solo esto» aísla la pieza DENTRO del visor, así que se va
                      con él en pantalla estrecha: allí el botón contestaba
                      «Viendo solo «X»» sobre un visor que no está. «Quitar» no,
                      que sigue haciendo lo mismo con la tabla delante.
                    */}
                    <span className="solo-ancho">
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        aria-label={`Ver solo «${nodo || 'sin nombre'}»`}
                        onClick={() => aislar(nodo)}
                      >
                        Solo esto
                      </button>
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      aria-label={`Quitar «${nodo || 'sin nombre'}» de la lista`}
                      onClick={() => quitar(nodo)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}

      <p className="campo-ayuda solo-ancho">
        En <strong>Señalar piezas</strong>, pinche cada trozo del modelo y se añade con su nombre
        exacto. Marque uno como <strong>fragmento móvil</strong>: es el que el residente reduce.
        Después pase a <strong>Colocar el fragmento</strong>, arrástrelo hasta que la fractura se
        vea como quiere enseñarla y pulse <strong>Capturar desplazamiento</strong>.
      </p>

      {/*
        El aviso sale de ese párrafo y se queda fuera del envoltorio que se
        esconde: es la única respuesta que recibe quien añade, quita o captura,
        y en pantalla estrecha «Quitar» sigue funcionando desde la tabla. Antes
        iba dentro, así que allí la fila desaparecía sin que nada lo dijera.

        Se pinta siempre, aunque no haya nada que decir: `role="status"` anuncia
        lo que cambia dentro de una región que ya estaba en la página, y una que
        se monta con el texto dentro no se anuncia. Vacío ocupa su margen y
        nada más.
      */}
      <p className="campo-ayuda encuadre-aviso" role="status">
        {aviso}
      </p>
    </div>
  )
}
