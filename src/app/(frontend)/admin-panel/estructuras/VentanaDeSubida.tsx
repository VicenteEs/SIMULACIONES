'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { ruta } from '@/lib/rutas'
import type { ResultadoDeAplicar } from '@/lib/subirPlanillaDeEstructuras'
import type { VistaDelPlan } from '@/lib/planillaDeEstructuras'
import { respaldarAhora } from '@/app/(frontend)/acciones/respaldos'

type Opciones = { reemplazar: boolean; ladoOpuesto: boolean }

const entero = (n: number) => n.toLocaleString('es-CL')

/** Lo mínimo que se lee de la respuesta de la ruta, que tiene la forma de las acciones del panel. */
interface RespuestaDeLaRuta<T> {
  exito: boolean
  mensaje?: string
  datos?: T
}

/**
 * La ventana para subir una planilla llena (D-179, P-003 E8.5).
 *
 * **Nada se escribe hasta «Aplicar»**, y «Aplicar» solo escribe lo que esta ventana
 * enseñó: primero se pide la vista previa (que lee la planilla y las fichas y no
 * escribe), se muestra campo a campo, y recién entonces se habilita el botón, que
 * manda el mismo archivo con la huella de lo que se vio. Si alguien tocó esas fichas
 * en el medio, el servidor no escribe y lo dice.
 *
 * Cambiar una opción borra la vista previa: lo que se vio era con otras opciones.
 *
 * Los dos permisos que cambian el resultado son casillas apagadas por omisión.
 * «Reemplazar lo ya escrito» porque es lo único que puede pisar algo, y se avisa con
 * el antes y el después de cada campo. «Aplicar también al lado opuesto» porque es
 * una decisión de quien llena —no siempre «Right X» y «Left X» dicen lo mismo—.
 */
