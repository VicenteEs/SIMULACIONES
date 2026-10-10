'use client'

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  GRUPOS_AO,
  HUESOS_AO,
  SEGMENTOS_AO,
  TIPOS_AO,
  nombreDelSegmento,
  type HuesoAO,
  type SegmentoAO,
  type TipoAO,
} from '@/atlas/clasificacionAO'
import { coincideConLaClasificacion, leerCodigos, type CodigoLeido } from '@/atlas/codigosAO'
import { TarjetaFicha } from '@/components/TarjetaFicha'

/**
 * Buscar una técnica por clasificación AO, como en AO Surgery Reference (D-169, E6).
 *
 * Cinco pasos que se van afinando: el **hueso**, el **segmento**, el **tipo**, el
 * **grupo** y, con la fractura ya definida, el **manejo** (placa, clavo, tornillos…).
 * Cada opción dice cuántas fichas hay detrás, y las que no tienen ninguna se ven
 * pero no se pueden pulsar: un callejón sin salida que se pudo evitar enseñando el
 * número antes.
 *
 * Reemplaza al listado como entrada del módulo, que no desaparece: queda debajo
 * como «Ver todas», porque de las 711 fichas importadas solo unas pocas traen un
 * código que se pueda leer, y una ficha sin código no deja de ser una técnica.
 * Los códigos se leen con `leerCodigos` (`src/atlas/codigosAO.ts`), que entiende
 * las formas con que se escribieron.
 */

export interface FichaParaElNavegador {
  id: string | number
  titulo: string
  codigo: string | null
  tratamiento: string | null
  borrador: boolean
  leida: boolean
}

const MANEJOS: Record<string, string> = {
  conservador: 'Tratamiento conservador',
  tornillos: 'Tornillos interfragmentarios',
  placa: 'Placa',
  clavo: 'Clavo endomedular',
  'fijador-externo': 'Fijador externo',
  kirschner: 'Agujas de Kirschner',
  artroplastia: 'Artroplastia',
  otro: 'Otro',
}

interface Eleccion {
  hueso: HuesoAO | null
  segmento: SegmentoAO | null
  tipo: TipoAO | null
  grupo: string | null
  manejo: string | null
}
const VACIA: Eleccion = { hueso: null, segmento: null, tipo: null, grupo: null, manejo: null }

