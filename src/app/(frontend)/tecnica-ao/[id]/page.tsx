import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga, Vacio } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { Visor3D } from '@/components/VisoresPerezosos'
import { encuadreVigente, type Encuadre } from '@/lib/encuadre'
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
  // Ya son los cinco. El examen físico era la excepción mientras no tuvo
  // página por documento —sus maniobras se pintan todas juntas en el listado,
  // y por eso `rutaPublica` compone `/examen-fisico#maniobra-<id>`—, y eso
  // dejaba «por leer» con un suelo igual al número de maniobras publicadas.
  // Se cerró por la segunda de las dos salidas posibles: un rastreador por
  // `<article id="maniobra-…">` dentro del listado, en vez de inventar una
  // ficha por maniobra que nadie había pedido.
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
            // El `encuadre` del modelo llega poblado porque el caso se lee con
            // `depth: 2`: el paso es una fila del arreglo `pasos` y su
            // relación `modelo` se puebla en el segundo salto, que es el mismo
            // que trae la `url`. Con `depth: 1` no habría ni dirección que
            // abrir y el visor no se montaría.
            const modelo = p.modelo as
              | { url?: string; nombre?: string; encuadre?: Encuadre | null }
              | undefined

            // El paso no tiene encuadre propio que ofrecer: el arreglo `pasos`
            // de `src/collections/CasosAO.ts` declara la relación `modelo` y
            // nada más, así que el primer argumento va vacío siempre. Se llama
            // igual a la regla, en vez de pasar `modelo?.encuadre` a pelo,
            // porque lo que hace falta aquí es su tercera rama: un grupo
            // entero a nulos —como los guarda el panel cuando nadie capturó
            // nada— tiene que salir como `undefined` para que el visor vuelva
            // a abarcar la pieza él solo. Pasándolo a pelo, el objeto de nulos
            // es verdadero, `Visor3D` se salta su `Bounds` y planta la cámara
            // a la distancia por omisión sobre un modelo que puede venir en
            // milímetros: un punto en el centro de la pantalla.
            //
            // Si algún día el paso gana su propio encuadre, se pasa aquí y ya
            // manda: la precedencia está escrita una sola vez, en
            // `encuadreVigente` (`src/lib/encuadre.ts`).
            const encuadre = encuadreVigente(undefined, modelo?.encuadre)
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
                {modelo?.url ? (
                  <Visor3D url={modelo.url} encuadre={encuadre} nombre={modelo.nombre} />
                ) : null}
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
