import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { lecturasDelResidente } from '@/lib/lecturas'
import { cerradoPorMantencion, puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { SinAcceso, ModuloNoDisponible, SinAccesoAlModulo } from '@/components/Estados'
import { EyebrowDeModulo, MigaDePan, claseDeModulo } from '@/components/Cabeceras'
import { BotonImprimir } from '@/components/BotonImprimir'
import { EncabezadoImpreso } from '@/components/EncabezadoImpreso'
import { FirmasDeLaFicha } from '@/components/FirmasDeLaFicha'
import { BotonComentar } from '@/components/BotonComentar'
import { FlaskConical, ThumbsDown, ThumbsUp, Star } from 'lucide-react'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { EjercicioDeClasificacion } from '@/components/imagenes/EjercicioDeClasificacion'
import { ejercicioDeClasificacion } from '@/lib/clasificacionAO'

export const dynamic = 'force-dynamic'

/**
 * Un caso de lectura de imágenes. Si su código dice el tipo AO («23-A2»), el
 * caso se lee como ejercicio (P-007 E4, D-237): lo que se ve a la izquierda y,
 * a la derecha, proponer una clasificación y compararla, con las opciones de
 * manejo cerradas hasta entonces. Sin código, o sin tipo, se lee como siempre.
 */
export default async function Estudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Lectura de imágenes" />

  // Antes del `findByID`, y con el usuario efectivo que va a él: su `.catch`
  // convierte en `notFound()` también el `Forbidden` de la regla de lectura, y
  // quien no tiene el módulo leía «Esta ficha ya no está» sobre un estudio
  // publicado. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'estudios-ia', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'estudios-ia', enMantencion) ? (
      <ModuloNoDisponible titulo="Lectura de imágenes" />
    ) : (
      <SinAccesoAlModulo titulo="Lectura de imágenes" />
    )
  }

  const payload = await getPayload({ config })
  const estudio = await payload
    .findByID({
      collection: 'estudios-ia',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      depth: 1,
    })
    .catch(() => null)
  if (!estudio) notFound()

  const hallazgos = Array.isArray(estudio.hallazgos)
    ? (estudio.hallazgos as Record<string, string>[])
    : []
  const opciones = Array.isArray(estudio.opciones)
    ? (estudio.opciones as Record<string, unknown>[])
    : []

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. Sin esto la
  // casilla aparece en blanco en cada carga y el residente vuelve a marcar lo
  // que ya había marcado.
  //
  // Hasta que se montó, Lectura de imágenes no registraba una sola lectura: ni
  // la visita ni la marca. La cifra «por leer» de la portada es
  // `totalFichas - leidas` sobre los cinco módulos, así que cada estudio
  // contaba como pendiente para siempre y ese número no podía llegar a cero por
  // mucho que se leyera.
  //
  // La pregunta es la misma en los cinco módulos y vive en `src/lib/lecturas.ts`
  // —antes era una copia literal por página—, que explica también por qué no
  // lanza: el estudio se enseña igual con la tabla de actividad caída.
  const lecturas = await lecturasDelResidente(payload, usuarioEfectivo, 'estudios-ia', [id])

  const ejercicio = ejercicioDeClasificacion(estudio.codigo)
  const confianza = typeof estudio.confianza === 'number' ? estudio.confianza : null

  const seccionDeHallazgos =
    hallazgos.length > 0 ? (
      <section className="ficha-seccion">
        <span className="eyebrow pestana-eyebrow">Lo que se ve</span>
        <h2>Hallazgos</h2>
        <ul className="lista-clinica">
          {hallazgos.map((h, i) => (
            <li key={i}>{h.texto}</li>
          ))}
        </ul>
      </section>
    ) : null

  const seccionDeOpciones =
    opciones.length > 0 ? (
      <section className="ficha-seccion">
        <span className="eyebrow pestana-eyebrow">Lo que se puede hacer</span>
        <h2>Opciones de manejo</h2>
        {opciones.map((o, i) => {
          const aFavor = Array.isArray(o.aFavor) ? (o.aFavor as Record<string, string>[]) : []
          const enContra = Array.isArray(o.enContra) ? (o.enContra as Record<string, string>[]) : []
          return (
            <article key={i} className="opcion">
              <h3>
                {o.titulo as string}
                {o.frecuente ? (
                  <span className="insignia insignia-acento">
                    <Star size={13} aria-hidden="true" />
                    Indicación más frecuente
                  </span>
                ) : null}
              </h3>
              <div className="pros-contras">
                <div className="a-favor">
                  <h4>
                    <ThumbsUp size={14} aria-hidden="true" />
                    A favor
                  </h4>
                  <ul>
                    {aFavor.map((a, j) => (
                      <li key={j}>{a.texto}</li>
                    ))}
                  </ul>
                </div>
                <div className="en-contra">
                  <h4>
                    <ThumbsDown size={14} aria-hidden="true" />
                    En contra
                  </h4>
                  <ul>
                    {enContra.map((a, j) => (
                      <li key={j}>{a.texto}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    ) : null

  return (
    <main className={claseDeModulo('estudios-ia')}>
      <EncabezadoImpreso
        coleccion="estudios-ia"
        documentoId={id}
        tipo="Lectura de imágenes"
        titulo={estudio.nombre as string}
      />
      <MigaDePan
        pasos={[
          { href: '/', texto: 'Inicio' },
          { href: '/imagenes', texto: 'Lectura de imágenes' },
          { texto: estudio.nombre as string },
        ]}
      />

      {/* La advertencia va arriba y no al pie: quien lee un resultado debe
          saber antes que no hay ningún modelo detrás. En ámbar y con el icono
          del matraz, no en el rojo de un error: no ha fallado nada, es la
          naturaleza del caso. */}
      <aside className="advertencia demostracion">
        <span className="advertencia-etiqueta">
          <FlaskConical size={15} aria-hidden="true" />
          Demostración
        </span>
        <p>
          No existe un modelo de inferencia: estos resultados están escritos a mano. No apto para
          uso clínico ni para decisiones sobre pacientes.
        </p>
      </aside>

      <header className="cabecera-ficha">
        <EyebrowDeModulo slug="estudios-ia">Lectura de imágenes</EyebrowDeModulo>
        <h1>{estudio.nombre as string}</h1>
        {/* Con ejercicio, el código y la confianza esperan a que se compare:
            en la cabecera serían la respuesta escrita encima de la pregunta. */}
        {ejercicio ? null : (
          <div className="etiquetas">
            {estudio.codigo ? <span className="codigo">{estudio.codigo as string}</span> : null}
            {confianza !== null ? <span className="etiqueta">Confianza declarada: {confianza}%</span> : null}
          </div>
        )}
        {/*
          En la cabecera y no al pie, como en la biblioteca: al final de la
          página está el aviso de que la decisión es del cirujano tratante, y no
          conviene poner un control de progreso justo debajo de esa frase.
        */}
        <FirmasDeLaFicha coleccion="estudios-ia" documentoId={id} />
        <div className="barra-acciones">
          <RastreadorActividad
            coleccion="estudios-ia"
            documentoId={id}
            completadoInicial={lecturas.leida(id)}
          />
          <BotonImprimir />
          <BotonComentar coleccion="estudios-ia" documentoId={id} />
        </div>
      </header>

      {ejercicio ? (
        <div className="lectura-con-ejercicio">
          <div className="lectura-material">
            <Bloques bloques={estudio.contenido} />
            {seccionDeHallazgos}
          </div>
          <EjercicioDeClasificacion ejercicio={ejercicio} codigo={String(estudio.codigo)} confianza={confianza}>
            {seccionDeOpciones}
          </EjercicioDeClasificacion>
        </div>
      ) : (
        <>
          {seccionDeHallazgos}
          {seccionDeOpciones}
          <Bloques bloques={estudio.contenido} />
        </>
      )}

      <p className="nota-al-pie">
        Las opciones se muestran como apoyo docente. La decisión es del cirujano tratante y depende
        del paciente, del entorno y del material disponible.
      </p>

      <FormularioComentario
        coleccion="estudios-ia"
        documentoId={id}
        label="¿Sugerencia o corrección sobre este caso de imágenes? Comentar"
      />
    </main>
  )
}
