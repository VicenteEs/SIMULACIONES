import { CheckCheck, Hourglass, Inbox } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { clientePayload, SLUGS_DE_MODULOS } from '../datos'
import { NOMBRE_DE_DESTINO, SLUG_DEL_TALLER, esCatalogoComentable } from '../modulos'
import { claveDeFicha, leerTitulosDeFichas } from '../titulosDeFichas'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasVerticales, Dona, NoSePudoLeer } from '@/components/admin/Graficos'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { cifra, variacion } from '@/lib/graficos'
import { TablaComentarios, type ComentarioDelPanel } from './TablaComentarios'
import { SEMANAS_DEL_GRAFICO, leerTableroDeComentarios, type TableroDeComentarios } from './tablero'
import './comentarios.css'

export const dynamic = 'force-dynamic'

/** Cuántos comentarios trae el listado de una sola vez. */
const TOPE = 500

/**
 * Comentarios y sugerencias dejados en las fichas.
 *
 * Es el canal por el que el contenido mejora: alguien lee una ficha, ve que
 * falta algo y lo dice ahí mismo. Que ese canal quede desatendido es el fallo
 * más caro del panel, y por eso la barra lateral muestra el número de
 * pendientes en todo momento.
 */
export default async function PaginaComentarios() {
  // Entra también el editor: es quien escribe el contenido y, por tanto, quien
  // resuelve lo que se comenta sobre él. Eliminar sigue siendo cosa del
  // administrador, porque borra la observación de otra persona.
  const { esAdmin } = await exigirPanel()

  const payload = await clientePayload()

  // Sin este `catch`, una consulta que falla —lo corriente: la tabla que falta
  // porque se desplegó un cambio de esquema sin su migración— tumba la página
  // entera con la pantalla genérica de Next, que no nombra la tabla ni deja
  // pista. La base caída del todo no llega hasta aquí y este `catch` no la
  // cubre: `exigirPanel()` (arriba) ya pasó por `obtenerSesion()`, que abre el
  // cliente de Payload sin guardia (`src/lib/sesion.ts`), y `layout.tsx` hace
  // lo mismo antes de pintar la barra lateral; con Postgres sin responder la
  // excepción sale de ahí y este aviso no llega a dibujarse nunca. Cerrar ese
  // hueco es trabajo de `obtenerSesion`/`layout.tsx`, no de esta página:
  // envolver aquí `clientePayload()` solo movería el punto de la caída. Lo que
  // NO se hace es seguir adelante con una lista vacía: «todavía nadie ha
  // comentado» y «no se pudo leer» no son lo mismo, y es la misma confusión que
  // las tarjetas del resumen dejaron de cometer con `ilegible`.
  //
  // Las cifras de arriba se leen a la vez y por su cuenta (`tablero.ts`): de la
  // tabla entera y no de estos quinientos, y con su propio `null` si fallan, de
  // modo que una cifra que no se pudo contar no se lleva la bandeja consigo.
  const [listado, tablero] = await Promise.all([
    payload
      .find({
        collection: 'comentarios',
        limit: TOPE,
        sort: '-createdAt',
        depth: 1,
        overrideAccess: true,
      })
      .catch((error) => {
        console.error('[panel] no se pudo leer la tabla de comentarios:', error)
        return null
      }),
    leerTableroDeComentarios(payload),
  ])

  if (!listado) {
    return (
      <div>
        <CabeceraDePagina titulo="Comentarios y sugerencias" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de comentarios.</strong> Esto no significa que no haya
          ninguno: la consulta falló. Lo corriente es que falte una tabla —un cambio de esquema
          desplegado sin su migración—; el detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const { docs } = listado

  const basicos: Omit<ComentarioDelPanel, 'fichaTitulo' | 'fichaEstado'>[] = docs.map((d) => {
    const c = d as unknown as Record<string, unknown>
    const autor = c.usuario as { nombre?: string; email?: string } | null
    return {
      id: String(c.id),
      texto: String(c.texto ?? ''),
      estado: c.estado === 'resuelto' ? 'resuelto' : 'pendiente',
      coleccion: String(c.coleccion ?? ''),
      documentoId: String(c.documentoId ?? ''),
      creado: String(c.createdAt ?? ''),
      autorNombre: autor?.nombre ?? null,
      autorCorreo: autor?.email ?? null,
    }
  })

  // De qué ficha habla cada comentario.
  //
  // `documentoId` es un campo de texto suelto en `Comentarios`, no una
  // relación, así que la profundidad con la que se leen trae al autor y nunca
  // el documento: hay que ir a buscarlo aparte. Lo hace `leerTitulosDeFichas`,
  // la misma que usan «Fichas más leídas» y la pantalla de actividad, con una
  // consulta por colección y no una por comentario: este listado trae hasta
  // quinientos, y un `findByID` por ficha serían quinientas consultas por carga.
  //
  // Aquí se resolvían a mano, y el `catch` de cada colección dejaba sus fichas
  // sin título igual que si se hubieran borrado. Con la función compartida las
  // dos cosas vuelven separadas —`eliminada` e `ilegible`—, llegan así hasta
  // cada fila y la segunda se cuenta además arriba de la tabla.
  //
  // No se pregunta por lo que no sea uno de los cinco módulos: `coleccion` es
  // un `select` cerrado, pero lo guardado sobrevive a que se retire una opción.
  // Ni por un `documentoId` vacío, que entraría en el `id: { in: … }` de su
  // colección: el adaptador lo pasa tal cual a una columna numérica, y con que
  // PostgreSQL lo rechace falla la consulta entera y todas las fichas de ese
  // módulo salen ilegibles por culpa de una fila.
  const sePregunta = (c: { coleccion: string; documentoId: string }) =>
    ((SLUGS_DE_MODULOS as readonly string[]).includes(c.coleccion) ||
      c.coleccion === SLUG_DEL_TALLER ||
      // La fila nueva de un catálogo: su título es el nombre de la fila (D-177).
      esCatalogoComentable(c.coleccion)) &&
    c.documentoId !== ''
  const referencias = basicos.filter(sePregunta)
  const estados = await leerTitulosDeFichas(payload, referencias)

  // `fichaTitulo` es `null` cuando no hay título, sea cual sea el motivo, y
  // `fichaEstado` dice cuál: con él la fila pinta «Ficha eliminada · #12» sin
  // enlaces, o «Título no disponible · #12» con ellos. Antes solo viajaba el
  // título, y las dos filas se veían igual —el nombre del módulo y dos enlaces
  // que en la borrada acababan en un 404—; el aviso de abajo decía qué módulo
  // había fallado, no qué filas eran de fichas que ya no existen.
  //
  // Lo que se preguntó y no volvió cuenta como `ilegible`, no como `null`: es
  // lo único que no afirma nada sobre la ficha, y el mismo criterio que
  // `estadoDe` en `actividad/page.tsx`. `null` queda para lo que no se llegó a
  // preguntar, que es lo único de lo que se sabe que no hay ficha a la que ir.
  const comentarios: ComentarioDelPanel[] = basicos.map((c) => {
    const estado = sePregunta(c)
      ? (estados.get(claveDeFicha(c.coleccion, c.documentoId)) ?? { tipo: 'ilegible' as const })
      : null
    return {
      ...c,
      fichaTitulo: estado?.tipo === 'titulo' ? estado.titulo : null,
      fichaEstado: estado?.tipo ?? null,
    }
  })

  // Los módulos cuyos títulos no se pudieron leer, sin repetir. La fila ya dice
  // «Título no disponible», pero veinte filas así no cuentan que fue una sola
  // consulta la que falló, ni dónde mirar. Se sacan de `comentarios` y no de
  // `estados` para que el aviso y las filas no discrepen sobre el caso raro de
  // la ficha que se preguntó y no volvió.
  const modulosIlegibles = Array.from(
    new Set(
      comentarios
        .filter((c) => c.fichaEstado === 'ilegible')
        .map((c) => NOMBRE_DE_DESTINO[c.coleccion] ?? c.coleccion),
    ),
  )

  // El aviso y el tablero viajan como hijos de la tabla, que es de cliente y
  // pinta la cabecera: así quedan debajo del título. El aviso iba antes de la
  // tabla y, con ella, por encima del título de la página.
  return (
    <TablaComentarios comentarios={comentarios} puedeEliminar={esAdmin}>
      {modulosIlegibles.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer los títulos de {modulosIlegibles.join(', ')}.</strong> Esas
          fichas aparecen como «Título no disponible», y eso no significa que se hayan eliminado:
          la consulta falló. El detalle queda en el registro del servidor.
        </div>
      ) : null}
      <TableroDeLaBandeja tablero={tablero} />
    </TablaComentarios>
  )
}

const plural = (n: number, singular: string, plural: string) => `${cifra(n)} ${n === 1 ? singular : plural}`

/**
 * Las tres cifras y los dos gráficos de encima de la bandeja (P-007 E5, D-238).
 *
 * Penpot dibuja cuatro cifras y aquí van tres. «Tiempo medio de respuesta» y
 * «Llevaron a un cambio» no se pueden contar, y «Resueltos este mes» quedó en
 * «Resueltos», desde el principio: los tres necesitan la fecha en que se
 * resolvió cada comentario, y la base no la guarda (el porqué, en
 * `tablero.ts`). La tercera cifra son los recibidos en treinta días, que sí
 * tienen fecha. «De qué tratan» tampoco está —un comentario no guarda su tema—
 * y en su sitio va dónde se dejaron, que sí se guarda.
 */
function TableroDeLaBandeja({ tablero }: { tablero: TableroDeComentarios | null }) {
  const ilegible = tablero === null
  const cambio = tablero ? variacion(tablero.recibidos30, tablero.recibidosAntes30) : null
  return (
    <>
      <div className="tablero-cifras tablero-cifras-3">
        <Cifra
          titulo="Pendientes"
          icono={Hourglass}
          tono={tablero && tablero.pendientes > 0 ? 'atencion' : 'ok'}
          ilegible={ilegible}
          claseValor={tablero && tablero.pendientes > 0 ? 'admin-card-value-atencion' : undefined}
          valor={tablero ? cifra(tablero.pendientes) : '—'}
          nota={
            !tablero
              ? 'no se pudo leer la tabla de comentarios'
              : tablero.diasDelMasAntiguo === null
                ? 'ninguno espera respuesta'
                : tablero.diasDelMasAntiguo === 0
                  ? 'el más antiguo es de hoy'
                  : `el más antiguo lleva ${plural(tablero.diasDelMasAntiguo, 'día', 'días')} esperando`
          }
        />
        <Cifra
          titulo="Resueltos"
          icono={CheckCheck}
          tono="ok"
          ilegible={ilegible}
          valor={tablero ? cifra(tablero.resueltos) : '—'}
          nota={
            !tablero
              ? 'no se pudo leer la tabla de comentarios'
              : tablero.total === 0
                ? 'todavía no ha llegado ninguno'
                : `de ${plural(tablero.total, 'recibido', 'recibidos')} desde el principio · ${Math.round(
                    (tablero.resueltos / tablero.total) * 100,
                  )} %`
          }
        />
        <Cifra
          titulo="Recibidos · 30 días"
          icono={Inbox}
          tono="info"
          ilegible={ilegible}
          valor={tablero ? cifra(tablero.recibidos30) : '—'}
          cambio={cambio === null ? null : { valor: cambio, respecto: 'que los 30 días anteriores' }}
          serie={tablero?.porSemana}
          descripcionDeLaSerie={`Comentarios recibidos cada una de las últimas ${SEMANAS_DEL_GRAFICO} semanas.`}
          nota={
            !tablero
              ? 'no se pudo leer la tabla de comentarios'
              : tablero.recibidos30 === 0
                ? 'ninguno en el último mes'
                : `${plural(tablero.resueltosDeLos30, 'ya resuelto', 'ya resueltos')} · ${plural(
                    tablero.recibidos30 - tablero.resueltosDeLos30,
                    'pendiente',
                    'pendientes',
                  )}`
          }
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Comentarios por semana"
          bajada={`Recibidos en cada una de las últimas ${SEMANAS_DEL_GRAFICO} semanas, de lunes a domingo`}
          ilegible={ilegible}
          className="comentarios-semanas"
        >
          {tablero ? (
            <BarrasVerticales
              titulo={`Comentarios recibidos por semana en las últimas ${SEMANAS_DEL_GRAFICO} semanas`}
              datos={tablero.semanas.map((s, i) => ({ etiqueta: s.etiqueta, detalle: s.detalle, valor: tablero.porSemana[i] }))}
            />
          ) : (
            <NoSePudoLeer que="la tabla de comentarios" />
          )}
        </TarjetaDeGrafico>
        <TarjetaDeGrafico
          titulo="Dónde se comenta"
          bajada={tablero ? `${plural(tablero.total, 'comentario', 'comentarios')} desde el principio` : 'Todos los recibidos'}
          ilegible={ilegible}
        >
          {tablero ? (
            <Dona titulo="Comentarios recibidos según dónde se dejaron" rotuloDelTotal="comentarios" partes={tablero.porDestino} />
          ) : (
            <NoSePudoLeer que="la tabla de comentarios" />
          )}
        </TarjetaDeGrafico>
      </div>
    </>
  )
}
