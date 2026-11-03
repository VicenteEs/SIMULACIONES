import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { cerradoPorMantencion, puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { SinAcceso, ModuloNoDisponible, SinAccesoAlModulo, Vacio } from '@/components/Estados'
import { EyebrowDeModulo, MigaDePan, claseDeModulo } from '@/components/Cabeceras'
import { BotonImprimir } from '@/components/BotonImprimir'
import { EncabezadoImpreso } from '@/components/EncabezadoImpreso'
import { FirmasDeLaFicha } from '@/components/FirmasDeLaFicha'
import { BotonComentar } from '@/components/BotonComentar'
import { Layers, Lightbulb, ShieldCheck } from 'lucide-react'
import { Bloques } from '@/components/Bloques'
import { Visor3D } from '@/components/VisoresPerezosos'
import { encuadreVigente, type Encuadre } from '@/lib/encuadre'
import { lecturasDelResidente } from '@/lib/lecturas'
import { FormularioComentario } from '@/components/FormularioComentario'
import { Rico, tieneContenido } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'
import { PasoAPaso, type PasoDelCaso } from '@/components/tecnica/PasoAPaso'
import { FiguraDelSegmento, tieneFigura } from '@/components/FiguraDelSegmento'
import { segmentoDeLaPlataforma } from '@/lib/clasificacionAO'
import { delMismoSegmento } from '@/lib/delMismoSegmento'

export const dynamic = 'force-dynamic'

/**
 * Un caso de técnica AO, paso a paso (P-007 E4, D-237): la cabecera con su
 * marca de leída, y debajo `PasoAPaso`, que enseña un paso cada vez. Esta
 * página pinta el contenido de todos los pasos; cuál se ve lo decide el
 * componente.
 */
export default async function CasoAO({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Técnica AO" />

  // Antes del `findByID`, y con el usuario efectivo que va a él: su `.catch`
  // convierte en `notFound()` también el `Forbidden` de la regla de lectura, y
  // quien no tiene el módulo leía «Esta ficha ya no está» sobre un caso
  // publicado. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'casos-ao', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'casos-ao', enMantencion) ? (
      <ModuloNoDisponible titulo="Técnica AO" />
    ) : (
      <SinAccesoAlModulo titulo="Técnica AO" />
    )
  }

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

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. Sin esto la
  // casilla aparece en blanco en cada carga y el residente vuelve a marcar lo
  // que ya había marcado.
  //
  // Hasta que se montó, Técnica AO no registraba una sola lectura: ni la visita
  // ni la marca. La cifra «por leer» de la portada es `totalFichas - leidas`
  // sobre los cinco módulos, así que cada caso AO contaba como pendiente para
  // siempre y ese número no podía llegar a cero por mucho que se leyera.
  //
  // La pregunta es la misma en los cinco módulos y vive en `src/lib/lecturas.ts`
  // —antes era una copia literal por página—, que explica también por qué no
  // lanza: el caso se enseña igual con la tabla de actividad caída.
  const lecturas = await lecturasDelResidente(payload, usuarioEfectivo, 'casos-ao', [id])

  // «Ver en el simulador»: el caso del mismo código AO, o del mismo segmento si
  // no hay uno idéntico. La búsqueda es la misma que la de «Continúe con» de la
  // ficha de patología, y no falla: sin caso, el botón no sale.
  const { casos: simulaciones } = await delMismoSegmento(payload, usuarioEfectivo, enMantencion, caso.codigo, {
    modulos: ['cirugias'],
    tope: 1,
  })
  const simulacion = simulaciones[0] ?? null

  // La imagen de los pasos sin modelo 3D: el recorte del atlas del segmento
  // donde cae el código, el mismo de las tarjetas de la biblioteca. Un caso sin
  // código, o con uno sin recorte, deja esos pasos sin imagen; no se pone una
  // genérica que no diga nada del caso.
  const segmento = segmentoDeLaPlataforma(caso.codigo)
  const figura =
    segmento && tieneFigura(segmento) ? (
      <figure className="paso-a-paso-figura">
        <FiguraDelSegmento segmento={segmento} />
        <figcaption>
          <Layers size={16} aria-hidden="true" />
          Hueso · {segmento}
        </figcaption>
      </figure>
    ) : null

  const pasosDelCaso: PasoDelCaso[] = pasos.map((p, i) => {
    // El `encuadre` del modelo llega poblado porque el caso se lee con
    // `depth: 2`: el paso es una fila del arreglo `pasos` y su relación
    // `modelo` se puebla en el segundo salto, que es el mismo que trae la
    // `url`. Con `depth: 1` no habría ni dirección que abrir y el visor no se
    // montaría.
    const modelo = p.modelo as { url?: string; nombre?: string; encuadre?: Encuadre | null } | undefined

    // El paso no tiene encuadre propio que ofrecer: el arreglo `pasos` de
    // `src/collections/CasosAO.ts` declara la relación `modelo` y nada más, así
    // que el primer argumento va vacío siempre. Se llama igual a la regla, en
    // vez de pasar `modelo?.encuadre` a pelo, porque lo que hace falta aquí es
    // su tercera rama: un grupo entero a nulos —como los guarda el panel cuando
    // nadie capturó nada— tiene que salir como `undefined` para que el visor
    // vuelva a abarcar la pieza él solo. Pasándolo a pelo, el objeto de nulos
    // es verdadero, `Visor3D` se salta su `Bounds` y planta la cámara a la
    // distancia por omisión sobre un modelo que puede venir en milímetros: un
    // punto en el centro de la pantalla.
    //
    // Si algún día el paso gana su propio encuadre, se pasa aquí y ya manda: la
    // precedencia está escrita una sola vez, en `encuadreVigente`
    // (`src/lib/encuadre.ts`).
    const encuadre = encuadreVigente(undefined, modelo?.encuadre)
    return {
      numero: i + 1,
      titulo: String(p.titulo ?? ''),
      visual: modelo?.url ? <Visor3D url={modelo.url} encuadre={encuadre} nombre={modelo.nombre} /> : figura,
      contenido: (
        <>
          {/* El número también aquí, aunque la barra de arriba ya lo diga: en
              papel salen todos los pasos seguidos y la barra no se imprime. */}
          <h2 className="paso-a-paso-titulo">
            <span className="paso-numero">
              Paso {i + 1} de {pasos.length}
            </span>
            {p.titulo as string}
          </h2>
          <section className="paso-tarjeta">
            <h3>Qué se hace</h3>
            <Rico valor={p.descripcion} />
          </section>
          {/* El principio AO en el violeta del módulo, no en el ámbar de la
              nota: no es un truco ni una advertencia, es la razón biomecánica
              del gesto. */}
          {p.principio ? (
            <aside className="paso-principio">
              <span className="paso-principio-etiqueta">
                <ShieldCheck size={16} aria-hidden="true" />
                Principio AO
              </span>
              <p>{p.principio as string}</p>
            </aside>
          ) : null}
          {/* «Nota técnica» y no «Error frecuente», que es lo que dibuja
              Penpot: el campo se llama así en el panel y no todas las notas
              son errores. Rotularla como error haría decir al autor algo que
              no escribió. */}
          {tieneContenido(p.nota) ? (
            <aside className="paso-nota">
              <h3>
                <Lightbulb size={16} aria-hidden="true" />
                Nota técnica
              </h3>
              <Rico valor={p.nota} />
            </aside>
          ) : null}
        </>
      ),
    }
  })

  return (
    <main className={claseDeModulo('casos-ao')}>
      <EncabezadoImpreso
        coleccion="casos-ao"
        documentoId={id}
        tipo="Caso de técnica AO"
        titulo={caso.titulo as string}
      />
      <MigaDePan
        pasos={[
          { href: '/', texto: 'Inicio' },
          { href: '/tecnica-ao', texto: 'Técnica AO' },
          { texto: caso.titulo as string },
        ]}
      />
      <header className="cabecera-ficha">
        <EyebrowDeModulo slug="casos-ao">
          {pasos.length > 0 ? `Técnica AO · ${pasos.length} ${pasos.length === 1 ? 'paso' : 'pasos'}` : 'Técnica AO'}
        </EyebrowDeModulo>
        <h1>{caso.titulo as string}</h1>
        <Rico valor={caso.procedimiento} className="entrada" />
        {caso.codigo ? (
          <div className="etiquetas">
            <span className="codigo">AO/OTA {caso.codigo as string}</span>
          </div>
        ) : null}
        {/*
          En la cabecera y no al pie, como en la biblioteca: la lista de pasos
          puede ser larga y quien termina de leerla se queda en el último paso,
          no baja hasta el final de la página buscando una casilla.
        */}
        <FirmasDeLaFicha coleccion="casos-ao" documentoId={id} />
        <div className="barra-acciones">
          <RastreadorActividad
            coleccion="casos-ao"
            documentoId={id}
            completadoInicial={lecturas.leida(id)}
          />
          <BotonImprimir />
          <BotonComentar coleccion="casos-ao" documentoId={id} />
        </div>
      </header>

      {pasos.length === 0 ? (
        <Vacio texto="Este caso todavía no tiene pasos escritos." />
      ) : (
        <PasoAPaso
          documentoId={id}
          pasos={pasosDelCaso}
          simulador={simulacion ? { href: simulacion.href, titulo: simulacion.titulo } : null}
        />
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
