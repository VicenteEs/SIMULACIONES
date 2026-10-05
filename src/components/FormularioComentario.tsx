'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CircleCheck, MessageSquarePlus, Send } from 'lucide-react'
import { crearComentario } from '@/app/(frontend)/acciones/comentarios'

/**
 * El nombre del evento con el que la barra de acciones de la ficha abre este
 * formulario (`BotonComentar`). Un evento y no un estado compartido porque los
 * dos componentes viven lejos en el árbol —uno en la cabecera, el otro al
 * pie— y la página que los monta es de servidor: no hay padre de cliente
 * común donde guardar el «abierto».
 */
export const EVENTO_COMENTAR = 'traumahub:comentar'

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
  textoBoton,
}: {
  coleccion: string
  documentoId: string
  label?: string
  /**
   * Texto corto para el botón de abrir, cuando `label` es largo para una fila
   * de acciones (el pie de cada maniobra). El nombre accesible sigue siendo
   * `label`, que tiene que empezar por estas mismas palabras: quien maneja el
   * equipo por voz dice lo que lee (WCAG 2.5.3).
   */
  textoBoton?: string
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
  const campo = useRef<HTMLTextAreaElement>(null)
  const abiertoPorLaBarra = useRef(false)
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

  // La barra de acciones de la ficha pide abrir el formulario. Se comprueba la
  // ficha porque en el examen físico hay uno por maniobra en la misma página.
  useEffect(() => {
    const alPedirlo = (evento: Event) => {
      const detalle = (evento as CustomEvent<{ coleccion: string; documentoId: string }>).detail
      if (detalle?.coleccion !== coleccion || detalle?.documentoId !== documentoId) return
      abiertoPorLaBarra.current = true
      setAbierto(true)
      // Si ya estaba abierto el efecto de abajo no vuelve a correr: se lleva
      // aquí la vista y el foco.
      campo.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      campo.current?.focus({ preventScroll: true })
    }
    window.addEventListener(EVENTO_COMENTAR, alPedirlo)
    return () => window.removeEventListener(EVENTO_COMENTAR, alPedirlo)
  }, [coleccion, documentoId])

  // Al abrir, el foco va al cuadro de texto. Antes se quedaba en el botón que
  // acababa de desaparecer —es decir, en `<body>`— y el siguiente Tab volvía
  // a empezar por la barra de módulos. Si lo abrió la barra de arriba, además
  // se lleva la vista hasta él: está al final de la ficha.
  useEffect(() => {
    if (!abierto) return
    if (abiertoPorLaBarra.current) {
      abiertoPorLaBarra.current = false
      campo.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    campo.current?.focus({ preventScroll: true })
  }, [abierto])

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
      // Un botón pequeño alineado con el texto, no la píldora centrada de antes
      // con tres rem de aire encima: al final de cada ficha parecía una
      // sección más.
      <div className="comentar">
        <button
          ref={botonAbrir}
          type="button"
          className="boton boton-secundario boton-sm boton-comentar"
          onClick={() => setAbierto(true)}
          aria-label={textoBoton ? label : undefined}
        >
          <MessageSquarePlus size={16} aria-hidden="true" />
          {textoBoton ?? label}
        </button>
      </div>
    )
  }

  return (
    <div className="comentar formulario-comentario" ref={bloque}>
      <h3>Dejar un comentario o sugerencia</h3>
      <p className="descripcion">Los administradores y editores revisarán su aporte para mejorar el contenido.</p>

      {estado === 'exito' ? (
        // En verde: salió bien. Antes iba en el azul de la marca, el mismo de
        // cualquier nota informativa, y no se distinguía de «aquí hay algo».
        <div className="advertencia exito advertencia-compacta" role="status" tabIndex={-1} ref={avisoExito}>
          <CircleCheck size={16} aria-hidden="true" />
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
            ref={campo}
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
            <p className="advertencia error advertencia-compacta" role="alert">
              {motivo}
            </p>
          ) : null}
          <div className="acciones-formulario">
            <button
              type="button"
              className="boton boton-fantasma"
              onClick={() => cerrar()}
              disabled={estado === 'enviando'}
            >
              Cancelar
            </button>
            <button type="submit" className="boton" disabled={estado === 'enviando' || !texto.trim()}>
              <Send size={16} aria-hidden="true" />
              {estado === 'enviando' ? 'Enviando…' : 'Enviar comentario'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