export function NavegadorPorClasificacion({ fichas }: { fichas: FichaParaElNavegador[] }) {
  const [e, setE] = useState<Eleccion>(VACIA)

  // Los códigos se leen una vez, no en cada pulsación.
  const leidos = useMemo(() => new Map(fichas.map((f) => [f.id, leerCodigos(f.codigo)] as const)), [fichas])
  const conCodigo = fichas.filter((f) => (leidos.get(f.id) ?? []).length > 0).length

  const cuantas = (parcial: Partial<Eleccion>): number => {
    const f = { ...e, ...parcial }
    return fichas.filter((ficha) => {
      const codigos: CodigoLeido[] = leidos.get(ficha.id) ?? []
      if (!coincideConLaClasificacion(codigos, f)) return false
      if (f.manejo && ficha.tratamiento !== f.manejo) return false
      // Sin ningún filtro de clasificación, solo cuentan las que traen un código que se pueda leer.
      if (!f.hueso && codigos.length === 0 && !f.manejo) return false
      return true
    }).length
  }

  const resultado = useMemo(
    () =>
      fichas.filter((ficha) => {
        const codigos = leidos.get(ficha.id) ?? []
        if (!coincideConLaClasificacion(codigos, e)) return false
        if (e.manejo && ficha.tratamiento !== e.manejo) return false
        return true
      }),
    [fichas, leidos, e],
  )

  const hayFiltro = Boolean(e.hueso)
  // Los tres tipos en todos los segmentos: el asistente de fracturas solo sabe construir los simples en
  // los extremos, pero una ficha de una fractura articular (43-C) existe igual y se tiene que poder encontrar.
  const tiposDelSegmento = e.segmento ? TIPOS_AO : []
  const gruposDelTipo = e.segmento && e.tipo ? GRUPOS_AO.filter((g) => g.tipo === e.tipo && g.segmentos.includes(e.segmento as SegmentoAO)) : []
  // Los grupos con código propio de 2018: AO ya no numera B ni C en la diáfisis (D-169).
  const gruposConCodigo = gruposDelTipo.filter((g) => g.id !== 'CM')

  const afinar = (cambios: Partial<Eleccion>) => setE((antes) => ({ ...antes, ...cambios }))

  return (
    <section className="navegador-ao" aria-label="Buscar por clasificación AO">
      <div className="navegador-ao-cabecera">
        <h2 className="navegador-ao-titulo">Buscar por clasificación AO</h2>
        {hayFiltro || e.manejo ? (
          <button type="button" className="boton boton-secundario boton-sm" onClick={() => setE(VACIA)}>
            Empezar de nuevo
          </button>
        ) : null}
      </div>
      <p className="navegador-ao-nota">
        {conCodigo === 0
          ? 'Ninguna ficha trae todavía un código AO que se pueda leer: las que se escriban con su código (42-A2, 43-C…) aparecerán aquí.'
          : `${conCodigo} de ${fichas.length} fichas traen un código AO. Las demás están en «Todas las técnicas», abajo.`}
      </p>

      <ol className="navegador-ao-migas" aria-label="Lo que ha elegido">
        <li>
          <button type="button" className={`miga${!e.hueso ? ' activa' : ''}`} onClick={() => setE(VACIA)}>
            Hueso
          </button>
        </li>
        {e.hueso ? (
          <li>
            <ChevronRight size={14} aria-hidden="true" />
            <button type="button" className={`miga${e.hueso && !e.segmento ? ' activa' : ''}`} onClick={() => afinar({ segmento: null, tipo: null, grupo: null, manejo: null })}>
              {HUESOS_AO.find((h) => h.id === e.hueso)?.nombre}
            </button>
          </li>
        ) : null}
        {e.segmento ? (
          <li>
            <ChevronRight size={14} aria-hidden="true" />
            <button type="button" className={`miga${e.segmento && !e.tipo ? ' activa' : ''}`} onClick={() => afinar({ tipo: null, grupo: null, manejo: null })}>
              {nombreDelSegmento(e.hueso as string, e.segmento)}
            </button>
          </li>
        ) : null}
        {e.tipo ? (
          <li>
            <ChevronRight size={14} aria-hidden="true" />
            <button type="button" className={`miga${e.tipo && !e.grupo ? ' activa' : ''}`} onClick={() => afinar({ grupo: null, manejo: null })}>
              Tipo {e.tipo}
            </button>
          </li>
        ) : null}
        {e.grupo ? (
          <li>
            <ChevronRight size={14} aria-hidden="true" />
            <span className="miga activa">{GRUPOS_AO.find((g) => g.id === e.grupo)?.nombre}</span>
          </li>
        ) : null}
      </ol>

      {/* 1 · Hueso */}
      {!e.hueso ? (
        <>
          <h3 className="navegador-ao-paso">1 · Elija el hueso</h3>
          <ul className="navegador-ao-opciones">
            {HUESOS_AO.map((h) => {
              const n = cuantas({ hueso: h.id })
              return (
                <li key={h.id}>
                  <button type="button" className="opcion-ao" disabled={n === 0} onClick={() => afinar({ hueso: h.id })}>
                    <span>{h.nombre}</span>
                    <span className="opcion-ao-cuenta">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {/* 2 · Segmento */}
      {e.hueso && !e.segmento ? (
        <>
          <h3 className="navegador-ao-paso">2 · Elija el segmento</h3>
          <ul className="navegador-ao-opciones">
            {SEGMENTOS_AO.map((s) => {
              const n = cuantas({ segmento: s.id })
              return (
                <li key={s.id}>
                  <button type="button" className="opcion-ao" disabled={n === 0} onClick={() => afinar({ segmento: s.id })}>
                    <span>{nombreDelSegmento(e.hueso as string, s.id)}</span>
                    <span className="opcion-ao-cuenta">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {/* 3 · Tipo */}
      {e.segmento && !e.tipo ? (
        <>
          <h3 className="navegador-ao-paso">3 · Elija el tipo de fractura</h3>
          <ul className="navegador-ao-opciones">
            {tiposDelSegmento.map((t) => {
              const n = cuantas({ tipo: t.id })
              return (
                <li key={t.id}>
                  <button type="button" className="opcion-ao" disabled={n === 0} onClick={() => afinar({ tipo: t.id })}>
                    <span>
                      <strong>{t.id}</strong> · {t.nombre}
                    </span>
                    <span className="opcion-ao-cuenta">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {/* 4 · Grupo */}
      {e.tipo && !e.grupo && gruposConCodigo.length > 0 ? (
        <>
          <h3 className="navegador-ao-paso">4 · Elija el patrón</h3>
          <ul className="navegador-ao-opciones">
            {gruposConCodigo.map((g) => {
              const n = cuantas({ grupo: g.id })
              return (
                <li key={g.id}>
                  <button type="button" className="opcion-ao" disabled={n === 0} onClick={() => afinar({ grupo: g.id })}>
                    <span>
                      <strong>{g.id}</strong> · {g.nombre}
                    </span>
                    <span className="opcion-ao-cuenta">{n}</span>
                  </button>
                </li>
              )
            })}
            <li>
              <button type="button" className="opcion-ao" onClick={() => afinar({ grupo: null, manejo: null })} aria-pressed="true">
                <span>Todas las de este tipo</span>
                <span className="opcion-ao-cuenta">{cuantas({})}</span>
              </button>
            </li>
          </ul>
        </>
      ) : null}

      {/* 5 · Manejo */}
      {e.hueso ? (
        <>
          <h3 className="navegador-ao-paso">Alternativas de manejo</h3>
          <ul className="navegador-ao-opciones">
            {Object.entries(MANEJOS).map(([valor, etiqueta]) => {
              const n = cuantas({ manejo: valor })
              if (n === 0 && e.manejo !== valor) return null
              return (
                <li key={valor}>
                  <button
                    type="button"
                    className={`opcion-ao${e.manejo === valor ? ' elegida' : ''}`}
                    aria-pressed={e.manejo === valor}
                    onClick={() => afinar({ manejo: e.manejo === valor ? null : valor })}
                  >
                    <span>{etiqueta}</span>
                    <span className="opcion-ao-cuenta">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {hayFiltro ? (
        <div className="navegador-ao-resultado" aria-live="polite">
          <h3 className="navegador-ao-paso">
            {resultado.length === 0
              ? 'Ninguna ficha coincide'
              : `${resultado.length} ${resultado.length === 1 ? 'ficha coincide' : 'fichas coinciden'}`}
          </h3>
          {resultado.length === 0 ? (
            <p className="navegador-ao-nota">No hay técnicas con ese código todavía. «Empezar de nuevo» o mire «Todas las técnicas».</p>
          ) : (
            <ul className="rejilla-fichas">
              {resultado.map((d) => (
                <li key={d.id}>
                  <TarjetaFicha
                    href={`/tecnica-ao/${d.id}`}
                    titulo={d.titulo}
                    codigo={d.codigo}
                    borrador={d.borrador}
                    leida={d.leida}
                    accion="Ver técnica"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
