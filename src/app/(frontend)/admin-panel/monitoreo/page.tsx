import Link from 'next/link'
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Cloud,
  Cpu,
  Database,
  Eye,
  HardDrive,
  MemoryStick,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { exigirPanelCentral } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasHorizontales, BarrasVerticales, Lineas, SinDatos } from '@/components/admin/Graficos'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { Cifra, type Cambio } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { cifra } from '@/lib/graficos'
import { claseDeInsignia } from '@/lib/tonosDeEstado'
import { tamanoLegible } from '@/lib/respaldos'
import { UMBRAL_DE_USO } from '@/lib/espacioEnDisco'
import { configuracionDelContador } from '@/lib/contador'
import { configuracionDeCloudflare, contarPor, nombreDeLaAccion, nombreDelOrigen, DIAS_DE_SEGURIDAD, DIAS_DE_TRAFICO } from '@/lib/cloudflare'
import { seguridadDeCloudflare, traficoDeCloudflare, type Resultado } from '@/lib/cloudflareServidor'
import {
  discoOcupado,
  fotoAtrasada,
  memoriaOcupada,
  minutosDesde,
  promedioPorTramos,
  tiempoEncendido,
  type FotoDelServidor,
  type Muestra,
} from '@/lib/estadoDelServidor'
import { leerElEstadoDelServidor, type EstadoLeido } from '@/lib/estadoDelServidorServidor'
import {
  NOMBRE_DEL_PERIODO,
  PERIODOS_DE_VISITAS,
  PERIODO_DE_VISITAS_POR_OMISION,
  intervaloDe,
  lugarDelSitio,
  nombreDelEquipo,
  nombreDelPais,
  periodoDeVisitas,
  periodoEnPalabras,
  serieCompleta,
  type PeriodoDeVisitas,
} from '@/lib/visitas'
import { visitasDelPeriodo, type VisitasDelPeriodo } from '@/lib/visitasServidor'
import '../seguimiento.css'
import '../estadisticas/estadisticas.css'
import './monitoreo.css'

export const dynamic = 'force-dynamic'

/**
 * El monitoreo de la producción (P-016 E7, D-377 y D-408): el estado del
 * servidor, las visitas por página y lo que ve Cloudflare.
 *
 * Solo para el administrador de TraumaHub: es el servidor de todas las
 * instituciones, y las visitas de cada una salen aquí juntas.
 *
 * Cada parte se lee por su lado y falla por su lado. Las tres dependen de
 * algo de fuera de la aplicación —un cron del anfitrión, un contenedor, una
 * API—, y que una no responda no debe esconder las otras dos. Donde falta algo
 * se dice qué falta y dónde se pone, no un cero: fuera de Contabo las tres
 * están vacías a propósito.
 */

const ZONA = 'America/Santiago'
const hora = (fecha: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha)
const fechaYHora = (fecha: Date) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fecha)
const porcentajeDe = (parte: number, total: number) => (total > 0 ? Math.round((1000 * parte) / total) / 10 : 0)
const cambioRelativo = (actual: number, anterior: number | undefined, respecto: string): Cambio | null =>
  anterior && anterior > 0 ? { valor: Math.round((100 * (actual - anterior)) / anterior), unidad: '%', buenoSiSube: true, respecto } : null

export default async function PaginaDeMonitoreo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanelCentral('admin')
  const periodo = periodoDeVisitas((await searchParams).periodo)
  const ahora = new Date()
  const contador = configuracionDelContador()
  const cloudflare = configuracionDeCloudflare()
  const intervalo = intervaloDe(periodo, ahora)

  const [estado, visitas, trafico, seguridad] = await Promise.all([
    leerElEstadoDelServidor(),
    contador
      ? visitasDelPeriodo(contador, intervalo).then(
          (datos): Resultado<VisitasDelPeriodo> => ({ ok: true, datos }),
          (error: Error): Resultado<VisitasDelPeriodo> => ({ ok: false, error: error.message }),
        )
      : null,
    cloudflare ? traficoDeCloudflare(cloudflare, ahora) : null,
    cloudflare ? seguridadDeCloudflare(cloudflare, ahora) : null,
  ])

  return (
    <div className="estadisticas monitoreo">
      <CabeceraDePagina titulo="Monitoreo" subtitulo="El servidor de producción, las visitas por página y lo que ve Cloudflare" />
      <PlegarTodo />
      <SeccionDelServidor estado={estado} ahora={ahora} />
      <SeccionDeVisitas visitas={visitas} periodo={periodo} intervalo={intervalo} />
      <SeccionDeCloudflare trafico={trafico} seguridad={seguridad} />
    </div>
  )
}

