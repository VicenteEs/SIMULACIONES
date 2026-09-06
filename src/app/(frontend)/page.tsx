import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { Femur } from '@/components/Femur'
import { MallaDeNodos } from '@/components/MallaDeNodos'

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
    titulo: 'Simula tu cirugía',
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
  const { usuario, activo, rolReal } = await obtenerSesion()

  // ----------------------------------------------------------- sin sesión
  if (!usuario) {
    return (
      <main className="portada-publica">
        <div className="portada-fondo" aria-hidden="true">
          <MallaDeNodos className="portada-malla" />
        </div>

        <section className="portada-hero">
          <img src="/logo.png" alt="TraumaHub" className="portada-logo" />

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

  const conteos = await Promise.all(
    MODULOS.map((m) =>
      payload
        .count({ collection: m.coleccion, overrideAccess: true })
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
        user: usuario as never,
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
                  <span className="codigo">{item.coleccion.replace('-', ' ')}</span>
                </div>
                <h3>{item.nombre}</h3>
                <span className="tarjeta-ficha-accion">Retomar lectura →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <span className="eyebrow">Los cinco módulos</span>
      <h2 className="titulo-seccion">Qué incluye la plataforma</h2>
      <div className="rejilla-modulos">
        {MODULOS.map((m, i) => (
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
    </main>
  )
}
