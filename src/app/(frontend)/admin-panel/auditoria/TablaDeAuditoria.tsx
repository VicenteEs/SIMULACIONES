'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asignarRevisor, publicarValidadas } from '@/app/(frontend)/acciones/revision'
import { estadoEnPalabras, type EstadoDeRevision } from '@/lib/revision'
import type { FilaDeContenido } from '@/lib/auditoria'
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
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

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

  const cabecera = (columna: Columna, texto: string) => (
    <th aria-sort={orden.columna === columna ? (orden.ascendente ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="auditoria-orden" onClick={() => ordenarPor(columna)}>
        {texto}
        {orden.columna === columna ? (orden.ascendente ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  const todasElegidas = ordenadas.length > 0 && ordenadas.every((f) => elegidas.has(clave(f)))
  const seleccion = ordenadas.filter((f) => elegidas.has(clave(f)))
  const validadasElegidas = seleccion.filter((f) => f.estado === 'lista').length

  const enBloque = (
    tarea: () => Promise<{ exito: boolean; mensaje?: string; datos?: unknown }>,
    hecho: (datos: unknown) => string,
  ) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const r = await tarea()
        if (!r.exito) {
          setAviso({ tipo: 'error', texto: r.mensaje ?? 'No se pudo completar.' })
          return
        }
        setAviso({ tipo: 'ok', texto: hecho(r.datos) })
        setElegidas(new Set())
        router.refresh()
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo completar.') })
      }
    })
  }

  if (filas.length === 0) {
    return <p className="grafico-vacio">Ninguna ficha en revisión coincide con el filtro.</p>
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
          Asignar
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-success admin-btn-sm"
          disabled={enCurso || validadasElegidas === 0}
          title="Publica las elegidas que estén validadas; las demás se saltan"
          onClick={() => {
            const senaladas = seleccion.filter((f) => f.estado === 'lista' && f.senalada).length
            if (
              !confirm(
                `¿Publicar ${validadasElegidas} ficha${validadasElegidas === 1 ? '' : 's'} validada${validadasElegidas === 1 ? '' : 's'}?` +
                  (senaladas > 0
                    ? `\n\n${senaladas} de ellas ${senaladas === 1 ? 'tiene' : 'tienen'} la validación señalada como rápida.`
                    : '') +
                  '\n\nLas elegidas que no estén validadas se saltan.',
              )
            )
              return
            enBloque(
              () => publicarValidadas(seleccion.map((f) => ({ coleccion: f.coleccion, id: f.documentoId }))),
              (datos) => {
                const d = (datos ?? {}) as { publicadas?: number; saltadas?: number }
                return `${d.publicadas ?? 0} publicada${d.publicadas === 1 ? '' : 's'}${d.saltadas ? `; ${d.saltadas} saltada${d.saltadas === 1 ? '' : 's'} por no estar validada${d.saltadas === 1 ? '' : 's'}` : ''}.`
              },
            )
          }}
        >
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
                  <div className="revision-tenue">
                    {NOMBRE_DE_MODULO[f.coleccion] ?? f.coleccion}
                    {f.libro ? ` · ${f.libro}` : ''}
                    {f.capitulo ? ` · cap. ${f.capitulo}` : ''}
                  </div>
                  {f.senalada && f.motivos ? <div className="auditoria-motivos">⚑ {f.motivos}</div> : null}
                </th>
                <td>
                  <span className={`admin-badge revision-estado-${f.estado}`}>{estadoEnPalabras(f.estado)}</span>
                  {f.publicadaSinValidar ? <div className="auditoria-motivos">publicada sin validar</div> : null}
                  {f.devoluciones > 0 ? (
                    <div className="revision-tenue">
                      devuelta {f.devoluciones} {f.devoluciones === 1 ? 'vez' : 'veces'}
                    </div>
                  ) : null}
                </td>
                <td>{f.asignada || <span className="revision-tenue">sin asignar</span>}</td>
                <td>{f.validador || '—'}</td>
                <td>{fecha(f.validadaEn)}</td>
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
