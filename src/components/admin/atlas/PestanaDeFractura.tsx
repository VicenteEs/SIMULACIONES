'use client'

/**
 * La pestaña «Fractura» del taller (D-161, E4): un asistente de seis pasos que
 * parte un hueso largo en los fragmentos de un patrón AO.
 *
 *   1. Seleccione un hueso.            4. El grupo.
 *   2. El segmento.                    5. Dónde cae y cuánto ocupa.
 *   3. El tipo.                        6. Vista previa y «Fracturar».
 *
 * Es un componente de presentación: no parte nada ni toca el visor. Recibe lo que
 * hay —selección, fracturas hechas, medidas del hueso— y avisa de lo que se pide;
 * el taller lo ejecuta, con una sola entrada del historial. Tampoco importa
 * `three`: las medidas llegan ya hechas por `medir`.
 */

import { piezaDe, type FracturaDeInstancia, type RecetaDeFractura } from '@/atlas/formato'
import {
  GRUPOS_AO,
  SEGMENTOS_AO,
  codigoAO,
  describirFractura,
  gruposDe,
  huesoAO,
  nombreDelSegmento,
  tiposDe,
  type GrupoAO,
  type SegmentoAO,
  type TipoAO,
} from '@/atlas/clasificacionAO'
import { huesoDeLaPieza } from '@/atlas/huesosAO'
import { fragmentosEsperados } from '@/atlas/patronesDeFractura'
import {
  LIMITES_DE_LA_EXTENSION,
  conGrupo,
  conSegmento,
  conTipo,
  limitesDelMandoDelCentro,
  mandosDelGrupo,
  pasoActual,
  recetaDelBorrador,
  type BorradorDeFractura,
  type MedidaDelHueso,
} from '@/atlas/borradorDeFractura'

export type EstadoDelHueso = 'entero' | 'movido' | 'partido' | 'apagado'

const CARAS = [
  { giro: 0, nombre: 'Delante' },
  { giro: 90, nombre: 'Lateral' },
  { giro: 180, nombre: 'Detrás' },
  { giro: 270, nombre: 'Medial' },
] as const

/** Por qué el hueso elegido no se puede fracturar ahora, dicho para quien trabaja. */
const POR_QUE_NO: Record<Exclude<EstadoDelHueso, 'entero'>, string> = {
  movido:
    'Ese hueso está fuera de su sitio. Devuélvalo con «A su sitio» antes de fracturarlo: los cortes se calculan sobre el hueso en su posición anatómica.',
  partido:
    'Ese hueso ya está partido a mano. Suelde sus cortes («Soldar») para construir una fractura AO encima.',
  apagado: 'Ese hueso no está encendido. Enciéndalo en la lista para fracturarlo.',
}

/**
 * Un dibujo esquemático de cada grupo: el hueso de canto y el trazo encima. Son
 * pictogramas nuestros, no copia de los de AO.
 */
function Pictograma({ grupo }: { grupo: GrupoAO }) {
  const hueso = <rect x="13" y="3" width="14" height="54" rx="5" className="fractura-hueso" />
  const trazo = (d: string) => <path d={d} className="fractura-trazo" fill="none" />
  const dibujos: Record<GrupoAO, React.ReactNode> = {
    A1: trazo('M12 12 C 30 18, 10 26, 28 32 S 12 44, 28 50'),
    A2: trazo('M10 40 L 30 20'),
    A3: trazo('M10 30 L 30 30'),
    B2: <path d="M27 20 L 18 31 L 27 42 Z" className="fractura-trazo" fill="none" />,
    B3: (
      <>
        <path d="M27 18 L 18 31 L 27 44 Z" className="fractura-trazo" fill="none" />
        {trazo('M22 31 L 27 31')}
      </>
    ),
    C2: (
      <>
        {trazo('M10 22 L 30 22')}
        {trazo('M10 40 L 30 40')}
      </>
    ),
    C3: (
      <>
        {trazo('M10 22 L 30 22')}
        {trazo('M10 40 L 30 40')}
        {trazo('M12 36 L 28 26')}
      </>
    ),
  }
  return (
    <svg viewBox="0 0 40 60" width="34" height="50" aria-hidden="true" focusable="false">
      {hueso}
      {dibujos[grupo]}
    </svg>
  )
}

