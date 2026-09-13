'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { crearComentario } from '@/app/(frontend)/acciones/comentarios'

/**
 * Techo del comentario, el mismo que exige el servidor
 * (`LARGO_MAXIMO_COMENTARIO`, `src/lib/validacion.ts`). Se repite en vez de
 * importarse porque ese módulo arrastra `@/collections` —la configuración
 * entera de Payload, con sus hooks de servidor— y esto es un componente de
 * cliente: el navegador acabaría descargándola para pintar un cuadro de texto.
 * Sin techo aquí, el residente escribe mil palabras y el rechazo llega después
 * de pulsar enviar, cuando ya no hay dónde recuperarlas.
 */
const LARGO_MAXIMO = 4000

/**
 * Qué contarle a quien acaba de perder su comentario.
 *
 * `crearComentario` lanza en vez de devolver una respuesta, y lo que lanza son
 * frases en español —«Debe iniciar sesión para comentar.» y las de
 * `exigirTexto`—, de modo que en desarrollo el motivo real llega hasta aquí. En
 * producción Next tapa el mensaje de cualquier excepción del servidor con uno
 * genérico y le cuelga un `digest`; ese texto no le dice nada a nadie, y por eso
 * el respaldo nombra la causa más probable: el testigo de sesión dura ocho horas
 * (`src/collections/Usuarios.ts`) y la ficha se queda abierta en el pabellón
 * toda la tarde. El «Intente nuevamente» de antes dejaba al residente
 * reintentando lo único que no podía funcionar, hasta que se rendía y su
 * corrección sobre la ficha se perdía.
 */
function motivoDelFallo(error: unknown): string {
  const generico =
    'No se pudo enviar el comentario. Si lleva horas con la ficha abierta es probable que su sesión haya caducado: vuelva a entrar e inténtelo otra vez.'
  if (!(error instanceof Error) || 'digest' in error) return generico
  const mensaje = error.message.trim()
  return mensaje.length > 0 ? mensaje : generico
}