// ---------------------------------------------------------------- servidor

function SeccionDelServidor({ estado, ahora }: { estado: EstadoLeido; ahora: Date }) {
  const resumen =
    estado.tipo === 'listo'
      ? fotoAtrasada(estado.foto, ahora)
        ? `sin foto desde hace ${minutosDesde(estado.foto, ahora)} min`
        : `foto de las ${hora(estado.foto.fecha)}`
      : estado.tipo === 'sin-guion'
        ? 'sin el guion en este servidor'
        : 'no se pudo leer'
  return (
    <SeccionPlegable clave="monitoreo.servidor" titulo="El servidor" resumen={resumen}>
      {estado.tipo === 'sin-guion' ? (
        <div className="admin-aviso admin-aviso-info" role="status">
          <strong>Este servidor no anota su estado.</strong>
          Lo anota cada minuto <code>scripts/estado-del-servidor.sh</code>, desde el cron que instala
          <code>scripts/preparar-monitoreo.sh</code>. Solo la producción lo tiene (D-408); en ved y en el equipo de desarrollo esta
          parte queda vacía.
        </div>
      ) : estado.tipo === 'ilegible' ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>El estado del servidor no se pudo leer.</strong>
          {estado.detalle}
        </div>
      ) : (
        <FotoDelServidorEnPantalla foto={estado.foto} historial={estado.historial} ahora={ahora} />
      )}
    </SeccionPlegable>
  )
}

