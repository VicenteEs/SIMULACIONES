import Link from 'next/link'
import {
  Bone,
  Eye,
  FileText,
  Film,
  FolderOpen,
  Layers,
  ListChecks,
  Plus,
  Scissors,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasVerticales, Minigrafico, NoSePudoLeer, SinDatos } from '@/components/admin/Graficos'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { ESQUEMAS } from '@/admin/esquema'
import { puedeEditar } from '@/lib/guardias'
import { cifra } from '@/lib/graficos'
import { haceCuanto } from '@/lib/series'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { MODULOS_ANUNCIADOS } from '@/lib/modulosAnunciados'
import { InsigniaMantencion } from '@/components/ui/InsigniaMantencion'
import { InterruptorDeMantencion } from '@/components/admin/InterruptorDeMantencion'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'
import {
  DIAS_DE_LECTURA,
  MESES_DE_ALTAS,
  altasPorMes,
  conteoDelModulo,
  lecturasDeLosModulos,
  masRecientes,
  recientesDe,
  resumenDeApoyo,
} from './tablero'
import './contenido.css'

export const dynamic = 'force-dynamic'

/**
 * El icono de cada colección de apoyo. Un mapa y no un campo del esquema: el
 * esquema (`src/admin/esquema.ts`) no sabe nada de la interfaz, y una
 * colección nueva sin entrada aquí cae al icono genérico de documento.
 */
const ICONO_DE_APOYO: Record<string, LucideIcon> = {
  segmentos: Layers,
  'tipos-de-ficha': ListChecks,
  medios: Film,
  'modelos-3d': Layers,
  'huesos-ao': Bone,
  'clasificaciones-ao': ListChecks,
  'tecnicas-quirurgicas': Scissors,
  'fases-quirurgicas': ListChecks,
  instrumental: Wrench,
  maniobras: Stethoscope,
}

const plural = (n: number, singular: string, plural: string) => `${cifra(n)} ${n === 1 ? singular : plural}`

const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Índice del contenido, con el tablero de Penpot (P-007 E5, D-238).
 *
 * Es la portada de trabajo del traumatólogo: qué hay en cada módulo, cuánto
 * está publicado, qué se tocó hace poco y por dónde seguir. Todo lleva al
 * editor propio; nada de aquí sale de la plataforma.
 *
 * Las secciones plegables y «Plegar todo» se fueron con el tablero: estaban
 * porque la página apilaba dos listas largas —cinco tarjetas con sus cinco
 * últimas fichas y diez tarjetas de apoyo—, y lo que queda son dos filas
 * cortas. Plegarlas escondía, de paso, las cifras que esta página tiene que
 * enseñar al entrar.
 */
