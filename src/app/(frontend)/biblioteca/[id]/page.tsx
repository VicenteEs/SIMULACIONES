import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { PESTANAS_FICHA, pestanasConContenido } from '@/lib/fichas'
import { lecturasDelResidente } from '@/lib/lecturas'
import { puedeEditar } from '@/lib/guardias'
import { cerradoPorMantencion, puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { regionDeSegmento } from '@/lib/regiones'
import { delMismoSegmento } from '@/lib/delMismoSegmento'
import { SinAcceso, ModuloNoDisponible, SinAccesoAlModulo } from '@/components/Estados'
import { Bloques } from '@/components/Bloques'
import { PestanasDeFicha, type PanelDeFicha } from '@/components/ficha/PestanasDeFicha'

import { FormularioComentario } from '@/components/FormularioComentario'

import { BotonImprimir } from '@/components/BotonImprimir'
import { EncabezadoImpreso } from '@/components/EncabezadoImpreso'
import { FirmasDeLaFicha } from '@/components/FirmasDeLaFicha'
import { BotonComentar } from '@/components/BotonComentar'
import { EyebrowDeModulo, MigaDePan, claseDeModulo } from '@/components/Cabeceras'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { Vacio } from '@/components/ui/Vacio'
import { ArrowRight, FileText, PenLine } from 'lucide-react'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

interface Siguiente {
  coleccion: 'casos-ao' | 'cirugias'
  href: string
  texto: string
}

/**
 * Ficha de patología, con el tablero de Penpot (P-007 E4, D-237): las
 * pestañas arriba, la sección elegida a la izquierda y, a la derecha, los datos
 * de la ficha y lo que sigue.
 */
export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuario, rolReal, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Biblioteca de patologías" />

  // Antes del `findByID`, y con el usuario efectivo que va a él. El `.catch` de
  // abajo existe para que una ficha retirada acabe en `notFound()`, pero se
  // traga también el `Forbidden` de la regla de lectura: a quien no tiene el
  // módulo y abría el enlace que le pasó un compañero le salía «Esta ficha ya
  // no está» sobre una patología publicada. Con el usuario real, un
  // administrador en vista previa pasaría la guardia y volvería a caer en lo
  // mismo. El porqué entero, en la cabecera de `SinAccesoAlModulo`.
  // Un módulo en mantención se le cierra al residente con su propia pantalla (D-156).
  const enMantencion = await modulosEnMantencion()
  if (!puedeVerModulo(usuarioEfectivo as UsuarioSesion | null, 'patologias', enMantencion)) {
    return cerradoPorMantencion(usuarioEfectivo as UsuarioSesion | null, 'patologias', enMantencion) ? (
      <ModuloNoDisponible titulo="Biblioteca de patologías" />
    ) : (
      <SinAccesoAlModulo titulo="Biblioteca de patologías" />
    )
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
  const tipo = ficha.tipo as { nombre?: string } | undefined
  const region = regionDeSegmento(segmento?.nombre).region

  // «Editar» con el rol real, como «Nueva ficha» en la biblioteca: la vista
  // previa baja lo que se lee, no lo que quien la tiene puesta puede hacer.
  const puedeEditarla = (rolReal === 'admin' || rolReal === 'editor') && puedeEditar(usuario ?? {}, 'patologias')

  const paneles: PanelDeFicha[] = pestanas.map((p) => ({
    campo: p.campo,
    etiqueta: p.etiqueta,
    numero: PESTANAS_FICHA.findIndex((f) => f.campo === p.campo) + 1,
    contenido: (
      <>
        <Bloques bloques={ficha[p.campo as keyof typeof ficha]} />
        {p.campo === 'rehabilitacion' && Array.isArray(ficha.fases) ? (
          <ol className="fases">
            {(ficha.fases as Record<string, string>[]).map((f, i) => (
              <li key={i}>
                <span className="fase-cuando">{f.cuando}</span>
                {/* h3 y no h4: el encabezado de este apartado es el <h2> de
                    la sección y las fases cuelgan directamente de él, no de
                    los bloques. Con «Rehabilitación» compuesta solo de fases
                    —caso que `pestanasConContenido` admite a propósito,
                    `src/lib/fichas.ts`— <Bloques> no pinta ningún <h3> y la
                    secuencia real era h1 → h2 → h4: quien recorre la ficha
                    saltando por encabezados oía un nivel intermedio que no
                    existe y las fases aparecían colgando de nada.
                    El tamaño visual no sigue al nivel: en `estilos.css`
                    vive `.fases h3`, con su tamaño y su margen,
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
      </>
    ),
  }))

  // La técnica y el caso del mismo segmento AO, por el código: la búsqueda
  // vive en `src/lib/delMismoSegmento.ts`, que la técnica AO comparte.
  const { tecnicas, casos } = await delMismoSegmento(payload, usuarioEfectivo, enMantencion, ficha.codigo)
  const siguientes: Siguiente[] = [
    ...tecnicas.map((t) => ({ coleccion: t.coleccion, href: t.href, texto: `Técnica AO · ${t.titulo}` })),
    ...casos.map((c) => ({ coleccion: c.coleccion, href: c.href, texto: `Simular · ${c.titulo}` })),
  ]

  const datos = [
    ['Segmento', segmento?.nombre],
    ['Región', segmento?.nombre && region.clave !== 'otros' ? region.titulo : null],
    ['Clasificación', ficha.codigo as string | undefined],
    ['Tipo', tipo?.nombre],
  ].filter((d): d is [string, string] => typeof d[1] === 'string' && d[1].trim() !== '')

  const lateral = (
    <aside className="ficha-lateral" aria-label="Sobre esta ficha">
      {datos.length > 0 ? (
        <section className="ficha-lateral-tarjeta">
          <h2 className="rotulo">En esta ficha</h2>
          <dl className="ficha-lateral-datos">
            {datos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {siguientes.length > 0 ? (
        <section className="ficha-lateral-tarjeta">
          <h2 className="rotulo">Continúe con</h2>
          <ul className="ficha-siguientes">
            {siguientes.map((s) => {
              const Icono = IDENTIDAD_DE_MODULO[s.coleccion]?.icono ?? ArrowRight
              return (
                <li key={s.href} className={IDENTIDAD_DE_MODULO[s.coleccion]?.clase}>
                  <Link href={s.href}>
                    <Icono size={18} aria-hidden="true" />
                    <span>{s.texto}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </aside>
  )

  return (
    <main className={claseDeModulo('patologias')}>
      <EncabezadoImpreso
        coleccion="patologias"
        documentoId={id}
        tipo="Ficha de patología"
        titulo={ficha.nombre as string}
      />
      <MigaDePan
        pasos={[
          { href: '/', texto: 'Inicio' },
          { href: '/biblioteca', texto: 'Biblioteca' },
          { texto: segmento?.nombre ?? (ficha.nombre as string) },
        ]}
      />

      <header className="cabecera-ficha">
        <EyebrowDeModulo slug="patologias">
          {segmento?.nombre ? `Biblioteca · ${segmento.nombre}` : 'Biblioteca de patologías'}
        </EyebrowDeModulo>
        <h1>{ficha.nombre as string}</h1>
        {ficha.subtitulo ? <p className="entrada">{ficha.subtitulo as string}</p> : null}
        {ficha.codigo || tipo?.nombre ? (
          <div className="etiquetas">
            {ficha.codigo ? <span className="codigo">{ficha.codigo as string}</span> : null}
            {tipo?.nombre ? <span className="etiqueta">{tipo.nombre}</span> : null}
          </div>
        ) : null}
        {/* Las acciones de la ficha en una fila de botones pequeños, bajo el
            título. «Guardar PDF» vivía en la miga, la casilla suelta a la
            derecha y «Comentar» solo al final de la página. */}
        <FirmasDeLaFicha coleccion="patologias" documentoId={id} />
        <div className="barra-acciones">
          <RastreadorActividad
            coleccion="patologias"
            documentoId={id}
            completadoInicial={completadoInicial}
          />
          <BotonImprimir />
          <BotonComentar coleccion="patologias" documentoId={id} />
          {puedeEditarla ? (
            <Link className="boton boton-fantasma boton-sm" href={`/admin-panel/contenido/patologias/${id}`}>
              <PenLine size={16} aria-hidden="true" />
              Editar
            </Link>
          ) : null}
        </div>
      </header>

      {pestanas.length === 0 ? (
        <div className="ficha-cuerpo">
          <div className="ficha-contenido">
            <Vacio icono={FileText} titulo="Esta ficha aún no tiene contenido publicado" compacto />
          </div>
          {lateral}
        </div>
      ) : (
        <PestanasDeFicha coleccion="patologias" documentoId={id} paneles={paneles} lateral={lateral} />
      )}

      <FormularioComentario coleccion="patologias" documentoId={id} />
    </main>
  )
}