interface Tarjeta {
  id: string
  titulo: string
  detalle: string
  grupo?: GrupoAO
  deshabilitada?: boolean
  nota?: string
}

function Tarjetas({
  nombre,
  elegida,
  tarjetas,
  alElegir,
}: {
  nombre: string
  elegida: string | null
  tarjetas: Tarjeta[]
  alElegir: (id: string) => void
}) {
  return (
    <div className="fractura-tarjetas" role="radiogroup" aria-label={nombre}>
      {tarjetas.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={elegida === t.id}
          disabled={t.deshabilitada}
          className="fractura-tarjeta"
          onClick={() => alElegir(t.id)}
        >
          {t.grupo ? <Pictograma grupo={t.grupo} /> : null}
          <span className="fractura-tarjeta-titulo">{t.titulo}</span>
          <span className="fractura-tarjeta-detalle">{t.nota ?? t.detalle}</span>
        </button>
      ))}
    </div>
  )
}

export function PestanaDeFractura({
  seleccion,
  fracturas,
  borrador,
  alCambiarBorrador,
  medir,
  nombreDePieza,
  estadoDelHueso,
  alFracturar,
  alQuitar,
  alEditar,
}: {
  seleccion: ReadonlySet<string>
  /** Las fracturas que hay hechas en la preparación. */
  fracturas: readonly FracturaDeInstancia[]
  borrador: BorradorDeFractura
  alCambiarBorrador: (borrador: BorradorDeFractura) => void
  medir: (pieza: string) => MedidaDelHueso | null
  nombreDePieza: (id: string) => string
  estadoDelHueso: (pieza: string) => EstadoDelHueso
  alFracturar: (receta: RecetaDeFractura, medida: MedidaDelHueso) => void
  alQuitar: (pieza: string) => void
  alEditar: (fractura: FracturaDeInstancia) => void
}) {
  // El hueso elegido: la primera pieza seleccionada que sea un hueso de la tabla,
  // o un trozo suyo (para encontrar la fractura de la que forma parte).
  // Sin memorizar: es un recorrido de unos pocos elementos.
  let raiz: string | null = null
  for (const id of seleccion) {
    if (huesoDeLaPieza(id)) {
      raiz = piezaDe(id)
      break
    }
  }
  const hueso = raiz ? huesoDeLaPieza(raiz) : null
  const medida = raiz && hueso ? medir(raiz) : null
  const hecha = raiz ? fracturas.find((f) => f.pieza === raiz) : undefined
  const estado = raiz ? estadoDelHueso(raiz) : null
  const paso = pasoActual(borrador)

  const receta = raiz && hueso && medida ? recetaDelBorrador(raiz, hueso.hueso, borrador, medida) : null

  if (fracturas.length === 0 && !raiz) {
    return (
      <div className="fractura">
        <h3 className="atlas-subtitulo">1 · Seleccione un hueso</h3>
        <p className="campo-ayuda">
          Pulse en el visor un hueso —húmero, radio, cúbito, fémur, tibia, peroné, clavícula, metacarpiano, metatarsiano o
          falange— o elíjalo en la lista.
        </p>
      </div>
    )
  }

  return (
    <div className="fractura">
      <h3 className="atlas-subtitulo">1 · Hueso</h3>
      {raiz && hueso ? (
        <p className="atlas-lectura-pequena">
          {nombreDePieza(raiz)} <span className="atlas-conteo">({hueso.lado})</span>
        </p>
      ) : (
        <p className="campo-ayuda">
          Seleccione un hueso —húmero, radio, cúbito, fémur, tibia, peroné, clavícula, metacarpiano, metatarsiano o
          falange— para construir su fractura.
        </p>
      )}

      {hecha ? (
        <div className="fractura-hecha">
          <p className="atlas-lectura">{describirFractura(hecha.hueso, hecha.segmento, hecha.grupo)}</p>
          <p className="campo-ayuda">
            Ya está fracturado: {fragmentosEsperados(hecha)} fragmentos, que se mueven con «Manipular» (V), con G y R o con
            las asas. En la ficha el residente ve el hueso ya fracturado, con este código.
          </p>
          <div className="fractura-acciones">
            <button type="button" className="atlas-herramienta" onClick={() => alEditar(hecha)}>
              Cambiar la fractura
            </button>
            <button type="button" className="atlas-herramienta" onClick={() => alQuitar(hecha.pieza)}>
              Quitar la fractura
            </button>
          </div>
        </div>
      ) : null}

      {!hecha && raiz && estado && estado !== 'entero' ? <p className="campo-ayuda">{POR_QUE_NO[estado]}</p> : null}
      {raiz && hueso && huesoAO(hueso.hueso)?.nota ? <p className="campo-ayuda">{huesoAO(hueso.hueso)?.nota}</p> : null}

      {!hecha && raiz && hueso && estado === 'entero' && medida ? (
        <>
          <h3 className="atlas-subtitulo">2 · Segmento</h3>
          <Tarjetas
            nombre="Segmento del hueso"
            elegida={borrador.segmento === null ? null : String(borrador.segmento)}
            tarjetas={SEGMENTOS_AO.map((s) => ({
              id: String(s.id),
              titulo: nombreDelSegmento(hueso.hueso, s.id) ?? s.nombre,
              detalle: s.descripcion,
            }))}
            alElegir={(id) => alCambiarBorrador(conSegmento(borrador, Number(id) as SegmentoAO))}
          />

          {borrador.segmento ? (
            <>
              <h3 className="atlas-subtitulo">3 · Tipo</h3>
              <Tarjetas
                nombre="Tipo de fractura"
                elegida={borrador.tipo}
                tarjetas={tiposDe(borrador.segmento).map((t) => ({ id: t.id, titulo: `${t.id} · ${t.nombre}`, detalle: t.descripcion }))}
                alElegir={(id) => alCambiarBorrador(conTipo(borrador, id as TipoAO))}
              />
              {borrador.segmento !== 2 ? (
                <p className="campo-ayuda">
                  En los extremos solo se construye lo extraarticular simple. Lo articular (B y C) depende de cada
                  articulación y llega en una segunda versión.
                </p>
              ) : null}
            </>
          ) : null}

          {borrador.segmento && borrador.tipo ? (
            <>
              <h3 className="atlas-subtitulo">4 · Grupo</h3>
              <Tarjetas
                nombre="Grupo de la fractura"
                elegida={borrador.grupo}
                tarjetas={gruposDe(borrador.segmento, borrador.tipo).map((g) => ({
                  id: g.id,
                  titulo: `${g.id} · ${g.nombre}`,
                  detalle: g.descripcion,
                  grupo: g.id,
                  deshabilitada: !g.disponible,
                  nota: g.disponible ? undefined : 'Próximamente: su superficie no es un plano.',
                }))}
                alElegir={(id) => alCambiarBorrador(conGrupo(borrador, id as GrupoAO))}
              />
            </>
          ) : null}

          {borrador.segmento && borrador.grupo && receta ? (
            <Porcion
              borrador={borrador}
              alCambiarBorrador={alCambiarBorrador}
              medida={medida}
              segmento={borrador.segmento}
              grupo={borrador.grupo}
              receta={receta}
            />
          ) : null}

          <h3 className="atlas-subtitulo">6 · Vista previa</h3>
          {receta ? (
            <>
              <p className="atlas-lectura">{describirFractura(receta.hueso, receta.segmento, receta.grupo)}</p>
              <p className="campo-ayuda">
                Deja {fragmentosEsperados(receta)} fragmentos. El plano del primer corte se ve sobre el hueso mientras
                ajusta; «Fracturar» los crea en un solo paso, que Ctrl + Z deshace.
              </p>
              <button type="button" className="atlas-herramienta atlas-herramienta-principal" onClick={() => alFracturar(receta, medida)}>
                Fracturar
              </button>
            </>
          ) : (
            <p className="campo-ayuda">
              {paso === 2 ? 'Elija el segmento.' : paso === 3 ? 'Elija el tipo.' : 'Elija el grupo.'}
            </p>
          )}
        </>
      ) : null}

      {fracturas.length > 0 ? (
        <>
          <h3 className="atlas-subtitulo">En esta preparación</h3>
          <ul className="atlas-apuntes">
            {fracturas.map((f) => (
              <li key={f.pieza}>
                <span>{describirFractura(f.hueso, f.segmento, f.grupo) ?? f.codigo}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function Porcion({
  borrador,
  alCambiarBorrador,
  medida,
  segmento,
  grupo,
  receta,
}: {
  borrador: BorradorDeFractura
  alCambiarBorrador: (b: BorradorDeFractura) => void
  medida: MedidaDelHueso
  segmento: SegmentoAO
  grupo: GrupoAO
  receta: RecetaDeFractura
}) {
  const mandos = mandosDelGrupo(grupo)
  const limites = limitesDelMandoDelCentro(medida, segmento, grupo, receta.porcion.extension)
  const cambiar = (parte: Partial<BorradorDeFractura>) => alCambiarBorrador({ ...borrador, ...parte })
  const codigo = codigoAO(receta.hueso, receta.segmento, receta.grupo)
  const corto = GRUPOS_AO.find((g) => g.id === grupo)?.nombre.toLowerCase() ?? ''

  return (
    <>
      <h3 className="atlas-subtitulo">5 · Porción</h3>
      <p className="campo-ayuda">
        {codigo} · {corto}. Dónde cae, dentro del segmento, y cuánto ocupa.
      </p>
      {mandos.centro ? (
        <label className="atlas-separador-mando">
          <span>Dónde cae</span>
          <input
            type="range"
            min={Math.ceil(limites.min)}
            max={Math.max(Math.ceil(limites.min), Math.floor(limites.max))}
            step={1}
            value={Math.round(receta.porcion.centro)}
            onChange={(e) => cambiar({ centro: Number(e.target.value) })}
          />
          <span className="atlas-separador-valor">{Math.round(receta.porcion.centro)} %</span>
        </label>
      ) : null}
      {mandos.extension ? (
        <label className="atlas-separador-mando">
          <span>{grupo === 'B2' || grupo === 'B3' ? 'Altura de la cuña' : 'Largo del segmento'}</span>
          <input
            type="range"
            min={LIMITES_DE_LA_EXTENSION.min}
            max={LIMITES_DE_LA_EXTENSION.max}
            step={1}
            value={Math.round(receta.porcion.extension)}
            onChange={(e) => cambiar({ extension: Number(e.target.value) })}
          />
          <span className="atlas-separador-valor">{Math.round(receta.porcion.extension)} %</span>
        </label>
      ) : null}
      {mandos.inclinacion ? (
        <label className="atlas-separador-mando">
          <span>Inclinación</span>
          <input
            type="range"
            min={mandos.inclinacion.min}
            max={mandos.inclinacion.max}
            step={1}
            value={Math.round(receta.inclinacion)}
            onChange={(e) => cambiar({ inclinacion: Number(e.target.value) })}
          />
          <span className="atlas-separador-valor">{Math.round(receta.inclinacion)}°</span>
        </label>
      ) : null}
      {mandos.cara ? (
        <div className="atlas-separador-mando" role="radiogroup" aria-label="Por qué cara sube el trazo">
          <span>Cara</span>
          {CARAS.map((c) => (
            <label key={c.giro} className="atlas-casilla" style={{ flex: 'none' }}>
              <input
                type="radio"
                name="fractura-cara"
                checked={Math.round(receta.giro) === c.giro}
                onChange={() => cambiar({ giro: c.giro })}
              />
              <span>{c.nombre}</span>
            </label>
          ))}
        </div>
      ) : null}
      {mandos.variante ? (
        <button
          type="button"
          className="atlas-herramienta"
          title="Cambia los detalles del corte de dentro; los fragmentos principales no cambian"
          onClick={() => cambiar({ semilla: borrador.semilla + 1 })}
        >
          Otra variante
        </button>
      ) : null}
    </>
  )
}
