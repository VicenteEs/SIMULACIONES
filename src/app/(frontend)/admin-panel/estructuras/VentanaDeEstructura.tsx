'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { History } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import {
  CAMPOS_DE_LA_FICHA,
  ETIQUETA_DEL_CAMPO,
  ETIQUETA_DEL_LADO,
  LARGO_MAXIMO_DEL_CAMPO,
  camposQueCuentan,
  etiquetaDelCampo,
  familiaDeSistema,
  normalizarTexto,
  type CampoDeLaFicha,
  type FichaCompleta,
} from '@/lib/estructuras'
import type { VersionDeLaFicha } from '@/lib/estructurasServidor'
import {
  guardarEstructura,
  leerEstructura,
  restaurarVersionDeEstructura,
} from '@/app/(frontend)/acciones/estructuras'

type Textos = Record<CampoDeLaFicha, string>

/** Los campos que se escriben en una línea; el resto, en un cuadro de varias. */
const DE_UNA_LINEA: readonly CampoDeLaFicha[] = ['nombreLatino']

const textosDe = (ficha: FichaCompleta): Textos =>
  Object.fromEntries(CAMPOS_DE_LA_FICHA.map((campo) => [campo, ficha[campo]])) as Textos

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const recortar = (texto: string, largo = 110) => (texto.length > largo ? `${texto.slice(0, largo).trimEnd()}…` : texto)

/**
 * La ventana donde se escribe la ficha de una pieza (D-179, P-003 E8.4).
 *
 * Los campos van en el orden de las capturas que trajo Cristóbal. Los que cuentan
 * para dar la ficha por completa —según el sistema de la pieza— y todavía no tienen
 * texto se marcan «Falta», **con el resto a la vista**: quien llena tiene que ver
 * qué se le pide y qué es opcional (pedido 17 del plan P-003).
 *
 * Lo que no se hace: guardar a ciegas. Al abrir se anota cómo estaba cada campo
 * (`base`) y al guardar se manda junto a lo escrito; si otra persona escribió un
 * campo que esta tocó, el servidor devuelve el conflicto y aquí se enseñan las dos
 * versiones, sin guardar nada hasta que se elija. Y toda ficha guarda sus versiones
 * anteriores, que se ven y se restauran desde «Historial».
 */
