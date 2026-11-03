import { Archive, Clock, FolderOpen, HardDrive } from 'lucide-react'
import { Lineas, NoSePudoLeer } from '@/components/admin/Graficos'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { cifra } from '@/lib/graficos'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { diasEntre } from '@/lib/series'
import { corridasDe, cuandoFue, puntosDeTamano, totalDe } from './tablero'

/** Los días que cubre el gráfico: los mismos que conserva el guion nocturno. */
const DIAS_DEL_GRAFICO = 30

/** Lo que dibuja el minigráfico de «Tamaño». */
const RESPALDOS_DEL_MINIGRAFICO = 14

const MB = 1024 * 1024

/** «28 oct 2026», en el servidor: esta pieza no se hidrata. */
const fecha = (valor: string) =>
  new Date(valor).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

/** «3 nov, 03:30», para el respaldo fechado después de la hora del servidor. */
const fechaYHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/**
 * Las cifras, el gráfico de tamaño y «Cómo funciona» de la pestaña de
 * respaldos, con la composición de Penpot (P-007 E5, D-238).
 *
 * De servidor, y llega a `PanelDeRespaldos` ya pintado: el panel es de cliente
 * por sus botones, y estas cifras dicen «hoy 03:30» o «hace 2 días», que
 * calculadas en el navegador pueden no coincidir con las del servidor y tirar
 * la hidratación (D-236).
 *
 * Penpot dibuja además «Probado restaurando · hace 4 días». No se guarda en
 * ningún sitio cuándo se probó a restaurar un respaldo, y la tarjeta no se
 * dibuja hasta que se guarde (E6).
 */