export function VentanaDeSubida({
  regionId,
  region,
  nombresDeRegion,
  puedeRespaldar,
  alCerrar,
  alAplicar,
}: {
  /** El id de la región desde la que se abrió, o `todas`. */
  regionId: string
  region: string
  /** Los nombres de las regiones por id, para decir de cuáles trae piezas la planilla. */
  nombresDeRegion: Record<string, string>
  puedeRespaldar: boolean
  alCerrar: () => void
  alAplicar: () => void
}) {
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const entrada = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [opciones, setOpciones] = useState<Opciones>({ reemplazar: false, ladoOpuesto: false })
  const [vista, setVista] = useState<VistaDelPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState<'vista' | 'aplicar' | 'respaldo' | null>(null)
  const [respaldado, setRespaldado] = useState(false)

  const cambiarOpciones = (nuevas: Opciones) => {
    setOpciones(nuevas)
    // Lo que se vio era con otras opciones: hay que volver a verlo.
    setVista(null)
    setError(null)
  }

  const enviar = async <T,>(accion: 'vista' | 'aplicar', huella?: string): Promise<RespuestaDeLaRuta<T>> => {
    const formulario = new FormData()
    formulario.set('archivo', archivo as File)
    formulario.set('accion', accion)
    formulario.set('reemplazar', opciones.reemplazar ? '1' : '0')
    formulario.set('ladoOpuesto', opciones.ladoOpuesto ? '1' : '0')
    if (huella) formulario.set('huella', huella)
    try {
      const respuesta = await fetch(ruta('/api/estructuras/planilla'), { method: 'POST', body: formulario })
      return (await respuesta.json()) as RespuestaDeLaRuta<T>
    } catch {
      return { exito: false, mensaje: 'No se pudo hablar con el servidor. Compruebe la conexión y vuelva a intentarlo.' }
    }
  }

  const verQueHaria = async () => {
    if (!archivo) return
    setError(null)
    setVista(null)
    setEnCurso('vista')
    const respuesta = await enviar<{ vista: VistaDelPlan }>('vista')
    setEnCurso(null)
    if (respuesta.exito && respuesta.datos) setVista(respuesta.datos.vista)
    else setError(respuesta.mensaje ?? 'No se pudo leer la planilla.')
  }

  const aplicar = async () => {
    if (!vista || !archivo) return
    const { fichasAEscribir, camposAEscribir, cambian } = vista.conteo
    const reemplaza = opciones.reemplazar && vista.cambian.some((f) => f.cambios.some((c) => c.tipo === 'reemplaza' && c.aplicado))
    const si = await confirmar({
      titulo: `¿Escribir ${entero(camposAEscribir)} campos en ${entero(fichasAEscribir)} fichas?`,
      mensaje: reemplaza
        ? `Se reemplazará texto que ya estaba escrito (hasta ${entero(cambian)} fichas). Lo de antes queda en el historial de cada ficha.`
        : 'No se reemplaza nada de lo ya escrito: solo se llenan campos vacíos. Cada ficha guarda su versión anterior.',
      confirmar: 'Escribir',
      peligro: reemplaza,
    })
    if (!si) return
    setError(null)
    setEnCurso('aplicar')
    const respuesta = await enviar<{ resultado: ResultadoDeAplicar }>('aplicar', vista.huella)
    setEnCurso(null)
    if (respuesta.exito && respuesta.datos) {
      const { fichas, campos } = respuesta.datos.resultado
      avisar('ok', `Listo: ${entero(campos)} campos escritos en ${entero(fichas)} fichas.`)
      alAplicar()
      alCerrar()
    } else {
      // Un 409 es «cambió desde la vista previa»: se vuelve a pedir la vista, no se sigue con la vieja.
      setVista(null)
      setError(respuesta.mensaje ?? 'No se pudo escribir la planilla.')
    }
  }

  const respaldar = async () => {
    setEnCurso('respaldo')
    const respuesta = await respaldarAhora()
    setEnCurso(null)
    if (respuesta.exito) {
      setRespaldado(true)
      avisar('ok', 'Respaldo hecho.')
    } else setError(respuesta.mensaje ?? 'No se pudo hacer el respaldo.')
  }

  const algoQueEscribir = vista !== null && vista.conteo.fichasAEscribir > 0

  return (
    <Modal titulo={`Subir planilla · ${region}`} ancho="ancho" error={error} onCerrar={alCerrar}>
      <div className="estructuras-subida">
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor="planilla-archivo">
            Planilla llena (.xlsx)
          </label>
          <input
            id="planilla-archivo"
            ref={entrada}
            type="file"
            className="admin-form-input"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null)
              setVista(null)
              setError(null)
            }}
          />
          <div className="admin-form-hint">
            La que se descarga de esta pantalla, llena. Se identifica cada fila por su «Id del atlas»: puede traer piezas de
            otras regiones.
          </div>
        </div>

        <fieldset className="estructuras-opciones">
          <legend>Opciones</legend>
          <label>
            <input
              type="checkbox"
              checked={opciones.ladoOpuesto}
              onChange={(e) => cambiarOpciones({ ...opciones, ladoOpuesto: e.target.checked })}
            />
            <span>
              <strong>Aplicar también al lado opuesto.</strong> Lo de cada pieza «derecha» se copia a su pareja «izquierda», y al
              revés. Solo llena huecos: nunca pisa lo que la otra ficha ya tenga, ni lo que la propia planilla diga de ella.
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={opciones.reemplazar}
              onChange={(e) => cambiarOpciones({ ...opciones, reemplazar: e.target.checked })}
            />
            <span>
              <strong>Reemplazar también lo ya escrito.</strong> Apagada, una ficha que ya tiene texto en un campo lo conserva, y
              la vista previa enseña qué traía la planilla. Prendida, se reemplaza (lo de antes queda en el historial).
            </span>
          </label>
        </fieldset>

        <div className="estructuras-respaldo">
          {puedeRespaldar ? (
            <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso !== null} onClick={respaldar}>
              {respaldado ? 'Respaldo hecho' : enCurso === 'respaldo' ? 'Respaldando…' : 'Respaldar ahora'}
            </button>
          ) : null}
          <span className="admin-form-hint">
            {puedeRespaldar
              ? 'Conviene antes de una subida grande. Cada ficha guarda además sus versiones anteriores.'
              : 'Cada ficha guarda sus versiones anteriores. Para una subida muy grande, pida a un administrador que respalde antes.'}
          </span>
        </div>

        {vista ? <VistaPrevia vista={vista} opciones={opciones} regionId={regionId} nombresDeRegion={nombresDeRegion} /> : null}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" disabled={enCurso === 'aplicar'} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={!archivo || enCurso !== null} onClick={verQueHaria}>
            {enCurso === 'vista' ? 'Leyendo…' : vista ? 'Ver de nuevo' : 'Ver qué haría'}
          </button>
          <button type="button" className="admin-btn admin-btn-primary" disabled={!algoQueEscribir || enCurso !== null} onClick={aplicar}>
            {enCurso === 'aplicar'
              ? 'Escribiendo…'
              : algoQueEscribir
                ? `Aplicar (${entero(vista.conteo.fichasAEscribir)} fichas)`
                : 'Aplicar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function VistaPrevia({
  vista,
  opciones,
  regionId,
  nombresDeRegion,
}: {
  vista: VistaDelPlan
  opciones: Opciones
  regionId: string
  nombresDeRegion: Record<string, string>
}) {
  const { conteo } = vista
  const deOtraRegion = regionId !== 'todas' && vista.regiones.some((r) => r.region !== regionId)
  return (
    <section className="estructuras-vista" aria-label="Vista previa de la planilla">
      <h3>Esto es lo que haría. Todavía no se escribió nada.</h3>
      <div className="estructuras-vista-cifras">
        <Cifra valor={conteo.llenas} etiqueta="se llenan por primera vez" tono="ok" />
        <Cifra valor={conteo.completan} etiqueta="se completan" tono="ok" />
        <Cifra valor={conteo.cambian} etiqueta="traen un texto distinto del escrito" tono={conteo.cambian ? 'atencion' : undefined} />
        <Cifra valor={conteo.iguales} etiqueta="quedan igual" />
      </div>
      <p className="estructuras-vista-resumen">
        Se escribirían <strong>{entero(conteo.camposAEscribir)} campos en {entero(conteo.fichasAEscribir)} fichas</strong>
        {opciones.ladoOpuesto ? ` (${entero(conteo.delLadoOpuesto)} de ellas, por el lado opuesto)` : ''}. La planilla trae{' '}
        {entero(conteo.filasLeidas)} piezas.
        {conteo.cambian > 0 && !opciones.reemplazar
          ? ' Los textos distintos de los ya escritos NO se reemplazan: marque «Reemplazar» si es lo que quiere.'
          : ''}
      </p>

      {deOtraRegion ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          La planilla trae piezas de {vista.regiones.length > 1 ? 'varias regiones' : 'otra región'} (
          {vista.regiones.map((r) => `${nombresDeRegion[r.region] ?? r.region}: ${entero(r.piezas)}`).join(', ')}). Se aplican igual, porque cada fila se
          identifica por su id.
        </div>
      ) : null}

      {vista.problemas.length > 0 ? (
        <details className="estructuras-vista-bloque" open>
          <summary>
            Filas con problemas ({entero(vista.problemas.length + vista.recortado.problemas)}): no se aplicaron
          </summary>
          <ul>
            {vista.problemas.map((p, i) => (
              <li key={i}>
                {p.fila ? <strong>Fila {p.fila}: </strong> : null}
                {p.mensaje}
              </li>
            ))}
          </ul>
          {vista.recortado.problemas > 0 ? <p>… y {entero(vista.recortado.problemas)} más.</p> : null}
        </details>
      ) : null}

      {vista.noEncontradas.length > 0 ? (
        <details className="estructuras-vista-bloque" open>
          <summary>
            Filas con un id que no existe en el atlas ({entero(vista.noEncontradas.length + vista.recortado.noEncontradas)})
          </summary>
          <ul>
            {vista.noEncontradas.map((f) => (
              <li key={`${f.fila}-${f.id}`}>
                Fila {f.fila}: <code>{f.id}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {vista.cambian.length > 0 ? (
        <details className="estructuras-vista-bloque" open>
          <summary>
            Fichas con un texto distinto del ya escrito ({entero(conteo.cambian)})
          </summary>
          <ul className="estructuras-vista-cambios">
            {vista.cambian.map((f) => (
              <li key={f.atlasId}>
                <strong>{f.nombre}</strong> <span className="estructuras-vista-fila">fila {f.fila}</span>
                {f.cambios.map((c) => (
                  <div key={c.campo} className="estructuras-vista-cambio">
                    <div>
                      <span className={`insignia insignia-${c.tipo === 'nuevo' ? 'ok' : c.aplicado ? 'atencion' : 'neutra'}`}>
                        {c.tipo === 'nuevo' ? 'se llena' : c.aplicado ? 'se reemplaza' : 'no se toca'}
                      </span>{' '}
                      <strong>{c.campo}</strong>
                    </div>
                    {c.tipo === 'reemplaza' ? (
                      <>
                        <div className="estructuras-vista-antes">Antes: {c.antes}</div>
                        <div className="estructuras-vista-despues">Planilla: {c.despues}</div>
                      </>
                    ) : (
                      <div className="estructuras-vista-despues">{c.despues}</div>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          {vista.recortado.cambian > 0 ? <p>… y {entero(vista.recortado.cambian)} fichas más con cambios.</p> : null}
        </details>
      ) : null}

      {vista.llenan.length > 0 ? (
        <details className="estructuras-vista-bloque">
          <summary>
            Fichas que se llenan o se completan ({entero(conteo.llenas + conteo.completan)})
          </summary>
          <ul className="estructuras-vista-lista">
            {vista.llenan.map((f) => (
              <li key={`${f.atlasId}-${f.delLadoOpuesto}`}>
                {f.nombre}
                {f.delLadoOpuesto ? <span className="estructuras-vista-fila"> · por el lado opuesto</span> : null}
                <span className="estructuras-vista-fila"> — {f.campos.join(', ')}</span>
              </li>
            ))}
          </ul>
          {vista.recortado.llenan > 0 ? <p>… y {entero(vista.recortado.llenan)} más.</p> : null}
        </details>
      ) : null}

      {opciones.ladoOpuesto && (vista.sinPareja.length > 0 || vista.conFilaPropia > 0) ? (
        <details className="estructuras-vista-bloque">
          <summary>
            Lado opuesto: {entero(vista.sinPareja.length + vista.recortado.sinPareja)} piezas sin pareja
            {vista.conFilaPropia > 0 ? `, ${entero(vista.conFilaPropia)} pares con sus dos filas` : ''}
          </summary>
          {vista.sinPareja.length > 0 ? (
            <>
              <p>
                Estas piezas no tienen una pareja del otro lado que se pueda deducir con seguridad (el atlas las nombra sin
                lado, o son de la línea media). No se copiaron: llénelas en la planilla del otro lado.
              </p>
              <ul className="estructuras-vista-lista">
                {vista.sinPareja.map((n, i) => (
                  <li key={`${n}-${i}`}>{n}</li>
                ))}
              </ul>
            </>
          ) : null}
          {vista.conFilaPropia > 0 ? (
            <p>En los pares con sus dos filas se usó lo que dice cada una, sin copiar de un lado al otro.</p>
          ) : null}
        </details>
      ) : null}

      {vista.ignoradas.length > 0 ? (
        <p className="admin-form-hint">Columnas que se ignoraron: {vista.ignoradas.join(', ')}.</p>
      ) : null}
    </section>
  )
}

function Cifra({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono?: 'ok' | 'atencion' }) {
  return (
    <div className={`estructuras-cifra${tono ? ` estructuras-cifra-${tono}` : ''}`}>
      <div className="estructuras-cifra-valor">{entero(valor)}</div>
      <div className="estructuras-cifra-etiqueta">{etiqueta}</div>
    </div>
  )
}
