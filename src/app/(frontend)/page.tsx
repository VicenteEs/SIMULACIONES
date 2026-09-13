import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { Femur } from '@/components/Femur'
import { MallaDeNodos } from '@/components/MallaDeNodos'
import { ruta } from '@/lib/rutas'
// `modulos.ts` no importa Payload a propósito (lo explica su cabecera), así que
// la portada puede tomar el mapa de nombres sin arrastrar el servidor.
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'

export const dynamic = 'force-dynamic'

const MODULOS = [
  {
    numero: '01',
    ruta: '/biblioteca',
    coleccion: 'patologias' as const,
    titulo: 'Biblioteca de patologías',
    descripcion:
      'Fichas por segmento con clasificaciones, criterios de decisión y una pestaña completa de rehabilitación.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '02',
    ruta: '/examen-fisico',
    coleccion: 'maniobras' as const,
    titulo: 'Examen físico',
    descripcion: 'Maniobras por segmento con técnica, interpretación y video propio.',
    publico: ['Residentes', 'Kinesiología'],
  },
  {
    numero: '03',
    ruta: '/tecnica-ao',
    coleccion: 'casos-ao' as const,
    titulo: 'Técnica AO',
    descripcion: 'El paso a paso quirúrgico con el principio AO que sustenta cada gesto.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '04',
    ruta: '/simulador',
    coleccion: 'cirugias' as const,
    // «Simulador quirúrgico» y no «Simula tu cirugía»: era el único de los cinco
    // cuyo título aquí no coincidía con el de la tabla única
    // (`admin-panel/modulos.ts`), y por tanto el único módulo con dos nombres
    // repartidos por la plataforma —esta tarjeta decía uno; el <h1> de
    // `/simulador`, la barra y la insignia de «Continúa leyendo» decían el
    // otro—. Si se vuelve a cambiar aquí, hay que cambiarlo allí: quien pulsa un
    // nombre espera aterrizar en una página que se llame igual.
    titulo: 'Simulador quirúrgico',
    descripcion: 'Instrumental, fuerza aplicada en newtons y registro de complicaciones.',
    publico: ['Residentes', 'Traumatología'],
  },
  {
    numero: '05',
    ruta: '/imagenes',
    coleccion: 'estudios-ia' as const,
    titulo: 'Lectura de imágenes',
    descripcion: 'Clasificación propuesta y opciones de manejo asociadas al trazo.',
    publico: ['Traumatología'],
  },
]