export function VentanaDeEstructura({
  atlasId,
  region,
  sistema,
  alCerrar,
  alGuardar,
}: {
  atlasId: string
  /** La región y el sistema ya con su nombre en español: los resuelve la pantalla, que tiene el catálogo. */
  region: string
  sistema: string
  alCerrar: () => void
  /** Se llama tras un guardado o una restauración, para que la lista y el contador se pongan al día. */
  alGuardar: () => void
}) {
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const [enCurso, iniciar] = useTransition()

  const [ficha, setFicha] = useState<FichaCompleta | null>(null)
  const [versiones, setVersiones] = useState<VersionDeLaFicha[]>([])
  const [textos, setTextos] = useState<Textos | null>(null)
  /** Cómo estaba cada campo cuando se abrió (o cuando se recogió lo ajeno). */
  const [base, setBase] = useState<Textos | null>(null)
  const [oculta, setOculta] = useState(false)
  const [ocultaBase, setOcultaBase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicto, setConflicto] = useState<{ campos: CampoDeLaFicha[]; actual: FichaCompleta } | null>(null)

  const poner = (nueva: FichaCompleta, nuevasVersiones?: VersionDeLaFicha[]) => {
    setFicha(nueva)
    setTextos(textosDe(nueva))
    setBase(textosDe(nueva))
    setOculta(nueva.oculta)
    setOcultaBase(nueva.oculta)
    if (nuevasVersiones) setVersiones(nuevasVersiones)
  }

  useEffect(() => {
    let vigente = true
    leerEstructura(atlasId).then((respuesta) => {
      if (!vigente) return
      if (respuesta.exito && respuesta.datos) poner(respuesta.datos.ficha, respuesta.datos.versiones)
      else setError(respuesta.mensaje ?? 'No se pudo abrir la ficha.')
    })
    return () => {
      vigente = false
    }
  }, [atlasId])

  const sucia = useMemo(() => {
    if (!textos || !base) return false
    return oculta !== ocultaBase || CAMPOS_DE_LA_FICHA.some((c) => normalizarTexto(textos[c]) !== normalizarTexto(base[c]))
  }, [textos, base, oculta, ocultaBase])

  const cerrar = async () => {
    if (sucia) {
      const si = await confirmar({
        titulo: '¿Cerrar sin guardar?',
        mensaje: 'Lo que escribió en esta ficha se perdería.',
        confirmar: 'Cerrar sin guardar',
      })
      if (!si) return
    }
    alCerrar()
  }

  const guardar = (forzar = false) => {
    if (!textos || !base) return
    setError(null)
    iniciar(async () => {
      const respuesta = await guardarEstructura(atlasId, { campos: textos, base, oculta, ocultaBase }, forzar)
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.mensaje ?? 'No se pudo guardar la ficha.')
        return
      }
      if (respuesta.datos.tipo === 'conflicto') {
        setConflicto({ campos: respuesta.datos.campos, actual: respuesta.datos.actual })
        return
      }
      setConflicto(null)
      avisar('ok', respuesta.datos.cambiados.length > 0 ? 'Ficha guardada.' : 'No había nada que guardar.')
      alGuardar()
      alCerrar()
    })
  }

  /** Recoge lo que escribió la otra persona en los campos en conflicto y conserva lo demás de esta. */
  const usarLoActual = () => {
    if (!conflicto || !textos) return
    const { actual } = conflicto
    const nuevosTextos = { ...textos }
    for (const campo of conflicto.campos) nuevosTextos[campo] = actual[campo]
    // La base pasa a ser lo que hay ahora: lo que esta persona haya tocado en otros campos se sigue
    // contando como suyo, y lo recogido ya no cuenta como un cambio.
    setBase(textosDe(actual))
    setTextos(nuevosTextos)
    setOcultaBase(actual.oculta)
    setFicha(actual)
    setConflicto(null)
  }

  const restaurar = async (version: VersionDeLaFicha) => {
    const si = await confirmar({
      titulo: '¿Restaurar esta versión?',
      mensaje: `La ficha vuelve a como estaba el ${fechaHora(version.guardada)}. Lo de ahora queda guardado como una versión más: se puede volver atrás.`,
      confirmar: 'Restaurar',
    })
    if (!si) return
    iniciar(async () => {
      const respuesta = await restaurarVersionDeEstructura(atlasId, version.id)
      if (respuesta.exito && respuesta.datos) {
        poner(respuesta.datos.ficha, respuesta.datos.versiones)
        setConflicto(null)
        avisar('ok', 'Versión restaurada.')
        alGuardar()
      } else {
        setError(respuesta.mensaje ?? 'No se pudo restaurar la versión.')
      }
    })
  }

  const familia = familiaDeSistema(ficha?.sistema)
  const cuentan = ficha ? camposQueCuentan(ficha.sistema) : []

  return (
    <Modal titulo={ficha?.nombre ?? 'Abriendo la ficha…'} ancho="ancho" error={error} onCerrar={cerrar}>
      {!ficha || !textos ? (
        error ? null : <p className="estructuras-cargando">Cargando…</p>
      ) : (
        <form
          className="estructuras-ventana"
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
        >
          <p className="estructuras-ventana-meta">
            {ficha.original}
            {ficha.lado ? ` · ${ETIQUETA_DEL_LADO[ficha.lado]}` : ''}
            {' · '}
            {sistema}
            {' · '}
            {region}
          </p>

          {ficha.huerfana ? (
            <div className="admin-aviso admin-aviso-atencion" role="status">
              Esta pieza ya no está en el atlas instalado. La ficha se conserva con todo lo escrito.
            </div>
          ) : null}

          {conflicto ? (
            <div className="admin-aviso admin-aviso-atencion estructuras-conflicto" role="alert">
              <strong>Mientras escribía, otra persona cambió esta ficha.</strong> No se guardó nada. Estos campos
              tienen ahora otro texto:
              <ul>
                {conflicto.campos.map((campo) => (
                  <li key={campo}>
                    <strong>{ETIQUETA_DEL_CAMPO[campo]}</strong>
                    <div className="estructuras-conflicto-texto">
                      <span>Ahora en la ficha:</span> {conflicto.actual[campo] || '(vacío)'}
                    </div>
                    <div className="estructuras-conflicto-texto">
                      <span>Su texto:</span> {textos[campo] || '(vacío)'}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={usarLoActual}>
                  Quedarme con lo que hay ahora
                </button>
                <button type="button" className="admin-btn admin-btn-danger" disabled={enCurso} onClick={() => guardar(true)}>
                  Guardar el mío de todos modos
                </button>
              </div>
              <p className="estructuras-conflicto-nota">
                Guardar el suyo no borra lo de la otra persona: queda en «Historial» y se puede restaurar.
              </p>
            </div>
          ) : null}

          {CAMPOS_DE_LA_FICHA.map((campo) => {
            const cuenta = cuentan.includes(campo)
            const falta = cuenta && normalizarTexto(textos[campo]) === ''
            const largo = textos[campo].length
            const maximo = LARGO_MAXIMO_DEL_CAMPO[campo]
            const id = `estructura-${campo}`
            return (
              <div key={campo} className={`admin-form-group estructuras-campo${falta ? ' estructuras-campo-falta' : ''}`}>
                <label className="admin-form-label" htmlFor={id}>
                  {etiquetaDelCampo(campo, familia)}
                  {falta ? <span className="estructuras-marca-falta">Falta</span> : null}
                  {!cuenta ? <span className="estructuras-marca-opcional">no se exige</span> : null}
                </label>
                {DE_UNA_LINEA.includes(campo) ? (
                  <input
                    id={id}
                    className="admin-form-input"
                    value={textos[campo]}
                    maxLength={maximo}
                    onChange={(e) => setTextos({ ...textos, [campo]: e.target.value })}
                  />
                ) : (
                  <textarea
                    id={id}
                    className="admin-form-input"
                    rows={campo === 'definicion' || campo === 'notas' ? 4 : 2}
                    value={textos[campo]}
                    maxLength={maximo}
                    onChange={(e) => setTextos({ ...textos, [campo]: e.target.value })}
                  />
                )}
                {largo > maximo * 0.8 ? (
                  <div className="admin-form-hint">
                    {largo} de {maximo} caracteres
                  </div>
                ) : null}
              </div>
            )
          })}

          <label className="estructuras-oculta">
            <input type="checkbox" checked={oculta} onChange={(e) => setOculta(e.target.checked)} />
            <span>
              <strong>No mostrar.</strong> Esta pieza no abre ficha cuando alguien la pincha y no cuenta como pendiente
              (por ejemplo, un órgano).
            </span>
          </label>

          {versiones.length > 0 ? (
            <details className="estructuras-historial">
              <summary>
                <History aria-hidden size={14} /> Historial ({versiones.length})
              </summary>
              <ul>
                {versiones.map((v) => (
                  <li key={v.id}>
                    <div className="estructuras-historial-cabeza">
                      <span>{fechaHora(v.guardada)}</span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        disabled={enCurso}
                        onClick={() => restaurar(v)}
                      >
                        Restaurar
                      </button>
                    </div>
                    <dl>
                      {CAMPOS_DE_LA_FICHA.filter((c) => v.textos[c]).map((c) => (
                        <div key={c}>
                          <dt>{ETIQUETA_DEL_CAMPO[c]}</dt>
                          <dd>{recortar(v.textos[c] as string)}</dd>
                        </div>
                      ))}
                      {Object.keys(v.textos).length === 0 ? <dd>Sin nada escrito.</dd> : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={cerrar}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso || !sucia}>
              {enCurso ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
