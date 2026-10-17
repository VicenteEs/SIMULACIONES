'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { History } from 'lucide-react'
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
import './ficha.css'

export type TextosDeLaFicha = Record<CampoDeLaFicha, string>

/** Lo que alguien escribió y todavía no guardó: se conserva mientras se mira otra pieza. */
export interface BorradorDeLaFicha {
  textos: TextosDeLaFicha
  oculta: boolean
  /** Cómo estaban los campos al abrir la ficha, para saber qué tocó y detectar lo que otra persona cambió mientras tanto. */
  base: TextosDeLaFicha
  ocultaBase: boolean
}

/** Los campos que se escriben en una línea; el resto, en un cuadro de varias. */
const DE_UNA_LINEA: readonly CampoDeLaFicha[] = ['nombreLatino']

const textosDe = (ficha: FichaCompleta): TextosDeLaFicha =>
  Object.fromEntries(CAMPOS_DE_LA_FICHA.map((campo) => [campo, ficha[campo]])) as TextosDeLaFicha

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const recortar = (texto: string, largo = 110) => (texto.length > largo ? `${texto.slice(0, largo).trimEnd()}…` : texto)

/** ¿Tiene algo sin guardar? Mismo criterio que el servidor: comparar normalizado. */
export function hayCambiosSinGuardar(b: BorradorDeLaFicha): boolean {
  return b.oculta !== b.ocultaBase || CAMPOS_DE_LA_FICHA.some((c) => normalizarTexto(b.textos[c]) !== normalizarTexto(b.base[c]))
}

/**
 * La ficha de una estructura anatómica, para escribirla (D-179, P-003 E8).
 *
 * La usan dos sitios y es la misma ficha: la ventana de `/admin-panel/estructuras`
 * y la pestaña «Info» del taller anatómico. Lo que se escribe en uno aparece en el
 * otro porque los dos hablan con el mismo listado global.
 *
 * Los campos van en el orden de las capturas que trajo Cristóbal. Los que cuentan
 * para dar la ficha por completa —según el sistema de la pieza— y todavía no tienen
 * texto se marcan «Falta», **con el resto a la vista**: quien llena tiene que ver qué
 * se le pide y qué es opcional.
 *
 * Lo que no se hace: guardar a ciegas. Al abrir se anota cómo estaba cada campo
 * (`base`) y al guardar se manda junto a lo escrito; si otra persona escribió un
 * campo que esta tocó, el servidor devuelve el conflicto y aquí se enseñan las dos
 * versiones, sin guardar nada hasta que se elija. Toda ficha guarda sus versiones
 * anteriores, que se ven y se restauran desde «Historial».
 *
 * **Lo que se escribe y no se guarda no se pierde en silencio.** En la pestaña del
 * taller, pinchar otra pieza desmonta este componente; por eso quien lo monta puede
 * pasarle un `borrador` y recibir cada cambio (`alCambiarBorrador`), para devolvérselo
 * al volver a esa pieza.
 */
