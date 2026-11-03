'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { borrarRespaldo, respaldarAhora } from '@/app/(frontend)/acciones/respaldos'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { ruta } from '@/lib/rutas'
import { Archive, Database, DatabaseBackup, Download, FolderOpen, Trash2 } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia } from '@/lib/tonosDeEstado'

// Con la zona puesta (D-236): la tabla se pinta en el servidor y se hidrata en
// el navegador, y sin ella cada uno escribía la hora en la suya. El respaldo de
// las 03:00 salía del día anterior visto desde un navegador al oeste, y React
// tiraba la tabla por el desajuste. Es la zona en que el servidor nombra los
// archivos (`TZ` en `docker-compose.prod.yml`).
const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
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
  problemaDelDirectorio = null,
  tablero = null,
}: {
  respaldos: Respaldo[]
  directorio: string
  hayHerramienta: boolean
  /** Por qué no se puede leer o escribir en `directorio`, si pasa (O-067). */
  problemaDelDirectorio?: string | null
  /** Las cifras, el gráfico y «Cómo funciona», ya pintados en el servidor (`TableroDeRespaldos`). */
  tablero?: ReactNode
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  /**
   * El resultado, como aviso flotante: un volcado tarda minutos y quien lo
   * pidió suele haber bajado a la tabla mientras tanto. El error se queda
   * además en la página, porque trae el motivo (`pg_dump`, permisos de la
   * carpeta) y hay que poder releerlo.
   */
  const setAviso = (a: { tipo: 'ok' | 'error'; texto: string } | null) => {
    setError(a?.tipo === 'error' ? a.texto : null)
    if (a) avisar(a.tipo, a.texto)
  }

  const eliminar = async (nombre: string) => {
    const si = await confirmar({
      titulo: `¿Eliminar ${nombre}?`,
      mensaje: 'Si es el respaldo más reciente, quedará sin cubrir el trabajo hecho desde el anterior. No se puede deshacer.',
      confirmar: 'Eliminar respaldo',
      peligro: true,
    })
    if (!si) return
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await borrarRespaldo(nombre)
        if (resultado.exito) {
          setAviso({ tipo: 'ok', texto: `Se eliminó ${nombre}.` })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo eliminar.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo eliminar.') })
      }
    })
  }

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
      <CabeceraDePagina
        titulo="Respaldos"
        // Lo que antes decía el subtítulo —cuántos volcados y cuánto ocupan—
        // lo dicen ahora dos cifras del tablero; aquí queda de dónde salen.
        subtitulo="Copias de la base y de los archivos subidos: una cada noche, y las que se pidan aquí"
        acciones={
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={crear}
            disabled={enCurso || !hayHerramienta}
          >
            <DatabaseBackup aria-hidden size={16} />
            {enCurso ? 'Respaldando…' : 'Respaldar ahora'}
          </button>
        }
      />

      {error ? (
        <div className="admin-aviso admin-aviso-error" role="status">
          {error}
        </div>
      ) : null}

      {problemaDelDirectorio ? (
        // Antes que el aviso de la herramienta: con la carpeta sin permisos el
        // listado sale vacío y el botón falla, y las dos cosas se explican aquí.
        <div className="admin-aviso admin-aviso-error" role="alert">
          {/* Con la ruta: el aviso es lo que se copia para ir a mirar los
              permisos, y el tablero de abajo la deja en una nota pequeña. */}
          <strong>
            El directorio de respaldos (<code>{directorio}</code>) no está disponible para la aplicación.
          </strong>{' '}
          {problemaDelDirectorio} Mientras tanto la tabla de abajo puede salir vacía aunque haya
          respaldos en el disco, y «Respaldar ahora» no podrá escribir el archivo.
        </div>
      ) : null}

      {!hayHerramienta ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No se puede respaldar desde aquí en esta máquina.</strong>
          Falta <code>pg_dump</code> en el entorno donde corre la aplicación. La imagen de
          producción lo incluye; en desarrollo sobre Windows, use{' '}
          <code>docker compose exec db pg_dump</code> o el script{' '}
          <code>scripts/respaldar.sh</code>.
        </div>
      ) : null}

      {/* El aviso azul de «Cómo funciona» pasó a ser una tarjeta del tablero,
          con los pasos que de verdad dan los guiones; el directorio, a la nota
          de «En disco». */}
      {tablero}

      <SeccionPlegable
        clave="respaldos.lista"
        titulo="Archivos"
        resumen={respaldos.length === 1 ? '1 archivo' : `${respaldos.length} archivos`}
      >
        {respaldos.length === 0 ? (
          <Vacio
            icono={Archive}
            titulo="No hay ningún respaldo todavía."
            accion={
              hayHerramienta ? (
                <button type="button" className="admin-btn admin-btn-primary" onClick={crear} disabled={enCurso}>
                  <DatabaseBackup aria-hidden size={16} />
                  Respaldar ahora
                </button>
              ) : undefined
            }
          >
            El primero se crea con «Respaldar ahora»; en el servidor, además, se programa uno diario.
          </Vacio>
        ) : (
          <div className="admin-table-container">
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Contenido</th>
                <th>Fecha</th>
                <th>Tamaño</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {respaldos.map((r) => (
                <tr key={r.nombre}>
                  <th scope="row" className="admin-table-mono">
                    {r.nombre}
                  </th>
                  <td data-etiqueta="Contenido">
                    <span className={claseDeInsignia(r.tipo === 'base' ? 'info' : 'neutra')}>
                      {r.tipo === 'base' ? (
                        <Database aria-hidden size={12} />
                      ) : (
                        <FolderOpen aria-hidden size={12} />
                      )}
                      {r.tipo === 'base' ? 'Base de datos' : 'Archivos subidos'}
                    </span>
                  </td>
                  <td data-etiqueta="Fecha" className="u-nowrap">
                    {fechaHora(r.creado)}
                    <div className="admin-table-user-email">{antiguedad(r.creado)}</div>
                  </td>
                  <td data-etiqueta="Tamaño" className="u-nowrap u-num">
                    {tamanoLegible(r.bytes)}
                  </td>
                  <td className="admin-table-acciones">
                    <div className="admin-table-acciones-fila">
                      <a
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                        href={ruta(`/api/respaldos/${r.nombre}`)}
                      >
                        <Download aria-hidden size={14} />
                        Descargar
                      </a>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-ghost admin-btn-icon"
                        disabled={enCurso}
                        aria-label={`Eliminar ${r.nombre}`}
                        title="Eliminar"
                        onClick={() => eliminar(r.nombre)}
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </SeccionPlegable>
    </div>
  )
}
