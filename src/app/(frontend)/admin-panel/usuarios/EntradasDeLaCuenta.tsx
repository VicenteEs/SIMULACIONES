'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Vacio } from '@/components/ui/Vacio'
import { entradasDeUnaCuenta } from '@/app/(frontend)/acciones/admin'
import { MESES_DE_LAS_ENTRADAS, plazoEnPalabras } from '@/lib/conservacion'
import {
  ETIQUETAS_DEL_FIN,
  nombreDelPais,
  type AlertaDelPanel,
  type EntradaDelPanel,
} from '@/lib/entradas'
import { claseDeInsignia } from '@/lib/tonosDeEstado'

/**
 * Las entradas de una cuenta, en «Usuarios y permisos» (D-390, que cierra lo que
 * D-388 dejó pendiente).
 *
 * Hasta aquí solo se veían en el correo de una alerta y en la exportación de los
 * datos de la cuenta, así que un administrador que recibía «no parece de una sola
 * persona» no tenía dónde mirar lo que pasó antes ni después. Ahora la fila de la
 * cuenta tiene «Entradas a la plataforma» en su menú.
 *
 * Se piden al abrir (`entradasDeUnaCuenta`) y no llegan con la tabla: ver por qué
 * en la acción. Mientras llegan, el modal dice que las está buscando; si la acción
 * falla, el motivo va dentro del modal, como en los demás de esta pantalla.
 */

type Datos = { entradas: EntradaDelPanel[]; total: number; alertas: AlertaDelPanel[] }

const FORMATO_DE_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // La hora de Chile, como el resto del panel: la que se lee en el correo de la
  // alerta y la del registro tienen que coincidir con esta.
  timeZone: 'America/Santiago',
})

const fechaYHora = (iso: string) => FORMATO_DE_FECHA.format(new Date(iso))

/** El tono de cada final: lo que sigue abierto resalta, lo que echó a otro avisa. */
const TONO_DEL_FIN = {
  abierta: 'ok',
  salio: 'neutra',
  'otra-entrada': 'atencion',
  caduco: 'neutra',
  cerrada: 'neutra',
} as const

export function EntradasDeLaCuenta({ cuenta, onCerrar }: { cuenta: { id: string; email: string; nombre: string }; onCerrar: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Si se cierra antes de que conteste, la respuesta no pinta nada en un modal
    // que ya no está, ni en el de otra cuenta que se abra después.
    let vigente = true
    entradasDeUnaCuenta(cuenta.id).then(
      (respuesta) => {
        if (!vigente) return
        if (respuesta.exito && respuesta.datos) setDatos(respuesta.datos)
        else setError((respuesta.exito ? null : respuesta.mensaje) ?? 'No llegaron las entradas.')
      },
      () => {
        if (vigente) setError('No se pudieron leer las entradas. Pruebe de nuevo.')
      },
    )
    return () => {
      vigente = false
    }
  }, [cuenta.id])

  const plazo = plazoEnPalabras(MESES_DE_LAS_ENTRADAS)

  return (
    <Modal titulo={`Entradas de ${cuenta.nombre || cuenta.email}`} error={error} onCerrar={onCerrar} ancho="ancho">
      <p className="entradas-explicacion">
        Cada vez que la cuenta entró en los últimos {plazo}, la más reciente primero. Una cuenta solo puede estar
        abierta en un equipo a la vez: al entrar en uno se cierra en el otro.
      </p>

      {datos === null ? (
        error ? null : (
          <p className="entradas-explicacion" role="status">
            Buscando las entradas…
          </p>
        )
      ) : (
        <>
          {datos.alertas.length > 0 ? (
            <section className="entradas-alertas" aria-labelledby="entradas-alertas-titulo">
              <h3 id="entradas-alertas-titulo">Alertas</h3>
              <ul>
                {datos.alertas.map((alerta) => (
                  <li key={`${alerta.fecha}-${alerta.detalle}`}>
                    <time dateTime={alerta.fecha}>{fechaYHora(alerta.fecha)}</time> · {alerta.detalle}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {datos.entradas.length === 0 ? (
            <Vacio titulo="Sin entradas" compacto>
              Esta cuenta no ha entrado en los últimos {plazo}.
            </Vacio>
          ) : (
            <div className="admin-table-container">
              {/* En el teléfono cada entrada se vuelve tarjeta (`.tabla-apilable`), como
                  la tabla de cuentas: de lado, la IP y cómo terminó quedaban fuera. */}
              <table className="admin-table tabla-apilable entradas-tabla">
                <caption className="sr-only">Entradas de {cuenta.email}</caption>
                <thead>
                  <tr>
                    <th scope="col">Cuándo</th>
                    <th scope="col">Equipo</th>
                    <th scope="col">IP</th>
                    <th scope="col">País</th>
                    <th scope="col">Cómo terminó</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.entradas.map((e) => (
                    <tr key={e.id}>
                      <td data-etiqueta="Cuándo">
                        {/* Un solo bloque con la hora y la nota: en el teléfono la
                            celda es una fila flexible, y sueltas la nota se ponía
                            al lado de la hora y se salía de la tarjeta. */}
                        <div>
                          <time dateTime={e.fecha}>{fechaYHora(e.fecha)}</time>
                          {/* Lo que dispara la alerta de turnos: que esta entrada
                              echara a otro equipo. Va junto a la hora porque es de
                              la entrada, no de cómo terminó. */}
                          {e.cerroOtroEquipo ? <div className="entradas-nota">Cerró la de otro equipo</div> : null}
                        </div>
                      </td>
                      <td data-etiqueta="Equipo">{e.equipo ?? '—'}</td>
                      <td data-etiqueta="IP" className="entradas-ip">
                        {e.ip ?? '—'}
                      </td>
                      <td data-etiqueta="País">{e.pais ? nombreDelPais(e.pais) : '—'}</td>
                      <td data-etiqueta="Cómo terminó">
                        <span className={claseDeInsignia(TONO_DEL_FIN[e.fin])}>{ETIQUETAS_DEL_FIN[e.fin]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {datos.total > datos.entradas.length ? (
            <p className="entradas-explicacion">
              Se enseñan las {datos.entradas.length} más recientes de {datos.total}. Todas van en «Descargar sus datos».
            </p>
          ) : null}
        </>
      )}

      <div className="admin-modal-actions">
        <button type="button" className="admin-btn admin-btn-secondary" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