function FotoDelServidorEnPantalla({ foto, historial, ahora }: { foto: FotoDelServidor; historial: Muestra[]; ahora: Date }) {
  const atrasada = fotoAtrasada(foto, ahora)
  const memoria = foto.memoria ? memoriaOcupada(foto.memoria) : null
  const disco = foto.discos[0] ?? null
  const discoPct = disco ? discoOcupado(disco) : null
  const desde = new Date(ahora.getTime() - 24 * 3_600_000)
  // Los tramos sin muestra se saltan: el gráfico de líneas une los puntos que
  // recibe, y un cero inventado diría que el servidor estuvo ocioso.
  const todos = promedioPorTramos(historial, desde, ahora)
  const tramos = todos.filter((t) => t.cpu !== null && t.memoria !== null)
  // Los huecos se cuentan desde la primera muestra: antes de que el guion
  // empezara no faltó nada, todavía no había nada.
  const primero = todos.findIndex((t) => t.cpu !== null && t.memoria !== null)
  const huecos = primero < 0 ? 0 : todos.slice(primero).length - tramos.length

  return (
    <>
      {atrasada ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>El guion no escribe desde hace {minutosDesde(foto, ahora)} minutos.</strong>
          Lo de abajo es de las {fechaYHora(foto.fecha)}. Lo corriente es que se haya detenido el cron del servidor, o que
          el servidor esté tan cargado que no alcanza a correrlo: mire <code>crontab -l</code> y la carga por SSH.
        </div>
      ) : null}
      {foto.errorDocker ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>Docker no respondió al guion: faltan los contenedores.</strong>
          {foto.errorDocker}
        </div>
      ) : null}

      <div className="tablero-cifras">
        <Cifra
          titulo="Procesador"
          icono={Cpu}
          tono={foto.cpu !== null && foto.cpu >= 85 ? 'atencion' : 'ok'}
          valor={foto.cpu === null ? '—' : `${cifra(foto.cpu, 1)} %`}
          nota={
            foto.carga
              ? `carga ${foto.carga.map((c) => cifra(c, 2)).join(' · ')}${foto.nucleos ? ` con ${foto.nucleos} núcleos` : ''}`
              : 'en el segundo que se midió'
          }
        />
        <Cifra
          titulo="Memoria"
          icono={MemoryStick}
          tono={memoria !== null && memoria >= 90 ? 'atencion' : 'ok'}
          valor={memoria === null ? '—' : `${cifra(memoria, 1)} %`}
          nota={
            foto.memoria
              ? `${tamanoLegible(foto.memoria.total - foto.memoria.disponible)} de ${tamanoLegible(foto.memoria.total)}${
                  foto.intercambio && foto.intercambio.total > 0
                    ? ` · intercambio ${tamanoLegible(foto.intercambio.total - foto.intercambio.libre)}`
                    : ''
                }`
              : 'sin dato'
          }
        />
        <Cifra
          titulo="Disco"
          icono={HardDrive}
          tono={discoPct !== null && discoPct >= UMBRAL_DE_USO ? 'atencion' : 'ok'}
          valor={discoPct === null ? '—' : `${cifra(discoPct, 1)} %`}
          nota={disco ? `quedan ${tamanoLegible(disco.libre)} de ${tamanoLegible(disco.total)}` : 'sin dato'}
        />
        <Cifra
          titulo="Encendido"
          icono={Clock}
          tono="info"
          valor={foto.encendidoSegundos === null ? '—' : tiempoEncendido(foto.encendidoSegundos)}
          nota={`foto de las ${hora(foto.fecha)}`}
        />
      </div>

      <div className="tablero-fila tablero-fila-mitades">
        <TarjetaDeGrafico
          titulo="Procesador y memoria en las últimas 24 horas"
          bajada={`Promedio de cada 10 minutos, en porcentaje${huecos > 0 ? `. Faltan ${huecos} tramos sin muestra, que se saltan` : ''}`}
        >
          {tramos.length < 2 ? (
            <SinDatos texto="Todavía no hay historial: el guion lo va juntando minuto a minuto." />
          ) : (
            <Lineas
              titulo="Procesador y memoria ocupados en las últimas 24 horas"
              etiquetas={tramos.map((t) => hora(t.inicio))}
              detalles={tramos.map((t) => fechaYHora(t.inicio))}
              series={[
                { etiqueta: 'Procesador', color: 'var(--marca)', valores: tramos.map((t) => t.cpu ?? 0) },
                { etiqueta: 'Memoria', color: 'var(--cian)', valores: tramos.map((t) => t.memoria ?? 0) },
              ]}
              unidad="%"
              decimales={1}
            />
          )}
        </TarjetaDeGrafico>

        <TarjetaDeGrafico titulo="Contenedores" bajada={`${foto.contenedores.length} en el servidor, según Docker`}>
          {foto.contenedores.length === 0 ? (
            <SinDatos texto="Sin contenedores en la foto." />
          ) : (
            <table className="admin-table tabla-apilable monitoreo-contenedores">
              <thead>
                <tr>
                  <th>Contenedor</th>
                  <th>Estado</th>
                  <th>Procesador</th>
                  <th>Memoria</th>
                </tr>
              </thead>
              <tbody>
                {foto.contenedores.map((c) => {
                  const sano = c.estado === 'running' && !/unhealthy/i.test(c.detalle)
                  return (
                    <tr key={c.nombre}>
                      <th scope="row" className="admin-table-user-name">
                        {c.nombre}
                        <span className="monitoreo-detalle">{c.detalle}</span>
                      </th>
                      <td data-etiqueta="Estado">
                        <span className={claseDeInsignia(sano ? 'ok' : 'atencion')}>
                          {sano ? <CircleCheck aria-hidden size={12} /> : <TriangleAlert aria-hidden size={12} />}
                          {sano ? 'En marcha' : c.estado === 'running' ? 'Enfermo' : 'Detenido'}
                        </span>
                      </td>
                      <td data-etiqueta="Procesador">{c.cpu === null ? '—' : `${cifra(c.cpu, 1)} %`}</td>
                      <td data-etiqueta="Memoria">{c.memoria === null ? '—' : tamanoLegible(c.memoria)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </TarjetaDeGrafico>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- visitas

const rutaDelPeriodo = (p: PeriodoDeVisitas) =>
  p === PERIODO_DE_VISITAS_POR_OMISION ? '/admin-panel/monitoreo' : `/admin-panel/monitoreo?periodo=${p}`

function SelectorDePeriodo({ actual }: { actual: PeriodoDeVisitas }) {
  return (
    <div className="estadisticas-periodo" role="group" aria-label="Periodo de las visitas">
      <span className="estadisticas-periodo-rotulo">
        <CalendarDays aria-hidden size={16} />
        Periodo
      </span>
      {PERIODOS_DE_VISITAS.map((p) => (
        <Link
          key={p}
          href={rutaDelPeriodo(p)}
          className={`estadisticas-periodo-opcion${p === actual ? ' activa' : ''}`}
          aria-current={p === actual ? 'true' : undefined}
          scroll={false}
        >
          {NOMBRE_DEL_PERIODO[p]}
        </Link>
      ))}
    </div>
  )
}

function dominioPropio(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? '').hostname || 'traumahub.cl'
  } catch {
    return 'traumahub.cl'
  }
}

function SeccionDeVisitas({
  visitas,
  periodo,
  intervalo,
}: {
  visitas: Resultado<VisitasDelPeriodo> | null
  periodo: PeriodoDeVisitas
  intervalo: ReturnType<typeof intervaloDe>
}) {
  const enPalabras = periodoEnPalabras(periodo)
  const resumen = !visitas
    ? 'sin Umami en este servidor'
    : !visitas.ok
      ? 'no se pudo leer'
      : visitas.datos.resumen
        ? `${cifra(visitas.datos.resumen.actual.vistas)} páginas vistas en ${enPalabras}`
        : 'sin cifras'

  return (
    <SeccionPlegable
      clave="monitoreo.visitas"
      titulo="Visitas por página"
      resumen={resumen}
      acciones={visitas ? <SelectorDePeriodo actual={periodo} /> : undefined}
    >
      {!visitas ? (
        <div className="admin-aviso admin-aviso-info" role="status">
          <strong>Este servidor no cuenta visitas.</strong>
          Las cuenta Umami, que está solo en la producción, escondido dentro del servidor y sin cookies (D-408). Lo
          activa <code>scripts/preparar-monitoreo.sh</code>.
        </div>
      ) : !visitas.ok ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>Umami no respondió.</strong>
          {visitas.error} Las visitas se siguen contando si Umami está en marcha; aquí solo falla la lectura.
        </div>
      ) : (
        <VisitasEnPantalla datos={visitas.datos} intervalo={intervalo} enPalabras={enPalabras} />
      )}
    </SeccionPlegable>
  )
}

function VisitasEnPantalla({
  datos,
  intervalo,
  enPalabras,
}: {
  datos: VisitasDelPeriodo
  intervalo: ReturnType<typeof intervaloDe>
  enPalabras: string
}) {
  const actual = datos.resumen?.actual
  const anterior = datos.resumen?.anterior ?? undefined
  const respecto = `que en el periodo anterior del mismo largo`
  const serie = serieCompleta(datos.serie, intervalo.desde, intervalo.hasta, intervalo.unidad)
  const dominio = dominioPropio()

  return (
    <>
      <div className="tablero-cifras">
        <Cifra
          titulo="Páginas vistas"
          icono={Eye}
          tono="ok"
          ilegible={!actual}
          valor={actual ? cifra(actual.vistas) : '—'}
          nota={`en ${enPalabras}`}
          cambio={actual ? cambioRelativo(actual.vistas, anterior?.vistas, respecto) : null}
        />
        <Cifra
          titulo="Visitantes"
          icono={Users}
          tono="ok"
          ilegible={!actual}
          valor={actual ? cifra(actual.visitantes) : '—'}
          nota={datos.activos !== null ? `${cifra(datos.activos)} en los últimos 5 minutos` : 'personas distintas, según Umami'}
          cambio={actual ? cambioRelativo(actual.visitantes, anterior?.visitantes, respecto) : null}
        />
        <Cifra
          titulo="Visitas"
          icono={Database}
          tono="info"
          ilegible={!actual}
          valor={actual ? cifra(actual.visitas) : '—'}
          nota={actual && actual.visitas > 0 ? `${cifra(porcentajeDe(actual.rebotes, actual.visitas), 1)} % de una sola página` : 'recorridos de una vez'}
        />
        <Cifra
          titulo="Tiempo por visita"
          icono={Timer}
          tono="info"
          ilegible={!actual}
          valor={actual && actual.visitas > 0 ? duracion(actual.tiempoTotal / actual.visitas) : '—'}
          nota="en promedio"
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo={intervalo.unidad === 'day' ? 'Páginas vistas por día' : 'Páginas vistas por hora'}
          bajada={`En ${enPalabras}, en la hora de Chile`}
        >
          <BarrasVerticales
            titulo={`Páginas vistas por ${intervalo.unidad === 'day' ? 'día' : 'hora'} en ${enPalabras}`}
            datos={serie.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor, detalle: p.detalle }))}
          />
        </TarjetaDeGrafico>
        <TarjetaDeGrafico titulo="Por lugar" bajada="Visitantes de TraumaHub y de cada institución">
          <BarrasHorizontales
            titulo="Visitantes por lugar"
            datos={datos.sitios.map((f) => ({ etiqueta: lugarDelSitio(f.etiqueta, dominio), valor: f.valor }))}
          />
        </TarjetaDeGrafico>
      </div>

      <div className="tablero-fila tablero-fila-mitades">
        <TarjetaDeGrafico
          titulo="Las páginas más visitadas"
          bajada="Visitantes por página. Los números del panel y los testigos de las direcciones no se guardan: salen como «:id» y «:testigo»"
        >
          <BarrasHorizontales titulo="Visitantes por página" datos={datos.paginas.map((f) => ({ etiqueta: f.etiqueta || '/', valor: f.valor }))} />
        </TarjetaDeGrafico>
        <TarjetaDeGrafico titulo="De dónde llegan" bajada="Visitantes por sitio de origen. Sin origen: escribieron la dirección o venían de un marcador">
          <BarrasHorizontales
            titulo="Visitantes por sitio de origen"
            datos={datos.origenes.map((f) => ({ etiqueta: f.etiqueta || 'Sin origen', valor: f.valor }))}
          />
        </TarjetaDeGrafico>
        <TarjetaDeGrafico titulo="Países" bajada="Según Cloudflare">
          <BarrasHorizontales titulo="Visitantes por país" datos={datos.paises.map((f) => ({ etiqueta: nombreDelPais(f.etiqueta), valor: f.valor }))} />
        </TarjetaDeGrafico>
        <TarjetaDeGrafico titulo="Equipos" bajada="Según el navegador">
          <BarrasHorizontales titulo="Visitantes por equipo" datos={datos.equipos.map((f) => ({ etiqueta: nombreDelEquipo(f.etiqueta), valor: f.valor }))} />
        </TarjetaDeGrafico>
      </div>
    </>
  )
}

function duracion(segundos: number): string {
  const s = Math.round(segundos)
  if (s < 60) return `${s} s`
  const minutos = Math.floor(s / 60)
  return minutos < 60 ? `${minutos} min ${s % 60} s` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`
}

// ---------------------------------------------------------------- Cloudflare

function SeccionDeCloudflare({
  trafico,
  seguridad,
}: {
  trafico: Awaited<ReturnType<typeof traficoDeCloudflare>> | null
  seguridad: Awaited<ReturnType<typeof seguridadDeCloudflare>> | null
}) {
  const resumen = !trafico
    ? 'sin el token en este servidor'
    : !trafico.ok
      ? 'no se pudo leer'
      : `${cifra(trafico.datos.dias.reduce((t, d) => t + d.peticiones, 0))} peticiones en ${DIAS_DE_TRAFICO} días`

  return (
    <SeccionPlegable clave="monitoreo.cloudflare" titulo="Lo que ve Cloudflare" resumen={resumen}>
      {!trafico ? (
        <div className="admin-aviso admin-aviso-info" role="status">
          <strong>Este servidor no tiene el token de Cloudflare.</strong>
          Se pone en el <code>.env</code> de la producción: <code>CLOUDFLARE_TOKEN</code>, un token de solo lectura con el permiso «Zone ·
          Analytics · Read» sobre la zona, y <code>CLOUDFLARE_ZONA</code>, el identificador de la zona (D-408).
        </div>
      ) : (
        <>
          {!trafico.ok ? (
            <div className="admin-aviso admin-aviso-atencion" role="status">
              <strong>Cloudflare no dio el tráfico.</strong>
              {trafico.error}
            </div>
          ) : (
            <TraficoEnPantalla dias={trafico.datos.dias} paises={trafico.datos.paises} />
          )}
          {seguridad && !seguridad.ok ? (
            <div className="admin-aviso admin-aviso-atencion" role="status">
              <strong>Cloudflare no dio los eventos de seguridad.</strong>
              {seguridad.error}
            </div>
          ) : seguridad?.ok ? (
            <SeguridadEnPantalla eventos={seguridad.datos.eventos} tope={seguridad.datos.tope} />
          ) : null}
        </>
      )}
    </SeccionPlegable>
  )
}

function TraficoEnPantalla({
  dias,
  paises,
}: {
  dias: { fecha: string; peticiones: number; enCache: number; bytes: number; amenazas: number }[]
  paises: { pais: string; peticiones: number }[]
}) {
  const total = dias.reduce((t, d) => t + d.peticiones, 0)
  const enCache = dias.reduce((t, d) => t + d.enCache, 0)
  const bytes = dias.reduce((t, d) => t + d.bytes, 0)
  const amenazas = dias.reduce((t, d) => t + d.amenazas, 0)
  // Cloudflare cuenta por día en hora universal: el día se escribe en esa hora
  // para que el 16 no salga como «15 nov» en la de Chile.
  const etiquetaDe = (fecha: string) =>
    new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${fecha}T00:00:00Z`))
  const largaDe = (fecha: string) =>
    new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T00:00:00Z`))

  return (
    <>
      <div className="tablero-cifras">
        <Cifra
          titulo="Peticiones"
          icono={Cloud}
          tono="ok"
          valor={cifra(total)}
          nota={`en ${DIAS_DE_TRAFICO} días`}
          serie={dias.map((d) => d.peticiones)}
          descripcionDeLaSerie={`Peticiones por día en los últimos ${DIAS_DE_TRAFICO} días.`}
        />
        <Cifra
          titulo="Desde la caché"
          icono={Database}
          tono="info"
          valor={`${cifra(porcentajeDe(enCache, total), 1)} %`}
          nota="las que Cloudflare respondió sin llegar al servidor"
        />
        <Cifra titulo="Datos servidos" icono={HardDrive} tono="info" valor={tamanoLegible(bytes)} nota={`en ${DIAS_DE_TRAFICO} días`} />
        <Cifra
          titulo="Amenazas"
          icono={ShieldAlert}
          tono={amenazas > 0 ? 'atencion' : 'ok'}
          valor={cifra(amenazas)}
          nota="peticiones que Cloudflare tuvo por amenaza"
        />
      </div>
      <div className="tablero-fila">
        <TarjetaDeGrafico titulo="Peticiones por día" bajada={`Los últimos ${DIAS_DE_TRAFICO} días, por día en hora universal, como los cuenta Cloudflare`}>
          <BarrasVerticales
            titulo={`Peticiones por día en los últimos ${DIAS_DE_TRAFICO} días`}
            datos={dias.map((d) => ({ etiqueta: etiquetaDe(d.fecha), valor: d.peticiones, detalle: largaDe(d.fecha) }))}
          />
        </TarjetaDeGrafico>
        <TarjetaDeGrafico titulo="Países" bajada={`Peticiones en ${DIAS_DE_TRAFICO} días`}>
          <BarrasHorizontales
            titulo="Peticiones por país"
            datos={paises.slice(0, 10).map((p) => ({ etiqueta: nombreDelPais(p.pais), valor: p.peticiones }))}
          />
        </TarjetaDeGrafico>
      </div>
    </>
  )
}

function SeguridadEnPantalla({
  eventos,
  tope,
}: {
  eventos: { fecha: Date; accion: string; origen: string; pais: string; ruta: string }[]
  tope: boolean
}) {
  const cuantos = `${tope ? 'al menos ' : ''}${cifra(eventos.length)}`
  return (
    <div className="tablero-fila tablero-fila-mitades">
      <TarjetaDeGrafico titulo="Eventos de seguridad" bajada={`${cuantos} en ${DIAS_DE_SEGURIDAD} días, por lo que hizo Cloudflare`}>
        {eventos.length === 0 ? (
          <SinDatos texto={`Ningún evento de seguridad en ${DIAS_DE_SEGURIDAD} días.`} />
        ) : (
          <>
            <BarrasHorizontales
              titulo="Eventos de seguridad por acción"
              datos={contarPor(eventos, (e) => nombreDeLaAccion(e.accion))}
            />
            <BarrasHorizontales titulo="Eventos de seguridad por regla" datos={contarPor(eventos, (e) => nombreDelOrigen(e.origen))} />
          </>
        )}
      </TarjetaDeGrafico>
      <TarjetaDeGrafico titulo="Los últimos" bajada="Sin la IP ni el navegador: no se le piden a Cloudflare">
        {eventos.length === 0 ? (
          <SinDatos texto="Nada que mostrar." />
        ) : (
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Qué hizo</th>
                <th>País</th>
                <th>Ruta</th>
              </tr>
            </thead>
            <tbody>
              {eventos.slice(0, 15).map((e, i) => (
                <tr key={`${e.fecha.getTime()}-${i}`}>
                  <td data-etiqueta="Cuándo">{fechaYHora(e.fecha)}</td>
                  <td data-etiqueta="Qué hizo">
                    {nombreDeLaAccion(e.accion)}
                    <span className="monitoreo-detalle">{nombreDelOrigen(e.origen)}</span>
                  </td>
                  <td data-etiqueta="País">{nombreDelPais(e.pais)}</td>
                  <td data-etiqueta="Ruta" className="monitoreo-ruta">
                    {e.ruta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TarjetaDeGrafico>
    </div>
  )
}
