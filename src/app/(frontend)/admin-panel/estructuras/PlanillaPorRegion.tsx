'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { ruta } from '@/lib/rutas'
import { VentanaDeSubida } from './VentanaDeSubida'

export interface RegionParaLaPlanilla {
  id: string
  nombre: string
  pendientes: number
  total: number
}

/**
 * La planilla de Excel por región (D-179, P-003 E8.5): descargar vacía o con lo
 * escrito, y subirla llena.
 *
 * Está en «Pendientes» porque es la forma de llenar muchas piezas de una vez: se
 * baja la región, se llena —a mano o con una IA—, se sube, y la ventana enseña qué
 * haría antes de escribir nada. Las descargas son enlaces a la ruta del servidor, que
 * arma el `.xlsx` con las fichas de ese momento; van por `ruta()` porque la
 * plataforma puede vivir bajo un prefijo y un `href` escrito a mano no lo lleva.
 */
export function PlanillaPorRegion({
  regiones,
  puedeRespaldar,
  alAplicar,
}: {
  regiones: RegionParaLaPlanilla[]
  /** Solo el administrador tiene «Respaldar ahora». */
  puedeRespaldar: boolean
  alAplicar: () => void
}) {
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [subiendo, setSubiendo] = useState<{ id: string; nombre: string } | null>(null)

  const enlace = (region: string, contenido: 'vacia' | 'escrita') => {
    const parametros = new URLSearchParams({ region, contenido, solo: soloPendientes ? 'pendientes' : 'todas' })
    return ruta(`/api/estructuras/planilla?${parametros.toString()}`)
  }
  const todas: RegionParaLaPlanilla = {
    id: 'todas',
    nombre: 'Todas las regiones',
    pendientes: regiones.reduce((n, r) => n + r.pendientes, 0),
    total: regiones.reduce((n, r) => n + r.total, 0),
  }

  return (
    <section className="estructuras-planilla" aria-label="Planilla de Excel por región">
      <details>
        <summary>
          <FileSpreadsheet aria-hidden size={16} /> Planilla de Excel por región
        </summary>
        <p className="estructuras-planilla-ayuda">
          Descargue la región, llénela —a mano o con una IA— y súbala. Antes de escribir nada, se enseña qué se llenaría y qué
          cambiaría. Una celda vacía nunca borra lo ya escrito.
        </p>
        <label className="estructuras-planilla-solo">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Descargar solo las piezas pendientes
        </label>
        <table className="admin-table tabla-apilable">
          <thead>
            <tr>
              <th>Región</th>
              <th>Pendientes</th>
              <th>Planilla</th>
            </tr>
          </thead>
          <tbody>
            {[...regiones, todas].map((r) => {
              const sinNada = soloPendientes && r.pendientes === 0
              return (
                <tr key={r.id}>
                  <th scope="row">{r.nombre}</th>
                  <td data-etiqueta="Pendientes">
                    {r.pendientes.toLocaleString('es-CL')} de {r.total.toLocaleString('es-CL')}
                  </td>
                  <td data-etiqueta="Planilla" className="estructuras-planilla-acciones">
                    {sinNada ? (
                      <span className="estructuras-planilla-nada">No queda nada pendiente</span>
                    ) : (
                      <>
                        <a className="admin-btn admin-btn-secondary" href={enlace(r.id, 'vacia')} download>
                          <Download aria-hidden size={14} /> Vacía
                        </a>
                        <a className="admin-btn admin-btn-secondary" href={enlace(r.id, 'escrita')} download>
                          <Download aria-hidden size={14} /> Con lo escrito
                        </a>
                      </>
                    )}
                    <button type="button" className="admin-btn admin-btn-primary" onClick={() => setSubiendo({ id: r.id, nombre: r.nombre })}>
                      <Upload aria-hidden size={14} /> Subir planilla
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>

      {subiendo ? (
        <VentanaDeSubida
          regionId={subiendo.id}
          region={subiendo.nombre}
          nombresDeRegion={Object.fromEntries(regiones.map((r) => [r.id, r.nombre]))}
          puedeRespaldar={puedeRespaldar}
          alCerrar={() => setSubiendo(null)}
          alAplicar={alAplicar}
        />
      ) : null}
    </section>
  )
}
