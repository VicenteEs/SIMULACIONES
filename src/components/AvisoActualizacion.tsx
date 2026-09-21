'use client'

import React from 'react'
import { ruta } from '@/lib/rutas'
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'
import { hayCambiosSinGuardar } from '@/admin/salidaDelEditor'
import {
  decidir,
  SEGUNDOS_ANTES_DE_RECARGAR,
  type MemoriaDelAviso,
  type MensajeDeCambios,
} from '@/lib/avisoDeVersion'

/**
 * Aviso de contenido actualizado y de versión nueva de la plataforma.
 *
 * Escucha el flujo de `/api/cambios` y distingue dos cosas (la decisión está en
 * `src/lib/avisoDeVersion.ts`):
 *
 *  - **Contenido nuevo.** Ofrece recargar y nunca recarga por su cuenta: quien
 *    está leyendo decide cuándo. La página sigue funcionando igual sin hacerlo.
 *  - **Versión nueva de la plataforma** (D-127). Aquí sí se recarga sola,
 *    porque seguir no es inocuo: el JavaScript de la pestaña es de una
 *    construcción que el servidor ya no sirve, y sus acciones fallan con
 *    errores que no mencionan la causa. Pero con cuidado de no llevarse nada:
 *    si hay cambios sin guardar —una ficha, el taller, una difusión— solo se
 *    avisa, y recarga quien los tiene cuando los haya guardado; con la pestaña
 *    a la vista se da una cuenta atrás que se puede aplazar, por quien esté a
 *    media cirugía simulada, que no declara cambios pero sí pierde el hilo; y
 *    con la pestaña oculta se recarga en el acto, que nadie lo ve.
 *
 * No hay riesgo de recargar contra un servidor caído: el mensaje que dispara
 * todo esto lo manda el servidor nuevo, así que ya está contestando.
 */
export function AvisoActualizacion() {
  const [hayNovedad, setHayNovedad] = React.useState(false)
  // Qué se publicó. Viajaba en el flujo desde el principio y no lo miraba
  // nadie: el aviso decía «hay contenido actualizado» y el residente no sabía
  // si le interesaba lo bastante como para perder dónde iba leyendo.
  const [queCambio, setQueCambio] = React.useState<string | null>(null)
  /** `null`: no hay versión nueva. Un número: segundos que faltan. `'espera'`: aplazada o con cambios sin guardar. */
  const [versionNueva, setVersionNueva] = React.useState<number | 'espera' | null>(null)
  const memoria = React.useRef<MemoriaDelAviso | null>(null)

  React.useEffect(() => {
    const fuente = new EventSource(ruta('/api/cambios'))

    fuente.onmessage = (evento) => {
      try {
        const mensaje = JSON.parse(evento.data) as MensajeDeCambios
        const resultado = decidir(memoria.current, mensaje)
        memoria.current = resultado.memoria
        if (resultado.decision.tipo === 'contenido-nuevo') {
          const modulo = resultado.decision.modulo
          setHayNovedad(true)
          setQueCambio(modulo ? (NOMBRE_DE_MODULO[modulo] ?? null) : null)
        } else if (resultado.decision.tipo === 'version-nueva') {
          if (document.hidden && !hayCambiosSinGuardar()) {
            window.location.reload()
            return
          }
          setVersionNueva(hayCambiosSinGuardar() ? 'espera' : SEGUNDOS_ANTES_DE_RECARGAR)
        }
      } catch {
        // Un mensaje ilegible no debe romper la página: se ignora.
      }
    }

    // Si la conexión se corta, el navegador reintenta solo. No se avisa de
    // nada: una caída de red no es contenido nuevo.
    fuente.onerror = () => {}

    return () => fuente.close()
  }, [])

  // La cuenta atrás. En cada segundo se vuelve a preguntar por los cambios sin
  // guardar: treinta segundos dan para empezar a escribir un comentario o abrir
  // una ficha, y lo que no estaba a medias al avisar puede estarlo al recargar.
  React.useEffect(() => {
    if (typeof versionNueva !== 'number') return
    const reloj = setTimeout(() => {
      if (hayCambiosSinGuardar()) setVersionNueva('espera')
      else if (versionNueva <= 1) window.location.reload()
      else setVersionNueva(versionNueva - 1)
    }, 1000)
    return () => clearTimeout(reloj)
  }, [versionNueva])

  if (versionNueva !== null) {
    return (
      <div className="aviso-actualizacion" role="status">
        <span>
          {versionNueva === 'espera'
            ? 'Hay una versión nueva de la plataforma. Guarde lo que tenga a medias y recargue.'
            : `Hay una versión nueva de la plataforma. Se recargará en ${versionNueva} s.`}
        </span>
        <button type="button" onClick={() => window.location.reload()}>
          Recargar ahora
        </button>
        {versionNueva !== 'espera' ? (
          <button type="button" className="aviso-aplazar" onClick={() => setVersionNueva('espera')}>
            Más tarde
          </button>
        ) : null}
      </div>
    )
  }

  if (!hayNovedad) return null

  return (
    <div className="aviso-actualizacion" role="status">
      <span>
        {queCambio ? `Hay contenido nuevo en ${queCambio}.` : 'Hay contenido actualizado.'}
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </div>
  )
}