export default async function PaginaContenido() {
  const { sesion, esAdmin } = await exigirPanel()
  const enMantencion = await modulosEnMantencion()

  // Un editor con módulos asignados solo ve los suyos. Antes se listaban todos
  // y los ajenos se abrían igual: el «no tiene permiso» llegaba al guardar, con
  // la ficha ya escrita. Un administrador, y un editor sin restricción, siguen
  // viéndolo todo.
  //
  // Sin las reservadas al administrador (el equipo del inicio): tienen su propia pestaña en la barra lateral, y
  // repetirlas aquí como «material de apoyo» las mezclaría con lo que usan los cinco módulos.
  const visibles = ESQUEMAS.filter((e) => !e.soloAdmin && puedeEditar(sesion.usuario, e.slug))
  const modulos = visibles.filter((e) => e.familia === 'modulos')
  const apoyo = visibles.filter((e) => e.familia === 'apoyo')
  const slugs = modulos.map((m) => m.slug)

  const payload = await clientePayload()
  const [conteos, recientes, lecturas, altas, apoyos, requisitos] = await Promise.all([
    Promise.all(modulos.map((m) => conteoDelModulo(payload, m.slug))),
    Promise.all(modulos.map((m) => recientesDe(payload, m))),
    // Quién lee y cuánto es del administrador, como en el Resumen.
    esAdmin ? lecturasDeLosModulos(payload, slugs) : null,
    altasPorMes(payload, slugs),
    Promise.all(apoyo.map((e) => resumenDeApoyo(payload, e.slug))),
    // Los requisitos del módulo 06 que nadie ha respondido (D-163): los
    // responde el administrador. `null` si la tabla no contestó.
    esAdmin
      ? payload
          .count({ collection: 'requisitos', where: { estado: { equals: 'propuesto' } }, overrideAccess: true })
          .then((c) => c.totalDocs)
          .catch(() => null)
      : null,
  ])

  const legibles = conteos.filter((c) => c !== null)
  const publicadas = legibles.reduce((t, c) => t + c.publicadas, 0)
  const borradores = legibles.reduce((t, c) => t + (c.total - c.publicadas), 0)
  const ilegibles = modulos.filter((_, i) => conteos[i] === null)
  const ultimas = masRecientes(recientes, 8)
  const hoy = new Date()
  const anunciado = MODULOS_ANUNCIADOS[0]

  return (
    <div>
      <CabeceraDePagina
        titulo="Contenido"
        subtitulo={`Las fichas de los módulos y los catálogos que las ordenan · ${plural(publicadas, 'publicada', 'publicadas')}${
          borradores > 0 ? ` · ${cifra(borradores)} en borrador` : ''
        }`}
      />

      {/* Una tabla que no responde se veía igual que un módulo recién
          instalado: tarjeta a cero y «sin contenido aún». */}
      {ilegibles.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>La base no respondió por parte del contenido.</strong>
          Donde aparece «—» no hay un cero: es un recuento que no se pudo hacer (
          {ilegibles.map((m) => NOMBRE_DE_MODULO[m.slug] ?? m.plural).join(', ')}). El detalle queda en el registro del
          servidor.
        </div>
      ) : null}

      {borradores > 0 ? (
        <div className="admin-aviso admin-aviso-info">
          <strong>
            Hay {borradores} ficha{borradores === 1 ? '' : 's'} sin publicar.
          </strong>
          Un borrador no lo ve ningún lector, ni siquiera con el enlace directo. Publicarlo es un
          acto explícito desde el editor.
        </div>
      ) : null}

      <div className="contenido-modulos">
        {modulos.map((esquema, i) => {
          // El color y el icono del módulo, los mismos de la portada y de la
          // barra del sitio: quien edita reconoce de un vistazo de cuál habla.
          const identidad = IDENTIDAD_DE_MODULO[esquema.slug]
          const Icono = identidad?.icono ?? FileText
          const conteo = conteos[i]
          const datos = MODULOS.find((m) => m.slug === esquema.slug)
          const numero = datos?.numero
          const nombre = NOMBRE_DE_MODULO[esquema.slug] ?? esquema.plural
          const serie = lecturas?.porModulo[esquema.slug]
          const leidas = serie?.reduce((t, v) => t + v, 0) ?? 0
          const porcentaje = conteo && conteo.total > 0 ? Math.round((conteo.publicadas / conteo.total) * 100) : null
          return (
            <section
              key={esquema.slug}
              className={`admin-card tarjeta-modulo contenido-modulo${identidad ? ` ${identidad.clase}` : ''}${
                conteo === null ? ' admin-card-ilegible' : ''
              }`}
              aria-labelledby={`modulo-${esquema.slug}`}
            >
              <div className="tarjeta-modulo-cabeza">
                <span className="icono-modulo">
                  <Icono aria-hidden size={20} />
                </span>
                <div className="contenido-modulo-titulo">
                  {numero ? <span className="contenido-modulo-numero">{numero}</span> : null}
                  <h2 className="tarjeta-modulo-nombre" id={`modulo-${esquema.slug}`}>
                    {nombre}
                  </h2>
                </div>
                {enMantencion.includes(esquema.slug) ? <InsigniaMantencion /> : null}
              </div>
              {/* El interruptor es solo del administrador: el editor ve la
                  marca de arriba, pero no decide quién ve qué. */}
              {esAdmin ? (
                <InterruptorDeMantencion modulo={esquema.slug} nombre={nombre} enMantencion={enMantencion.includes(esquema.slug)} />
              ) : null}

              <div className="contenido-modulo-cifras">
                <div className="contenido-modulo-total">
                  <span className="admin-card-value">{conteo ? cifra(conteo.total) : '—'}</span>
                  <span className="contenido-modulo-nota">
                    {conteo
                      ? `${conteo.total === 1 ? 'ficha' : 'fichas'} · ${plural(conteo.publicadas, 'publicada', 'publicadas')}`
                      : 'no se pudo contar'}
                  </span>
                </div>
                {/* Solo con lecturas de verdad: una línea plana a cero junto a un
                    módulo que nadie abre todavía se lee igual que una rota. */}
                {serie && leidas > 0 ? (
                  <Minigrafico
                    valores={serie}
                    ancho={120}
                    alto={36}
                    color="var(--acento)"
                    descripcion={`Fichas de ${nombre} abiertas cada día de los últimos ${DIAS_DE_LECTURA} días.`}
                  />
                ) : null}
              </div>

              {porcentaje !== null ? (
                <div className="contenido-avance">
                  <span className="progreso" aria-hidden>
                    <span style={{ width: `${porcentaje}%` }} />
                  </span>
                  <span className="contenido-avance-cifra">{porcentaje} % publicado</span>
                </div>
              ) : conteo ? (
                <span className="contenido-modulo-nota">Sin fichas aún.</span>
              ) : null}

              {esAdmin ? (
                <span className="contenido-modulo-nota">
                  {lecturas === null
                    ? 'no se pudo leer el registro de lecturas'
                    : `${plural(leidas, 'apertura', 'aperturas')} en los últimos ${DIAS_DE_LECTURA} días`}
                </span>
              ) : null}

              <div className="admin-card-actions contenido-modulo-acciones">
                <Link href={`/admin-panel/contenido/${esquema.slug}`} className="admin-btn admin-btn-secondary admin-btn-sm">
                  <FolderOpen aria-hidden size={15} />
                  Abrir
                </Link>
                <Link href={`/admin-panel/contenido/${esquema.slug}/nuevo`} className="admin-btn admin-btn-ghost admin-btn-sm">
                  <Plus aria-hidden size={15} />
                  Nueva
                </Link>
                {/* La portada del módulo y no `rutaPublica(slug, '')`: para
                    el examen físico, que no tiene página por ficha, aquella
                    devuelve el ancla de una maniobra sin número. */}
                <Link href={datos?.ruta ?? '/'} className="admin-btn admin-btn-ghost admin-btn-sm">
                  <Eye aria-hidden size={15} />
                  Ver público
                </Link>
              </div>
            </section>
          )
        })}

        {/* El módulo que viene (D-163): sin fichas todavía, pero con un buzón
            de requisitos que alguien tiene que responder. */}
        {anunciado ? (
          <Link href={anunciado.ruta} className="contenido-anunciado">
            <span className="icono-modulo" aria-hidden>
              <Plus size={20} />
            </span>
            <strong>Módulo {anunciado.numero}</strong>
            <span>{anunciado.nombre}</span>
            <span className="contenido-modulo-nota">
              {requisitos === null
                ? esAdmin
                  ? 'Propuesto · no se pudieron contar sus requisitos'
                  : 'Propuesto, reuniendo requisitos'
                : requisitos === 0
                  ? 'Propuesto · ningún requisito espera respuesta'
                  : `Propuesto · ${plural(requisitos, 'requisito espera', 'requisitos esperan')} respuesta`}
            </span>
          </Link>
        ) : null}
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico titulo="Material de apoyo" bajada="Catálogos y archivos que usan las fichas de los cinco módulos">
          {apoyo.length === 0 ? (
            <SinDatos texto="Ningún catálogo a su cargo." />
          ) : (
            <div className="admin-table-container">
              <table className="admin-table tabla-apilable">
                <thead>
                  <tr>
                    <th scope="col">Catálogo</th>
                    <th scope="col">Filas</th>
                    <th scope="col">Nuevas · 7 días</th>
                    <th scope="col">Última edición</th>
                  </tr>
                </thead>
                <tbody>
                  {apoyo.map((esquema, i) => {
                    const Icono = ICONO_DE_APOYO[esquema.slug] ?? FileText
                    const resumen = apoyos[i]
                    return (
                      <tr key={esquema.slug}>
                        <th scope="row">
                          <Link href={`/admin-panel/contenido/${esquema.slug}`} className="contenido-apoyo-nombre">
                            <Icono aria-hidden size={16} />
                            {esquema.plural}
                          </Link>
                        </th>
                        <td className="auditoria-numero contenido-apoyo-cifra" data-etiqueta="Filas">
                          {resumen.filas === null ? '—' : cifra(resumen.filas)}
                        </td>
                        <td className="contenido-apoyo-cifra" data-etiqueta="Nuevas · 7 días">
                          {resumen.nuevas === null ? (
                            '—'
                          ) : resumen.nuevas > 0 ? (
                            <span className="insignia insignia-info">+{cifra(resumen.nuevas)}</span>
                          ) : (
                            <span className="revision-tenue">ninguna</span>
                          )}
                        </td>
                        <td className="u-nowrap" data-etiqueta="Última edición">
                          {resumen.ultimaEdicion ? haceCuanto(resumen.ultimaEdicion, hoy) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TarjetaDeGrafico>

        <TarjetaDeGrafico
          titulo="Fichas creadas por mes"
          bajada={`${slugs.length === MODULOS.length ? 'Los cinco módulos juntos' : 'Sus módulos juntos'}, borradores incluidos, de las que existen hoy`}
          ilegible={altas === null}
        >
          {altas === null ? (
            <NoSePudoLeer que="las fichas de los módulos" />
          ) : (
            <>
              <BarrasVerticales
                titulo={`Fichas creadas cada uno de los últimos ${MESES_DE_ALTAS} meses`}
                datos={altas.meses.map((m, i) => ({ etiqueta: m.etiqueta, valor: altas.valores[i], detalle: m.detalle }))}
              />
              {/* El mes que corre se compara mal con los cerrados: decirlo
                  evita leer su barra corta como un frenazo. */}
              <p className="contenido-modulo-nota">
                {`${MES_LARGO[hoy.getMonth()].replace(/^./, (l) => l.toUpperCase())} va en su día ${hoy.getDate()}.`}
              </p>
            </>
          )}
        </TarjetaDeGrafico>
      </div>

      <TarjetaDeGrafico
        titulo="Editadas hace poco"
        bajada="Las últimas fichas que alguien tocó, de todos sus módulos"
      >
        {ultimas.length === 0 ? (
          <SinDatos texto="Todavía no hay fichas." />
        ) : (
          <ul className="contenido-recientes">
            {ultimas.map((r) => (
              <li key={`${r.coleccion}/${r.id}`}>
                <Link href={`/admin-panel/contenido/${r.coleccion}/${r.id}`}>{r.titulo}</Link>
                <span className="insignia insignia-neutra">{NOMBRE_DE_MODULO[r.coleccion] ?? r.coleccion}</span>
                {!r.publicada ? <span className="insignia insignia-atencion">borrador</span> : null}
                <span className="contenido-fecha">{r.editada ? haceCuanto(r.editada, hoy) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </TarjetaDeGrafico>
    </div>
  )
}
