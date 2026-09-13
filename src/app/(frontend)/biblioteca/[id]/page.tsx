import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { pestanasConContenido } from '@/lib/fichas'
import { lecturasDelResidente } from '@/lib/lecturas'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAcceso, SinAccesoAlModulo } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { IndiceFicha } from '@/components/IndiceFicha'

import { FormularioComentario } from '@/components/FormularioComentario'

import { BotonImprimir } from '@/components/BotonImprimir'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

/**
 * Ficha de patología.
 */
export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Biblioteca de patologías" />

  // Antes del `findByID`, y con el usuario efectivo que va a él. El `.catch` de
  // abajo existe para que una ficha retirada acabe en `notFound()`, pero se
  // traga también el `Forbidden` de la regla de lectura: a quien no tiene el
  // módulo y abría el enlace que le pasó un compañero le salía «Esta ficha ya
  // no está» sobre una patología publicada. Con el usuario real, un
  // administrador en vista previa pasaría la guardia y volvería a caer en lo
  // mismo. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'patologias')) {
    return <SinAccesoAlModulo titulo="Biblioteca de patologías" />
  }

  const payload = await getPayload({ config })
  const user = usuarioEfectivo as never

  const ficha = await payload
    .findByID({ collection: 'patologias', id, overrideAccess: false, user, depth: 2 })
    .catch(() => null)

  if (!ficha) notFound()

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. La pregunta
  // es la misma en los cinco módulos y vive en `src/lib/lecturas.ts`, que
  // explica por qué no lanza aunque la tabla esté caída: la patología se
  // enseña igual, con la casilla en blanco.
  const lecturas = await lecturasDelResidente(payload, usuarioEfectivo, 'patologias', [id])
  const completadoInicial = lecturas.leida(id)

  const pestanas = pestanasConContenido(ficha as never)
  const segmento = ficha.segmento as { nombre?: string } | undefined

  return (
    <main>
      <nav className="miga" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <Link href="/biblioteca">Biblioteca</Link>
          {segmento?.nombre ? <span> · {segmento.nombre}</span> : null}
        </div>
        <BotonImprimir />
      </nav>

      <header className="cabecera-ficha">
        <h1>{ficha.nombre as string}</h1>
        {ficha.subtitulo ? <p className="entrada">{ficha.subtitulo as string}</p> : null}
        <div className="etiquetas">
          {ficha.codigo ? <span className="codigo">{ficha.codigo as string}</span> : null}
          {segmento?.nombre ? <span className="etiqueta">{segmento.nombre}</span> : null}
        </div>
        <RastreadorActividad
          coleccion="patologias"
          documentoId={id}
          completadoInicial={completadoInicial}
        />
      </header>

      <div className="ficha-cuerpo">
        <IndiceFicha pestanas={pestanas} />
        <div className="ficha-contenido">
      {pestanas.length === 0 ? (
        <div className="tarjeta">
          <p>Esta ficha aún no tiene contenido publicado.</p>
        </div>
      ) : (
        pestanas.map((p) => (
          <section key={p.campo} className="pestana" id={p.campo}>
            <h2>{p.etiqueta}</h2>
            <Bloques bloques={ficha[p.campo as keyof typeof ficha]} />
            {p.campo === 'rehabilitacion' && Array.isArray(ficha.fases) ? (
              <ol className="fases">
                {(ficha.fases as Record<string, string>[]).map((f, i) => (
                  <li key={i}>
                    <span className="fase-cuando">{f.cuando}</span>
                    {/* h3 y no h4: el encabezado de este apartado es el <h2> de
                        arriba y las fases cuelgan directamente de él, no de los
                        bloques. Con «Rehabilitación» compuesta solo de fases
                        —caso que `pestanasConContenido` admite a propósito,
                        `src/lib/fichas.ts`— <Bloques> no pinta ningún <h3> y la
                        secuencia real era h1 → h2 → h4: quien recorre la ficha
                        saltando por encabezados oía un nivel intermedio que no
                        existe y las fases aparecían colgando de nada.
                        El tamaño visual no sigue al nivel: en `estilos.css`
                        vive `.fases h3 { font-size: 15px; margin: 5px 0 6px }`,
                        con sus dos declaraciones y no solo el `font-size`. El
                        margen hay que repetirlo porque la regla general
                        `h1, h2, h3, h4` deja los cuatro en `margin: 0`, y sin
                        él el título se pega por arriba al `.fase-cuando` y por
                        abajo al párrafo, dentro de una lista cuyo ritmo
                        vertical lo daba justo ese margen. Si esto vuelve a
                        `<h4>`, aquel selector vuelve con él o la fase pierde
                        tamaño y separación de golpe. */}
                    <h3>{f.titulo}</h3>
                    <p>{f.contenido}</p>
                    {f.criterio ? (
                      <p className="fase-criterio">
                        <strong>Para progresar:</strong> {f.criterio}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ))
      )}
        </div>
      </div>
      
      <FormularioComentario coleccion="patologias" documentoId={id} />
    </main>
  )
}
