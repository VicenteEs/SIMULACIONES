import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { Visor3D } from '@/components/VisoresPerezosos'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

export default async function CasoAO({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Técnica AO" />

  const payload = await getPayload({ config })
  const caso = await payload
    .findByID({
      collection: 'casos-ao',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      depth: 2,
    })
    .catch(() => null)
  if (!caso) notFound()

  const pasos = Array.isArray(caso.pasos) ? (caso.pasos as Record<string, unknown>[]) : []

  const usuarioId = (usuarioEfectivo as { id?: string | number } | null)?.id

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. Sin esto la
  // casilla aparece en blanco en cada carga y el residente vuelve a marcar lo
  // que ya había marcado.
  //
  // Hasta aquí, Técnica AO no registraba una sola lectura: ni la visita ni la
  // marca. La cifra «por leer» de la portada es `totalFichas - leidas` sobre los
  // cinco módulos, así que cada caso AO contaba como pendiente para siempre y
  // ese número no podía llegar a cero por mucho que se leyera.
  //
  // Es la tercera copia literal de esta consulta —las otras están en
  // `biblioteca/[id]` y en `simulador/[id]`, y con `imagenes/[id]` van cuatro—.
  // Su sitio es una función de `src/lib`, que no entra en este lote y queda
  // anotado como pendiente; lo que no podía seguir es que tres módulos de cinco
  // no tuvieran forma de marcarse.
  //
  // Quedan cuatro de los cinco. El examen físico sigue fuera y no por olvido:
  // no tiene página por documento —`admin-panel/modulos.ts` lo deja escrito y
  // por eso `rutaPublica` compone `/examen-fisico#maniobra-<id>`—, las
  // maniobras se pintan todas juntas en el listado. Mientras siga así, sus
  // fichas cuentan en `totalFichas` (`page.tsx`, `MODULOS`) y nunca en
  // `leidas`, de modo que «por leer» tiene un suelo igual al número de
  // maniobras publicadas y no llega a cero. Cerrarlo pide una de dos cosas, y
  // ninguna es de este lote: una ficha por maniobra, o un rastreador por
  // `<article id="maniobra-…">` en el listado.
  //
  // El `.catch` está porque la actividad es una comodidad y el caso es el
  // contenido: una avería en esa tabla no puede llevarse por delante la página
  // entera, que es lo que pasaría sin él.
  const registroDeLectura = usuarioId
    ? await payload
        .find({
          collection: 'actividad',
          where: {
            and: [
              { usuario: { equals: usuarioId } },
              { coleccion: { equals: 'casos-ao' } },
              { documentoId: { equals: id } },
            ],
          },
          user: usuarioEfectivo as never,
          limit: 1,
          depth: 0,
        })
        .then((r) => r.docs[0] ?? null)
        .catch(() => null)
    : null

  return (
    <main>
      <Miga href="/tecnica-ao" texto="Técnica AO" />
      <header className="cabecera-ficha">
        <h1>{caso.titulo as string}</h1>
        <Rico valor={caso.procedimiento} className="entrada" />
        {caso.codigo ? (
          <div className="etiquetas">
            <span className="codigo">{caso.codigo as string}</span>
          </div>
        ) : null}
        {/*
          En la cabecera y no al pie, como en la biblioteca: la lista de pasos
          puede ser larga y quien termina de leerla se queda en el último paso,
          no baja hasta el final de la página buscando una casilla.
        */}
        <RastreadorActividad
          coleccion="casos-ao"
          documentoId={id}
          completadoInicial={registroDeLectura?.completado === true}
        />
      </header>

      {pasos.length === 0 ? (
        <Vacio texto="Este caso todavía no tiene pasos escritos." />
      ) : (
        <ol className="pasos-ao">
          {pasos.map((p, i) => {
            const modelo = p.modelo as { url?: string; nombre?: string } | undefined
            return (
              <li key={i}>
                <span className="paso-numero">Paso {i + 1}</span>
                <h2>{p.titulo as string}</h2>
                <Rico valor={p.descripcion} />
                {p.principio ? (
                  <aside className="advertencia perla">
                    <span className="advertencia-etiqueta">Principio AO</span>
                    <p>{p.principio as string}</p>
                  </aside>
                ) : null}
                <Rico valor={p.nota} className="nota-tecnica" />
                {modelo?.url ? <Visor3D url={modelo.url} nombre={modelo.nombre} /> : null}
              </li>
            )
          })}
        </ol>
      )}

      <Bloques bloques={caso.contenido} />

      <FormularioComentario 
        coleccion="casos-ao" 
        documentoId={id} 
        label="¿Sugerencia o corrección sobre esta técnica AO? Comentar" 
      />
    </main>
  )
}
