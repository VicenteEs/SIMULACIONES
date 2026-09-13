import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { lecturasDelResidente } from '@/lib/lecturas'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAcceso, SinAccesoAlModulo, Miga } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { FormularioComentario } from '@/components/FormularioComentario'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

export default async function Estudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Lectura de imágenes" />

  // Antes del `findByID`, y con el usuario efectivo que va a él: su `.catch`
  // convierte en `notFound()` también el `Forbidden` de la regla de lectura, y
  // quien no tiene el módulo leía «Esta ficha ya no está» sobre un estudio
  // publicado. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'estudios-ia')) {
    return <SinAccesoAlModulo titulo="Lectura de imágenes" />
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

  return (
    <main>
      <Miga href="/imagenes" texto="Lectura de imágenes" />

      {/* La advertencia va arriba y no al pie: quien lee un resultado debe
          saber antes que no hay ningún modelo detrás. */}
      <aside className="advertencia error-frecuente">
        <span className="advertencia-etiqueta">Demostración</span>
        <p>
          No existe un modelo de inferencia: estos resultados están escritos a mano. No apto para
          uso clínico ni para decisiones sobre pacientes.
        </p>
      </aside>

      <header className="cabecera-ficha">
        <h1>{estudio.nombre as string}</h1>
        <div className="etiquetas">
          {estudio.codigo ? <span className="codigo">{estudio.codigo as string}</span> : null}
          {typeof estudio.confianza === 'number' ? (
            <span className="etiqueta">Confianza declarada: {estudio.confianza}%</span>
          ) : null}
        </div>
        {/*
          En la cabecera y no al pie, como en la biblioteca: al final de la
          página está el aviso de que la decisión es del cirujano tratante, y no
          conviene poner un control de progreso justo debajo de esa frase.
        */}
        <RastreadorActividad
          coleccion="estudios-ia"
          documentoId={id}
          completadoInicial={lecturas.leida(id)}
        />
      </header>

      {hallazgos.length > 0 ? (
        <section className="pestana">
          <h2>Hallazgos</h2>
          <ul className="lista-clinica">
            {hallazgos.map((h, i) => (
              <li key={i}>{h.texto}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {opciones.length > 0 ? (
        <section className="pestana">
          <h2>Opciones de manejo</h2>
          {opciones.map((o, i) => {
            const aFavor = Array.isArray(o.aFavor) ? (o.aFavor as Record<string, string>[]) : []
            const enContra = Array.isArray(o.enContra) ? (o.enContra as Record<string, string>[]) : []
            return (
              <article key={i} className="opcion">
                <h3>
                  {o.titulo as string}
                  {o.frecuente ? <span className="etiqueta"> Indicación más frecuente</span> : null}
                </h3>
                <div className="pros-contras">
                  <div>
                    <h4>A favor</h4>
                    <ul>
                      {aFavor.map((a, j) => (
                        <li key={j}>{a.texto}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>En contra</h4>
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
      ) : null}

      <Bloques bloques={estudio.contenido} />

      <p className="aviso">
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