/** Saludo según la hora del servidor. Cuesta nada y la portada deja de ser fría. */
function saludo(): string {
  const hora = new Date().getHours()
  if (hora < 6) return 'Buenas noches'
  if (hora < 13) return 'Buenos días'
  if (hora < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

export default async function Inicio() {
  const { usuario, usuarioEfectivo, activo, rolReal } = await obtenerSesion()

  // ----------------------------------------------------------- sin sesión
  if (!usuario) {
    return (
      <main className="portada-publica">
        <div className="portada-fondo" aria-hidden="true">
          <MallaDeNodos className="portada-malla" />
        </div>

        <section className="portada-hero">
          <img src={ruta('/logo.png')} alt="TraumaHub" className="portada-logo" />

          <h1 className="portada-titular">
            Estudiar, examinar y <em>operar mejor</em>.
          </h1>

          <p className="portada-bajada">
            Cinco módulos que recorren la cadena completa de una decisión clínica: del estudio de la
            patología a la ejecución en pabellón.
          </p>

          <Link className="portada-boton" href="/entrar">
            Entrar a la plataforma
          </Link>

          <p className="portada-nota">
            El acceso es cerrado. Si necesita una cuenta, solicítela al equipo docente.
          </p>
        </section>

        <section className="portada-tira" aria-label="Los cinco módulos">
          {MODULOS.map((m) => (
            <div key={m.ruta} className="portada-tira-item">
              <span className="portada-tira-numero">{m.numero}</span>
              <span className="portada-tira-nombre">{m.titulo}</span>
            </div>
          ))}
        </section>
      </main>
    )
  }

  // -------------------------------------------------- cuenta sin activar
  if (!activo) {
    return (
      <main className="portada">
        <div className="tarjeta">
          <h1>Cuenta pendiente de activación</h1>
          <p>
            Su cuenta existe pero un administrador todavía no la ha habilitado. En cuanto lo haga,
            verá el contenido sin necesidad de volver a registrarse.
          </p>
        </div>
      </main>
    )
  }

  // ----------------------------------------------------------- con sesión
  const payload = await getPayload({ config })

  // La rejilla se recorta con el mismo `puedeVerModulo` que recorta la barra
  // superior (`Navegacion.tsx`), y por el mismo motivo: `lecturaDeModulo`
  // devuelve `false` para un módulo que la cuenta no tiene, y ante un `false`
  // Payload no contesta con una lista vacía sino que lanza `Forbidden`.
  //
  // Sin este filtro el módulo vetado costaba dos mentiras seguidas. El
  // `.catch(() => 0)` de abajo convertía ese `Forbidden` en un cero, así que la
  // tarjeta rotulaba «Sin contenido» sobre un módulo que puede estar lleno
  // —y el conteo es la única señal que da la portada sobre dónde hay material,
  // de modo que la daba justo al revés—; y la tarjeta seguía siendo un enlace
  // que al pulsarlo acababa en la pantalla genérica de Next, en inglés y sin
  // barra para volver, porque los listados consultan sin `catch`
  // (`simulador/page.tsx`). Recortada la lista, el `.catch` vuelve a cubrir
  // solo lo que decía cubrir: la tabla que todavía no existe.
  //
  // Se filtra una vez y la misma lista sirve para los conteos y para la
  // rejilla, que es lo que mantiene a `conteos[i]` casando con su tarjeta.
  const modulosVisibles = MODULOS.filter((m) =>
    puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, m.coleccion),
  )

  // Se cuenta con el control de acceso puesto y con el usuario efectivo, que es
  // exactamente como consulta el listado al que lleva cada tarjeta
  // (`biblioteca/page.tsx`, `simulador/page.tsx`, …). Con `overrideAccess: true`
  // el conteo incluía los borradores —la tabla principal de una colección
  // versionada los guarda, como demuestra `admin-panel/datos.ts` separando
  // `published` de `draft`— y se saltaba los módulos permitidos a la cuenta: la
  // portada prometía «6 entradas» y el módulo contestaba «todavía no hay fichas
  // escritas», dos pantallas contradiciéndose en dos clics. La cifra «por leer»
  // arrastraba el mismo error y no bajaba nunca a cero.
  //
  // No se fuerza `where: SOLO_PUBLICADO`: para un editor la regla de acceso
  // devuelve `true` y el conteo incluye sus borradores, que es justo lo que su
  // listado le enseña con la etiqueta «Borrador». Filtrarlos aquí volvería a
  // separar la portada del módulo, solo que al revés.
  //
  // El `.catch(() => 0)` cubre la colección cuya tabla todavía no existe: en una
  // base recién levantada `count` falla y la portada entera se caía con ella.
  const conteos = await Promise.all(
    modulosVisibles.map((m) =>
      payload
        .count({ collection: m.coleccion, overrideAccess: false, user: usuarioEfectivo as never })
        .then((r) => r.totalDocs)
        .catch(() => 0),
    ),
  )

  const [actividad, leidas] = await Promise.all([
    payload
      .find({
        collection: 'actividad',
        where: {
          and: [{ usuario: { equals: usuario?.id } }, { completado: { equals: false } }],
        },
        sort: '-ultimaVisita',
        limit: 3,
        user: usuario as never,
      })
      .catch(() => ({ docs: [] as unknown[] })),
    payload
      .count({
        collection: 'actividad',
        where: {
          and: [{ usuario: { equals: usuario?.id } }, { completado: { equals: true } }],
        },
        overrideAccess: true,
      })
      .then((r) => r.totalDocs)
      .catch(() => 0),
  ])

  // Se resuelve el título de cada ficha a medias para poder ofrecer el enlace
  // con su nombre y no con un número, que no le dice nada a nadie.
  const continuarLeyendo: { id: string; nombre: string; coleccion: string; ruta: string }[] = []
  for (const registro of actividad.docs as Record<string, unknown>[]) {
    try {
      const doc = (await payload.findByID({
        collection: registro.coleccion as never,
        id: registro.documentoId as string,
        // Sin `overrideAccess: false` aquí no se comprobaba nada: en la API
        // local vale `true` por omisión, así que pasar `user` a secas no
        // activaba `lecturaDeModulo` ni el filtro de publicación, y el `catch`
        // de abajo prometía omitir lo no publicado mientras imprimía su título.
        //
        // Importa más de lo que parece porque la fila que se resuelve la elige
        // quien la crea: `POST /api/actividad` solo exige sesión activa y
        // acepta cualquier `coleccion` y `documentoId`. Era un listador de
        // títulos de borradores —y de módulos vetados— a base de probar
        // identificadores 1, 2, 3…, justo lo que D-020 se toma el trabajo de
        // ocultar.
        overrideAccess: false,
        user: usuarioEfectivo as never,
      })) as Record<string, unknown>
      const nombre = (doc?.nombre ?? doc?.titulo) as string | undefined
      if (nombre) {
        continuarLeyendo.push({
          id: String(registro.documentoId),
          nombre,
          coleccion: String(registro.coleccion),
          ruta: MODULOS.find((m) => m.coleccion === registro.coleccion)?.ruta ?? '/biblioteca',
        })
      }
    } catch {
      // La ficha pudo borrarse, o dejar de estar publicada: se omite.
    }
  }

  const totalFichas = conteos.reduce((a, b) => a + b, 0)
  const nombre = String(usuario?.nombre ?? '').split(' ')[0]
  const puedeEditar = rolReal === 'admin' || rolReal === 'editor'

  return (
    <main className="portada">
      <section className="entrada-hero">
        <div>
          <span className="eyebrow">{saludo()}{nombre ? `, ${nombre}` : ''}</span>
          <h1>Estudiar, examinar y operar mejor.</h1>
          <p className="lead">
            Cinco módulos que recorren la cadena completa de una decisión clínica: del estudio de la
            patología a la ejecución en pabellón.
          </p>

          <div className="portada-cifras">
            <div className="portada-cifra">
              <strong>{totalFichas}</strong>
              <span>ficha{totalFichas === 1 ? '' : 's'} disponible{totalFichas === 1 ? '' : 's'}</span>
            </div>
            <div className="portada-cifra">
              <strong>{leidas}</strong>
              <span>marcada{leidas === 1 ? '' : 's'} como leída{leidas === 1 ? '' : 's'}</span>
            </div>
            <div className="portada-cifra">
              <strong>{Math.max(0, totalFichas - leidas)}</strong>
              <span>por leer</span>
            </div>
          </div>

          <div className="row-botones">
            <Link className="boton" href="/biblioteca">
              Ir a la biblioteca
            </Link>
            {puedeEditar ? (
              <Link className="boton secundario" href="/admin-panel/contenido">
                Escribir contenido
              </Link>
            ) : (
              <Link className="boton secundario" href="/tecnica-ao">
                Ver técnica AO
              </Link>
            )}
          </div>
        </div>

        <div className="hero-figura">
          <Femur />
          <div className="hero-pie">
            <span>Fémur · reconstrucción esquemática</span>
            <span className="hero-codigo">AO/OTA 32-A1</span>
          </div>
        </div>
      </section>

      {continuarLeyendo.length > 0 ? (
        <section className="continuar-leyendo">
          <span className="eyebrow">Donde lo dejó</span>
          <h2 className="titulo-seccion">Continúa leyendo</h2>
          <div className="rejilla-fichas">
            {continuarLeyendo.map((item) => (
              <Link key={`${item.coleccion}-${item.id}`} href={`${item.ruta}/${item.id}`} className="tarjeta-ficha">
                <div className="etiquetas">
                  {/* El slug crudo solo como último recurso: `replace('-', ' ')`
                      sacaba a la portada el nombre de la tabla de PostgreSQL
                      —«patologias» sin tilde, «casos ao», «estudios ia»—, que
                      ni siquiera son palabras. */}
                  <span className="codigo">{NOMBRE_DE_MODULO[item.coleccion] ?? item.coleccion}</span>
                </div>
                <h3>{item.nombre}</h3>
                <span className="tarjeta-ficha-accion">Retomar lectura →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {modulosVisibles.length > 0 ? (
        <>
          {/* Los rótulos cuentan lo que hay debajo y no lo que tiene la
              plataforma: a una cuenta restringida a dos módulos, «Los cinco
              módulos» le encabezaba una rejilla de dos tarjetas, y de paso le
              decía cuántos se le están ocultando. */}
          <span className="eyebrow">
            {modulosVisibles.length === MODULOS.length ? 'Los cinco módulos' : 'Sus módulos'}
          </span>
          <h2 className="titulo-seccion">
            {modulosVisibles.length === MODULOS.length
              ? 'Qué incluye la plataforma'
              : 'Qué tiene disponible'}
          </h2>
          <div className="rejilla-modulos">
            {modulosVisibles.map((m, i) => (
              <Link key={m.ruta} href={m.ruta} className="tarjeta-modulo">
                <span className="modulo-numero">{m.numero}</span>
                <h3>{m.titulo}</h3>
                <p>{m.descripcion}</p>
                <div className="modulo-pie">
                  <div className="etiquetas">
                    {m.publico.map((p) => (
                      <span key={p} className="etiqueta">
                        {p}
                      </span>
                    ))}
                  </div>
                  <span className={`conteo ${conteos[i] === 0 ? 'vacio' : ''}`}>
                    {conteos[i] === 0
                      ? 'Sin contenido'
                      : `${conteos[i]} ${conteos[i] === 1 ? 'entrada' : 'entradas'}`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        // Cuenta cuyo `modulosVisibles` —el campo del usuario, no la lista de
        // arriba— está puesto y no contiene ninguno de los cinco. La barra
        // superior sale igual de vacía (`Navegacion.tsx` recorta con la misma
        // regla), así que sin esta línea la portada se lee como una avería del
        // servidor y no como un permiso que nadie le ha dado todavía.
        <p className="aviso">
          Su cuenta todavía no tiene módulos asignados. Solicítelos al equipo docente.
        </p>
      )}
    </main>
  )
}
