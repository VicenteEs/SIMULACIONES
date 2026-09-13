'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { borrarRespaldo, respaldarAhora } from '@/app/(frontend)/acciones/respaldos'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { ruta } from '@/lib/rutas'

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const antiguedad = (valor: string) => {
  const dias = Math.floor((Date.now() - new Date(valor).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/**
 * Qué decir cuando la acción de servidor no llega a contestar.
 *
 * `accion()` (`src/lib/guardias.ts`) envuelve en una `Respuesta` todo lo que
 * ella ve fallar, pero lo que se cae antes de llegar a ella —la red cortada, la
 * sesión caducada, un despliegue a mitad de petición— sale como excepción
 * dentro de la transición. Aquí eso importaba más que en otras pantallas: un
 * volcado de la base tarda minutos, así que es justo la acción con más tiempo
 * para que se caiga la red por el medio, y sin este `catch` lo que se veía era
 * el aviso anterior —o ninguno— con los botones ya desbloqueados, que se lee
 * como «no pasó nada». Peor todavía en «Eliminar»: la fila seguía en la tabla y
 * no había forma de saber si el archivo se borró o no.
 *
 * Tercera copia literal de la misma función, tras `FormularioDocumento.tsx` y
 * `TablaDocumentos.tsx`. No se importa de ninguna de las dos porque arrastraría
 * el árbol del editor a esta pantalla; su sitio es el gancho común de acciones
 * del panel, que sigue sin existir.
 */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

export function PanelDeRespaldos({
  respaldos,
  directorio,
  hayHerramienta,
}: {
  respaldos: Respaldo[]
  directorio: string
  hayHerramienta: boolean
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const bases = respaldos.filter((r) => r.tipo === 'base')
  const total = respaldos.reduce((t, r) => t + r.bytes, 0)

  const crear = () => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await respaldarAhora()
        if (resultado.exito && resultado.datos) {
          setAviso({
            tipo: 'ok',
            texto: `Respaldo creado: ${resultado.datos.nombre} (${tamanoLegible(resultado.datos.bytes)}).`,
          })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo crear el respaldo.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo crear el respaldo.') })
      }
    })
  }

  return (
    <div>
      <div className="admin-toolbar">
        <div>
          <h1 className="admin-title">Respaldos</h1>
          <p className="admin-subtitle">
            {bases.length} volcado{bases.length === 1 ? '' : 's'} de la base ·{' '}
            {tamanoLegible(total)} ocupados en disco
          </p>
        </div>
        <div className="admin-acciones">
          <button
            className="admin-btn admin-btn-primary"
            onClick={crear}
            disabled={enCurso || !hayHerramienta}
          >
            {enCurso ? 'Respaldando…' : 'Respaldar ahora'}
          </button>
        </div>
      </div>

      {aviso ? <div className={`admin-aviso admin-aviso-${aviso.tipo}`}>{aviso.texto}</div> : null}

      {!hayHerramienta ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No se puede respaldar desde aquí en esta máquina.</strong>
          Falta <code>pg_dump</code> en el entorno donde corre la aplicación. La imagen de
          producción lo incluye; en desarrollo sobre Windows, use{' '}
          <code>docker compose exec db pg_dump</code> o el script{' '}
          <code>scripts/respaldar.sh</code>.
        </div>
      ) : null}

      <div className="admin-aviso admin-aviso-info">
        <strong>Cómo funciona</strong>
        En el servidor hay un respaldo diario programado a las 03:00 que conserva treinta días.
        Estos archivos viven en <code>{directorio}</code>, fuera del contenedor, de modo que
        sobreviven a un despliegue. Para restaurar uno:{' '}
        <code>./scripts/restaurar.sh backups/NOMBRE.sql.gz</code> — pide confirmación escrita y
        respalda el estado actual antes de sobrescribir nada.
        <br />
        <br />
        Descargue una copia de vez en cuando y guárdela en otro lugar: un respaldo que vive en la
        misma máquina que la base protege del error, no del incendio.
      </div>

      <div className="admin-table-container">
        {respaldos.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">🗄️</div>
            <p className="admin-empty-text">
              No hay ningún respaldo todavía. Cree el primero con «Respaldar ahora».
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Contenido</th>
                <th>Fecha</th>
                <th>Tamaño</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {respaldos.map((r) => (
                <tr key={r.nombre}>
                  <td className="admin-table-user-name" style={{ fontFamily: 'var(--mono)', fontSize: '0.8125rem' }}>
                    {r.nombre}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${r.tipo === 'base' ? 'admin-badge-publicado' : 'admin-badge-neutro'}`}
                    >
                      {r.tipo === 'base' ? 'Base de datos' : 'Archivos subidos'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {fechaHora(r.creado)}
                    <div className="admin-table-user-email">{antiguedad(r.creado)}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{tamanoLegible(r.bytes)}</td>
                  <td>
                    <div className="admin-acciones">
                      <a
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                        href={ruta(`/api/respaldos/${r.nombre}`)}
                      >
                        Descargar
                      </a>
                      <button
                        className="admin-btn admin-btn-sm admin-btn-danger"
                        disabled={enCurso}
                        onClick={() => {
                          if (
                            confirm(
                              `¿Eliminar ${r.nombre}?\n\nSi es el respaldo más reciente, quedará sin cubrir el trabajo hecho desde el anterior.`,
                            )
                          ) {
                            setAviso(null)
                            iniciar(async () => {
                              try {
                                const resultado = await borrarRespaldo(r.nombre)
                                if (resultado.exito) {
                                  setAviso({ tipo: 'ok', texto: `Se eliminó ${r.nombre}.` })
                                  router.refresh()
                                } else {
                                  setAviso({
                                    tipo: 'error',
                                    texto: resultado.mensaje ?? 'No se pudo eliminar.',
                                  })
                                }
                              } catch (fallo) {
                                setAviso({
                                  tipo: 'error',
                                  texto: motivoDeLaCaida(fallo, 'No se pudo eliminar.'),
                                })
                              }
                            })
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
