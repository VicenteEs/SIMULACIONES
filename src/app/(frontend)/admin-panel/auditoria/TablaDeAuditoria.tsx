'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown, Flag, SearchX, Send, UserCheck } from 'lucide-react'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { Vacio } from '@/components/ui/Vacio'
import { asignarRevisor, publicarValidadas } from '@/app/(frontend)/acciones/revision'
import { estadoEnPalabras, type EstadoDeRevision } from '@/lib/revision'
import type { FilaDeContenido } from '@/lib/auditoria'
import { claseDeInsignia, tonoDeRevision } from '@/lib/tonosDeEstado'
import { NOMBRE_DE_MODULO } from '../modulos'

/**
 * Las fichas en revisión, una por fila, con lo que el administrador necesita
 * para decidir (D-142): cuánto se editó, cuánto tiempo le dedicó quien la
 * validó, a qué ritmo, cuántas secciones abrió y si quedó señalada.
 *
 * Se ordena en el navegador —son como mucho unos cientos de filas ya
 * filtradas por el servidor— y se trabaja en bloque: asignar lo elegido a un
 * revisor, o publicar lo elegido que esté validado. Todo lo demás se hace en la
 * ficha, que es donde se ve el texto.
 */

type Columna =
  | 'titulo'
  | 'estado'
  | 'asignada'
  | 'validador'
  | 'porcentaje'
  | 'minutosActivos'
  | 'minutosActivosDelValidador'
  | 'ritmoDelValidador'
  | 'validadaEn'

const COLUMNAS_NUMERICAS: Columna[] = [
  'porcentaje',
  'minutosActivos',
  'minutosActivosDelValidador',
  'ritmoDelValidador',
]

const ORDEN_DE_ESTADO: Record<EstadoDeRevision, number> = {
  lista: 0,
  devuelta: 1,
  'en-revision': 2,
  pendiente: 3,
  publicada: 4,
}

const fecha = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'
const numero = (valor: number | null, decimales = 1) =>
  valor === null ? '—' : valor.toLocaleString('es-CL', { maximumFractionDigits: decimales })

const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