export function FormularioComentario({
  coleccion,
  documentoId,
  label = '¿Encontró un error o tiene una sugerencia? Deje un comentario',
}: {
  coleccion: string
  documentoId: string
  label?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'exito' | 'error'>('idle')
  const [motivo, setMotivo] = useState<string | null>(null)

  // En examen físico este formulario se repite una vez por maniobra dentro de la
  // misma página, así que el identificador del campo no puede salir de la ficha:
  // dos `id` iguales dejan la etiqueta apuntando siempre al primero.
  const idCampo = useId()

  const botonAbrir = useRef<HTMLButtonElement>(null)
  const bloque = useRef<HTMLDivElement>(null)
  const avisoExito = useRef<HTMLDivElement>(null)
  const devolverFoco = useRef(false)

  /**
   * Cierra el bloque y decide si el foco vuelve al botón que ocupa su hueco.
   *
   * Cerrar desmonta lo que tuviera el foco: si no se devuelve, cae en `<body>`
   * y el siguiente tabulador reinicia la página por la barra de módulos, lejos
   * de donde se estaba leyendo. Pero solo si el foco estaba aquí dentro; quien
   * ya se había ido a otra parte no quiere que se lo traigan de vuelta, y por
   * eso el cierre por `focusout` lo dice a mano en vez de mirar
   * `document.activeElement`, que en mitad de ese evento todavía no señala al
   * destino.
   */
  const cerrar = useCallback((devolverElFoco?: boolean) => {
    devolverFoco.current =
      devolverElFoco ?? bloque.current?.contains(document.activeElement) === true
    setAbierto(false)
    setEstado('idle')
    setMotivo(null)
  }, [])

  useEffect(() => {
    if (abierto || !devolverFoco.current) return
    devolverFoco.current = false
    botonAbrir.current?.focus()
  }, [abierto])

  useEffect(() => {
    if (estado !== 'exito') return
    const contenedor = bloque.current

    // `role="status"` anuncia el texto, pero el formulario que tenía el foco
    // acaba de desaparecer con el envío: sin traerlo aquí, quien usa lector de
    // pantalla no oye nada y se queda sin saber si su aporte salió o se perdió.
    avisoExito.current?.focus()

    // El aviso se retira solo a los tres segundos, pero no por debajo de quien
    // lo está leyendo: si el foco sigue dentro —acabamos de traerlo—, cerrar lo
    // dejaría otra vez en `<body>`. En ese caso se espera a que salga por su
    // propio pie.
    let vencido = false
    const alSalirElFoco = (evento: FocusEvent) => {
      if (!vencido) return
      const destino = evento.relatedTarget
      if (destino instanceof Node && contenedor?.contains(destino)) return
      cerrar(false)
    }
    const temporizador = window.setTimeout(() => {
      vencido = true
      if (!contenedor?.contains(document.activeElement)) cerrar(false)
    }, 3000)

    contenedor?.addEventListener('focusout', alSalirElFoco)
    return () => {
      window.clearTimeout(temporizador)
      contenedor?.removeEventListener('focusout', alSalirElFoco)
    }
  }, [estado, cerrar])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEstado('enviando')
    setMotivo(null)
    try {
      await crearComentario(coleccion, documentoId, texto)
      setEstado('exito')
      setTexto('')
    } catch (error) {
      // El texto escrito no se borra: es lo único que tiene el residente para
      // volver a intentarlo o para copiarlo a otro sitio.
      setMotivo(motivoDelFallo(error))
      setEstado('error')
    }
  }

  if (!abierto) {
    return (
      <div className="contenedor-comentario-toggle">
        <button
          ref={botonAbrir}
          className="boton secundario boton-comentar"
          onClick={() => setAbierto(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="formulario-comentario tarjeta" ref={bloque}>
      <h3>Dejar un comentario o sugerencia</h3>
      <p className="descripcion">Los administradores y editores revisarán su aporte para mejorar el contenido.</p>

      {estado === 'exito' ? (
        <div className="alerta exito" role="status" tabIndex={-1} ref={avisoExito}>
          Gracias. Su comentario quedó registrado y será revisado.
        </div>
      ) : (
        <form onSubmit={enviar}>
          {/*
            El campo se nombra con el mismo texto que nombra el botón de abrir, y
            que el llamador ya calcula: en examen físico son N maniobras
            seguidas, y sin esto el lector de pantalla anuncia N veces «entrada de
            texto, en blanco», sin decir sobre cuál se está comentando. El
            marcador de posición no vale de etiqueta: desaparece al escribir la
            primera letra.
          */}
          {/*
            El párrafo es lo que le da su hueco: la hoja pública no estiliza
            ninguna etiqueta —`estilos.css` solo tiene `.consola-capas label`—,
            y una etiqueta suelta es un elemento en línea al que el margen de
            `.descripcion` no le hace nada, de modo que quedaría pegada al
            cuadro de texto.
          */}
          <p className="descripcion">
            <label htmlFor={idCampo}>{label}</label>
          </p>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Describa el error, la sugerencia o la corrección"
            required
            maxLength={LARGO_MAXIMO}
            rows={4}
            disabled={estado === 'enviando'}
          />
          {estado === 'error' && motivo ? (
            // `role="alert"` porque el envío no mueve nada más en la pantalla:
            // sin él, el fallo se pinta y nadie lo lee, y el residente se queda
            // creyendo que su corrección se envió.
            <p className="texto-error" role="alert">
              {motivo}
            </p>
          ) : null}
          <div className="acciones-formulario">
            <button
              type="button"
              className="boton sutil"
              onClick={() => cerrar()}
              disabled={estado === 'enviando'}
            >
              Cancelar
            </button>
            <button type="submit" className="boton principal" disabled={estado === 'enviando' || !texto.trim()}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar comentario'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