export function TableroDeRespaldos({
  respaldos,
  fallo,
  directorio,
}: {
  respaldos: Respaldo[]
  /** Por qué no se pudo leer el directorio, si pasó: las cifras lo dicen en vez de enseñar ceros. */
  fallo: string | null
  directorio: string
}) {
  const ilegible = fallo !== null
  const corridas = corridasDe(respaldos)
  const ultima = corridas[corridas.length - 1]
  const primera = corridas[0]
  const dias = ultima ? diasEntre(ultima.fecha) : null
  const enDisco = respaldos.reduce((t, r) => t + r.bytes, 0)

  const cuando = ultima ? cuandoFue(ultima.fecha) : null
  const delFuturo = cuando?.delFuturo ?? false

  // En MB salvo que todos pesen menos de uno, como en una instalación recién
  // estrenada: ahí la línea entera serían ceros con una coma.
  const enMB = corridas.some((c) => totalDe(c) >= MB)
  const puntos = puntosDeTamano(corridas, DIAS_DEL_GRAFICO, enMB ? MB : 1024)

  return (
    <>
      <div className="tablero-cifras">
        <Cifra
          titulo="Último respaldo"
          icono={Clock}
          // El mismo umbral que el aviso del Resumen: más de dos días sin
          // respaldo es que la tarea nocturna no está corriendo.
          tono={dias !== null && dias <= 2 && !delFuturo ? 'ok' : 'atencion'}
          ilegible={ilegible}
          valor={ilegible ? '—' : ultima && delFuturo ? fechaYHora(ultima.fecha) : (cuando?.texto ?? 'ninguno')}
          claseValor={!ilegible && (dias === null || dias > 2) ? 'admin-card-value-atencion' : undefined}
          nota={
            ilegible
              ? 'no se pudo leer el directorio de respaldos'
              : !ultima
                ? 'todavía no hay ninguno'
                : delFuturo
                  ? 'posterior a la hora del servidor: el guion y la aplicación usan zonas horarias distintas'
                  : ultima.medios === null
                    ? 'solo la base de datos, sin los archivos subidos'
                    : 'base de datos y archivos subidos'
          }
        />
        <Cifra
          titulo="Tamaño"
          icono={HardDrive}
          tono="info"
          ilegible={ilegible}
          valor={ilegible || !ultima ? '—' : tamanoLegible(totalDe(ultima))}
          serie={ilegible ? undefined : corridas.slice(-RESPALDOS_DEL_MINIGRAFICO).map(totalDe)}
          descripcionDeLaSerie={`Tamaño de cada uno de los últimos ${RESPALDOS_DEL_MINIGRAFICO} respaldos.`}
          nota={
            ilegible || !ultima
              ? 'del último respaldo'
              : `base ${tamanoLegible(ultima.base)}${ultima.medios === null ? '' : ` · archivos ${tamanoLegible(ultima.medios)}`}`
          }
        />
        <Cifra
          titulo="Conservados"
          icono={Archive}
          tono="info"
          ilegible={ilegible}
          valor={ilegible ? '—' : cifra(corridas.length)}
          nota={
            ilegible ? 'no se pudo leer el directorio de respaldos' : primera ? `el más antiguo, del ${fecha(primera.fecha)}` : 'ninguno todavía'
          }
        />
        <Cifra
          titulo="En disco"
          icono={FolderOpen}
          tono="info"
          ilegible={ilegible}
          valor={ilegible ? '—' : tamanoLegible(enDisco)}
          nota={
            <>
              {ilegible ? '' : `${cifra(respaldos.length)} ${respaldos.length === 1 ? 'archivo' : 'archivos'} en `}
              <code className="respaldos-directorio">{directorio}</code>
            </>
          }
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Tamaño de cada respaldo"
          bajada={`Los de los últimos ${DIAS_DEL_GRAFICO} días, en ${enMB ? 'MB' : 'KB'}: el respaldo entero y, aparte, la base de datos`}
          ilegible={ilegible}
        >
          {ilegible ? (
            <NoSePudoLeer que="el directorio de respaldos" />
          ) : (
            <Lineas
              titulo={`Tamaño de cada respaldo de los últimos ${DIAS_DEL_GRAFICO} días`}
              etiquetas={puntos.map((p) => p.etiqueta)}
              detalles={puntos.map((p) => p.detalle)}
              series={[
                { etiqueta: 'Respaldo entero', color: 'var(--marca)', valores: puntos.map((p) => p.total) },
                { etiqueta: 'Base de datos', color: 'var(--cian)', valores: puntos.map((p) => p.base) },
              ]}
              unidad={enMB ? 'MB' : 'KB'}
              decimales={1}
            />
          )}
        </TarjetaDeGrafico>

        <TarjetaDeGrafico titulo="Cómo funciona" bajada="Lo que hacen los guiones del servidor">
          {/* Lo que de verdad hacen `scripts/respaldar.sh` y `restaurar.sh` (y
              sus gemelos `.ps1` del servidor Windows), no lo que dibuja el
              diseño: la restauración no se hace desde aquí, y el botón
              «Respaldar ahora» solo vuelca la base. Si un guion cambia, este
              texto tiene que cambiar con él. */}
          <ol className="respaldos-pasos">
            <li>
              <strong>Cada noche</strong>
              <span>
                La tarea programada del servidor (03:00, salvo que se eligiera otra hora al instalarla) vuelca la base y
                empaqueta los archivos subidos, con la misma marca de tiempo, y comprueba que el volcado se lea.
              </span>
            </li>
            <li>
              <strong>Treinta días</strong>
              <span>
                El mismo guion borra los de más de 30 días (<code>DIAS_A_CONSERVAR</code>). «Respaldar ahora» vuelca
                solo la base, sin los archivos subidos.
              </span>
            </li>
            <li>
              <strong>Restaurar</strong>
              <span>
                Desde la consola del servidor, con <code>scripts/restaurar.sh</code> (o <code>restaurar.ps1</code>):
                pide escribir RESTAURAR, respalda antes lo actual, detiene la aplicación y reemplaza la base entera,
                con los archivos subidos de la misma noche.
              </span>
            </li>
          </ol>
          <div className="admin-aviso admin-aviso-atencion respaldos-advertencia">
            <strong>Viven en la misma máquina que la base.</strong> Protegen del error, no del incendio: descargue uno
            de vez en cuando y guárdelo en otro lugar.
          </div>
        </TarjetaDeGrafico>
      </div>
    </>
  )
}