export function TablaDeAuditoria({
  filas,
  revisores,
}: {
  filas: FilaDeContenido[]
  revisores: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [orden, setOrden] = useState<{ columna: Columna | null; ascendente: boolean }>({
    columna: null,
    ascendente: true,
  })
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [asignarA, setAsignarA] = useState('')
  // El éxito sale en un aviso flotante, que se ve aunque se haya bajado a la
  // fila doscientos para elegir; el error se queda además escrito encima de
  // la tabla, porque el de publicar en bloque nombra las fichas que fallaron
  // y eso hay que poder leerlo con calma, no en cinco segundos.
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const avisar = useAvisos()
  const confirmar = useConfirmar()

  const clave = (f: FilaDeContenido) => `${f.coleccion}/${f.documentoId}`

  const ordenadas = useMemo(() => {
    const copia = [...filas]
    const { columna, ascendente } = orden
    if (!columna) {
      // Lo que pide atención primero: validadas y señaladas, después las
      // validadas, las devueltas y lo que está en curso.
      return copia.sort(
        (a, b) =>
          Number(b.senalada && b.estado === 'lista') - Number(a.senalada && a.estado === 'lista') ||
          ORDEN_DE_ESTADO[a.estado] - ORDEN_DE_ESTADO[b.estado] ||
          (b.validadaEn ?? b.ultimaEdicion ?? '').localeCompare(a.validadaEn ?? a.ultimaEdicion ?? ''),
      )
    }
    // Lo que falta —una ficha sin validar no tiene ritmo— va al final de lo
    // ascendente: −1 en los números, cadena vacía en los textos.
    const valor = (f: FilaDeContenido): string | number => {
      if (columna === 'estado') return ORDEN_DE_ESTADO[f.estado]
      const v = f[columna]
      if (COLUMNAS_NUMERICAS.includes(columna)) return typeof v === 'number' ? v : -1
      return typeof v === 'string' ? v : ''
    }
    return copia.sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      const comparacion =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { numeric: true })
      return ascendente ? comparacion : -comparacion
    })
  }, [filas, orden])

  const ordenarPor = (columna: Columna) =>
    setOrden((actual) => ({
      columna,
      ascendente: actual.columna === columna ? !actual.ascendente : columna === 'titulo' || columna === 'asignada',
    }))

  // `aria-sort` en el `th` dice el orden a quien no ve la flecha; la flecha
  // de dos puntas en las demás columnas dice que también se pueden ordenar,
  // que antes solo se descubría pasando el ratón por encima.
  const cabecera = (columna: Columna, texto: string) => {
    const activa = orden.columna === columna
    const Icono = !activa ? ArrowUpDown : orden.ascendente ? ArrowUp : ArrowDown
    return (
      <th aria-sort={activa ? (orden.ascendente ? 'ascending' : 'descending') : undefined}>
        <button type="button" className="auditoria-orden" onClick={() => ordenarPor(columna)}>
          {texto}
          <Icono aria-hidden size={14} />
        </button>
      </th>
    )
  }

  const todasElegidas = ordenadas.length > 0 && ordenadas.every((f) => elegidas.has(clave(f)))
  const seleccion = ordenadas.filter((f) => elegidas.has(clave(f)))
  const validadasElegidas = seleccion.filter((f) => f.estado === 'lista').length

  const enBloque = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string; datos?: unknown }>,
    // Un texto es un éxito entero; con `tipo`, quien llama decide, porque un
    // lote puede salir a medias y eso no se pinta en verde.
    hecho: (datos: unknown) => string | { tipo: 'ok' | 'error'; texto: string },
  ) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (!r.exito) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
          avisar('error', r.mensaje ?? 'No se pudo completar.')
          return
        }
        const resultado = hecho(r.datos)
        if (typeof resultado === 'string') avisar('ok', resultado)
        else if (resultado.tipo === 'ok') avisar('ok', resultado.texto)
        else {
          setAviso(resultado)
          avisar('error', 'El lote salió a medias: el detalle está encima de la tabla.')
        }
        setElegidas(new Set())
        router.refresh()
      } catch (fallo) {
        const texto = motivoDeLaCaida(fallo, 'No se pudo completar.')
        setAviso({ tipo: 'error', texto })
        avisar('error', texto)
      }
    })
  }

  if (filas.length === 0) {
    return <Vacio compacto icono={SearchX} titulo="Ninguna ficha en revisión coincide con el filtro." />
  }

  return (
    <div>
      <div className="auditoria-bloque" role="group" aria-label="Acciones sobre las fichas elegidas">
        <span>
          {seleccion.length === 0
            ? 'Elija fichas en la tabla para actuar sobre varias a la vez.'
            : `${seleccion.length} elegida${seleccion.length === 1 ? '' : 's'}${
                validadasElegidas > 0 ? ` · ${validadasElegidas} validada${validadasElegidas === 1 ? '' : 's'}` : ''
              }`}
        </span>
        <select
          className="admin-select"
          aria-label="Revisor al que asignar las elegidas"
          value={asignarA}
          onChange={(e) => setAsignarA(e.target.value)}
        >
          <option value="">— Asignar a —</option>
          <option value="nadie">Nadie (quitar la asignación)</option>
          {revisores.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={enCurso || seleccion.length === 0 || asignarA === ''}
          onClick={() =>
            enBloque(
              () =>
                asignarRevisor(
                  seleccion.map((f) => ({ coleccion: f.coleccion, id: f.documentoId })),
                  asignarA === 'nadie' ? null : asignarA,
                ),
              (datos) => {
                const n = (datos as { cambiadas?: number } | undefined)?.cambiadas ?? 0
                return `${n} ficha${n === 1 ? '' : 's'} ${asignarA === 'nadie' ? 'sin asignar' : 'asignada' + (n === 1 ? '' : 's')}.`
              },
            )
          }
        >
          <UserCheck aria-hidden size={16} />
          Asignar
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-success admin-btn-sm"
          disabled={enCurso || validadasElegidas === 0}
          title="Publica las elegidas que estén validadas; las demás se saltan"
          onClick={async () => {
            const senaladas = seleccion.filter((f) => f.estado === 'lista' && f.senalada).length
            const plural = validadasElegidas === 1 ? '' : 's'
            // No es destructivo —publicar se deshace retirando—, así que no va
            // en rojo; pero la advertencia de las señaladas va dentro, donde
            // se lee antes de pulsar.
            if (
              !(await confirmar({
                titulo: `¿Publicar ${validadasElegidas} ficha${plural} validada${plural}?`,
                mensaje: (
                  <>
                    {senaladas > 0 ? (
                      <p>
                        <strong>
                          {senaladas} de ellas {senaladas === 1 ? 'tiene' : 'tienen'} la validación señalada
                          como rápida.
                        </strong>
                      </p>
                    ) : null}
                    <p>Las elegidas que no estén validadas se saltan.</p>
                  </>
                ),
                confirmar: `Publicar ${validadasElegidas} ficha${plural}`,
              }))
            )
              return
            enBloque(
              () => publicarValidadas(seleccion.map((f) => ({ coleccion: f.coleccion, id: f.documentoId }))),
              (datos) => {
                const d = (datos ?? {}) as {
                  publicadas?: number
                  saltadas?: number
                  fallidas?: { coleccion: string; id: string; motivo: string }[]
                }
                const texto = `${d.publicadas ?? 0} publicada${d.publicadas === 1 ? '' : 's'}${d.saltadas ? `; ${d.saltadas} saltada${d.saltadas === 1 ? '' : 's'} por no estar validada${d.saltadas === 1 ? '' : 's'}` : ''}.`
                const fallidas = d.fallidas ?? []
                if (fallidas.length === 0) return texto
                const titulo = (f: { coleccion: string; id: string }) =>
                  filas.find((x) => x.coleccion === f.coleccion && x.documentoId === f.id)?.titulo ?? `#${f.id}`
                return {
                  tipo: 'error',
                  texto:
                    `${texto} ${fallidas.length} no se ${fallidas.length === 1 ? 'pudo' : 'pudieron'} publicar: ` +
                    fallidas.map((f) => `«${titulo(f)}» (${f.motivo})`).join('; '),
                }
              },
            )
          }}
        >
          <Send aria-hidden size={16} />
          Publicar las validadas
        </button>
      </div>

      <div role="status">{aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}</div>

      <div className="admin-table-container">
        <table className="admin-table auditoria-tabla">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Elegir todas las fichas de la tabla"
                  checked={todasElegidas}
                  onChange={() =>
                    setElegidas(todasElegidas ? new Set() : new Set(ordenadas.map((f) => clave(f))))
                  }
                />
              </th>
              {cabecera('titulo', 'Ficha')}
              {cabecera('estado', 'Estado')}
              {cabecera('asignada', 'Asignada a')}
              {cabecera('validador', 'Validada por')}
              {cabecera('validadaEn', 'El')}
              {cabecera('porcentaje', '% editado')}
              {cabecera('minutosActivosDelValidador', 'Min. del validador')}
              {cabecera('ritmoDelValidador', 'Palabras/min')}
              <th>Secciones</th>
              {cabecera('minutosActivos', 'Min. de todos')}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={clave(f)} className={f.senalada && f.estado === 'lista' ? 'auditoria-fila-senalada' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Elegir «${f.titulo}»`}
                    checked={elegidas.has(clave(f))}
                    onChange={() =>
                      setElegidas((antes) => {
                        const ahora = new Set(antes)
                        if (ahora.has(clave(f))) ahora.delete(clave(f))
                        else ahora.add(clave(f))
                        return ahora
                      })
                    }
                  />
                </td>
                <th scope="row" className="admin-table-user-name">
                  <Link href={`/admin-panel/contenido/${f.coleccion}/${f.documentoId}`}>{f.titulo}</Link>
                  <div className="revision-tenue auditoria-fuente" title={[NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion, f.libro, f.capitulo ? `cap. ${f.capitulo}` : ''].filter(Boolean).join(' · ')}>
                    {NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion}
                    {f.libro ? ` · ${f.libro}` : ''}
                    {f.capitulo ? ` · cap. ${f.capitulo}` : ''}
                  </div>
                  {f.senalada && f.motivos ? (
                    <div className="auditoria-motivos">
                      <Flag aria-label="Señalada:" size={12} />
                      {f.motivos}
                    </div>
                  ) : null}
                </th>
                <td>
                  <span className={claseDeInsignia(tonoDeRevision(f.estado))}>{estadoEnPalabras(f.estado)}</span>
                  {f.publicadaSinValidar ? <div className="auditoria-motivos">publicada sin validar</div> : null}
                  {f.devoluciones > 0 ? (
                    <div className="revision-tenue">
                      devuelta {f.devoluciones} {f.devoluciones === 1 ? 'vez' : 'veces'}
                    </div>
                  ) : null}
                </td>
                <td>{f.asignada || <span className="revision-tenue">sin asignar</span>}</td>
                <td>{f.validador || '—'}</td>
                <td className="u-nowrap">{fecha(f.validadaEn)}</td>
                <td className="auditoria-numero">{numero(f.porcentaje)} %</td>
                <td className="auditoria-numero">{numero(f.minutosActivosDelValidador)}</td>
                <td className="auditoria-numero">{numero(f.ritmoDelValidador, 0)}</td>
                <td className="auditoria-numero">
                  {f.seccionesRevisadas === null ? '—' : `${f.seccionesRevisadas}/${f.seccionesConContenido}`}
                </td>
                <td className="auditoria-numero">{numero(f.minutosActivos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
