import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { Femur } from '@/components/Femur'

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

export default async function Inicio() {
  const { usuario, activo } = await obtenerSesion()

  if (!usuario) {
    return (
      <main className="portada">
        <section className="entrada-hero">
          <div>
            <span className="eyebrow">Plataforma docente</span>
            <h1>Una sola plataforma para estudiar, examinar y operar mejor.</h1>
            <p className="lead">
              Cinco módulos que conectan el estudio de la patología, la exploración física, la
              técnica quirúrgica y la lectura de imágenes.
            </p>
            <a className="boton grande" href="/admin">
              Iniciar sesión
            </a>
            <p className="pie-acceso">
              El acceso es cerrado. Si necesita una cuenta, solicítela al equipo docente.
            </p>
          </div>
          <div className="hero-figura">
            <Femur />
            <div className="hero-pie">
              <span>Fémur · reconstrucción esquemática</span>
              <span className="hero-codigo">AO/OTA 32-A1</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

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

  // Se cuenta lo que hay en cada módulo para que la portada diga la verdad
  // sobre el estado del contenido en lugar de prometer cinco módulos llenos.
  const payload = await getPayload({ config })
  const conteos = await Promise.all(
    MODULOS.map((m) =>
      payload
        .count({ collection: m.coleccion, overrideAccess: true })
        .then((r) => r.totalDocs)
        .catch(() => 0),
    ),
  )

  return (
    <main className="portada">
      <section className="entrada-hero">
        <div>
          <span className="eyebrow">Plataforma docente</span>
          <h1>Estudiar, examinar y operar mejor.</h1>
          <p className="lead">
            Cinco módulos que recorren la cadena completa de una decisión clínica: del estudio de la
            patología a la ejecución en pabellón.
          </p>
          <div className="row-botones">
            <Link className="boton" href="/biblioteca">
              Ir a la biblioteca
            </Link>
            <Link className="boton secundario" href="/tecnica-ao">
              Ver técnica AO
            </Link>
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