export function FichaEditable({
  atlasId,
  region,
  sistema,
  borrador,
  alCambiarBorrador,
  alCargar,
  alCambiarSucia,
  alGuardar,
  alTerminar,
  alCancelar,
}: {
  atlasId: string
  /** La región y el sistema ya con su nombre en español: los resuelve quien monta, que tiene el catálogo. */
  region: string
  sistema: string
  /** Lo que había escrito y sin guardar de esta pieza, si se vuelve a ella. */
  borrador?: BorradorDeLaFicha | null
  alCambiarBorrador?: (atlasId: string, borrador: BorradorDeLaFicha | null) => void
  alCargar?: (ficha: FichaCompleta) => void
  /** Se llama cada vez que cambia si hay algo sin guardar: la ventana lo usa para preguntar antes de cerrar. */
  alCambiarSucia?: (sucia: boolean) => void
  /** Tras un guardado o una restauración, para que la lista y el contador se pongan al día. */
  alGuardar?: () => void
  /** Tras guardar, para cerrar la ventana. En la pestaña del taller no se pasa y la ficha se queda abierta. */
  alTerminar?: () => void
  /** Si se pasa, hay un botón «Cancelar». */
  alCancelar?: () => void
}) {
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const [enCurso, iniciar] = useTransition()

  const [ficha, setFicha] = useState<FichaCompleta | null>(null)
  const [versiones, setVersiones] = useState<VersionDeLaFicha[]>([])
  const [textos, setTextos] = useState<TextosDeLaFicha | null>(null)
  /** Cómo estaba cada campo cuando se abrió (o cuando se recogió lo ajeno). */
  const [base, setBase] = useState<TextosDeLaFicha | null>(null)
  const [oculta, setOculta] = useState(false)
  const [ocultaBase, setOcultaBase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicto, setConflicto] = useState<{ campos: CampoDeLaFicha[]; actual: FichaCompleta } | null>(null)

  // Las funciones de quien monta cambian en cada pintado; se leen desde una referencia para que ningún efecto dependa de ellas.
  const enlaces = useRef({ alCambiarBorrador, alCargar, alCambiarSucia })
  useEffect(() => {
    enlaces.current = { alCambiarBorrador, alCargar, alCambiarSucia }
  })

  const poner = (nueva: FichaCompleta, nuevasVersiones?: VersionDeLaFicha[]) => {
    setFicha(nueva)
    setTextos(textosDe(nueva))
    setBase(textosDe(nueva))
    setOculta(nueva.oculta)
    setOcultaBase(nueva.oculta)
    if (nuevasVersiones) setVersiones(nuevasVersiones)
    enlaces.current.alCargar?.(nueva)
  }

  useEffect(() => {
    let vigente = true
    leerEstructura(atlasId).then((respuesta) => {
      if (!vigente) return
      if (!(respuesta.exito && respuesta.datos)) {
        setError(respuesta.mensaje ?? 'No se pudo abrir la ficha.')
        return
      }
      const { ficha: leida, versiones: anteriores } = respuesta.datos
      poner(leida, anteriores)
      // Un borrador de antes manda sobre lo recién leído para los campos que esa persona había tocado; la base sigue
      // siendo la de ahora, así que si otra persona escribió algo mientras tanto, el servidor lo detecta al guardar.
      if (borrador) {
        setTextos(borrador.textos)
        setOculta(borrador.oculta)
        setBase(borrador.base)
        setOcultaBase(borrador.ocultaBase)
      }
    })
    return () => {
      vigente = false
    }
    // `borrador` solo se lee al abrir la pieza: si cambiara con cada tecla, se releería la ficha en cada una.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasId])

  const sucia = useMemo(
    () => (textos && base ? hayCambiosSinGuardar({ textos, base, oculta, ocultaBase }) : false),
    [textos, base, oculta, ocultaBase],
  )

  useEffect(() => {
    enlaces.current.alCambiarSucia?.(sucia)
    if (!textos || !base) return
    enlaces.current.alCambiarBorrador?.(atlasId, sucia ? { textos, base, oculta, ocultaBase } : null)
  }, [sucia, textos, base, oculta, ocultaBase, atlasId])

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
      // Lo guardado deja de ser un borrador; la ficha de ahora es la base de lo que se escriba después.
      poner(respuesta.datos.ficha)
      alGuardar?.()
      if (alTerminar) {
        alTerminar()
        return
      }
      // Sigue abierta (la pestaña del taller): el historial gana la versión que acaba de quedar.
      const leida = await leerEstructura(atlasId)
      if (leida.exito && leida.datos) setVersiones(leida.datos.versiones)
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
        alGuardar?.()
      } else {
        setError(respuesta.mensaje ?? 'No se pudo restaurar la versión.')
      }
    })
  }

  const familia = familiaDeSistema(ficha?.sistema)
  const cuentan = ficha ? camposQueCuentan(ficha.sistema) : []
  // El prefijo de los `id` evita que dos fichas en la misma página (ventana y pestaña) compartan `htmlFor`.
  const prefijo = `ficha-${atlasId}`

  if (!ficha || !textos) {
    return error ? (
      <div className="admin-aviso admin-aviso-error" role="status">
        {error}
      </div>
    ) : (
      <p className="estructuras-cargando">Cargando…</p>
    )
  }

  return (
    <form
      className="estructuras-ventana"
      onSubmit={(e) => {
        e.preventDefault()
        guardar()
      }}
    >
      {error ? (
        <div className="admin-aviso admin-aviso-error" role="status">
          {error}
        </div>
      ) : null}
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
          <strong>Mientras escribía, otra persona cambió esta ficha.</strong> No se guardó nada. Estos campos tienen ahora otro
          texto:
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
        const id = `${prefijo}-${campo}`
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
          <strong>No mostrar.</strong> Esta pieza no abre ficha cuando alguien la pincha y no cuenta como pendiente (por
          ejemplo, un órgano).
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
                  <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={() => restaurar(v)}>
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
        {alCancelar ? (
          <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso} onClick={alCancelar}>
            Cancelar
          </button>
        ) : null}
        <button type="submit" className="admin-btn admin-btn-primary" disabled={enCurso || !sucia}>
          {enCurso ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
