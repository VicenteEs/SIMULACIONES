'use client'

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  detenerDifusion,
  enviarPruebaDeDifusion,
  iniciarDifusion,
  reanudarDifusion,
  retirarAviso,
} from '@/app/(frontend)/acciones/difusion'
import { apuntarCambiosSinGuardar } from '@/admin/salidaDelEditor'
import { mensajeDeDifusion } from '@/correo/mensajes'
import { armarCorreo, esEnlaceSeguro } from '@/correo/plantilla'
import { DIAS_DEL_AVISO, type LugaresDeDifusion } from '@/lib/destinoDeDifusion'
import { ruta } from '@/lib/rutas'
import { Ban, BellOff, Check, History, Loader, Pause, Play, Send, TriangleAlert, X, Mail } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia, type Tono } from '@/lib/tonosDeEstado'
import './difusion.css'

/** Un grupo de roles del formulario: «Todas las cuentas activas», «Solo lectores»… */
export interface AudienciaDelFormulario {
  valor: string
  etiqueta: string
}

/** TraumaHub o una institución, con el nombre que lleva en la lista (`destinoDeDifusion.ts`). */
export interface LugarDeDifusion {
  valor: string
  etiqueta: string
}

/**
 * Cuántas cuentas activas hay de un rol en un lugar, y la primera de su cola.
 * Con estas filas el formulario cuenta cualquier combinación sin preguntar al
 * servidor (D-406).
 */
export interface ConteoDeDestinatarios {
  lugar: string
  rol: string
  cuantos: number
  primera: { id: number; nombre: string; email: string }
}

export interface DifusionDelHistorial {
  id: string
  asunto: string
  audiencia: string
  /** Los nombres de los lugares a los que fue; `null`, todos. */
  lugares: string[] | null
  porCorreo: boolean
  /**
   * El aviso, si lo tuvo. `vigente` lo decide el servidor al pintar la tabla.
   * `leidos` es `null` si no se pudieron contar, y `porElBoton` también si el
   * aviso no tenía botón.
   */
  aviso: { hasta: string; vigente: boolean; leidos: number | null; porElBoton: number | null } | null
  autor: string | null
  creada: string
  terminada: string | null
  estado: 'enviando' | 'enviada' | 'con-fallos' | 'detenida'
  /** Si hay un trabajador de este proceso mandándola ahora mismo. */
  enCurso: boolean
  total: number
  enviados: number
  fallidos: number
  pendientes: number
  fallos: Array<{ correo: string; motivo: string }>
}

// Con la zona puesta (D-236): el historial se pinta en el servidor y se
// hidrata en el navegador, y sin ella cada uno escribía la hora en la suya. Una
// difusión de las once de la noche salía con dos días distintos y React tiraba
// la tabla entera por el desajuste.
const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  })

/**
 * Qué parte de los destinatarios aceptó el servidor de correo, en entero.
 *
 * `null` sin destinatarios: un «100 %» de cero personas no dice nada. Se
 * redondea hacia abajo para que una difusión con un solo fallo entre mil no
 * diga «100 %» al lado de su fallo.
 */
export function porcentajeEnviado(d: Pick<DifusionDelHistorial, 'enviados' | 'total'>): number | null {
  if (!(d.total > 0)) return null
  return Math.floor((Math.min(d.enviados, d.total) / d.total) * 100)
}

const personas = (n: number) => (n === 1 ? '1 persona' : `${n} personas`)

/**
 * Cuánto tarda en salir una difusión a este ritmo, dicho como lo diría alguien.
 *
 * El primer correo sale enseguida y cada uno de los demás espera su pausa. Se
 * dice «alrededor de» porque el servidor de correo añade lo suyo a cada envío,
 * y un «tardará 42 minutos» exacto se lee como una promesa.
 */
export function duracionAproximada(cuantos: number, pausaMs: number): string {
  const minutos = Math.ceil((Math.max(0, cuantos - 1) * pausaMs) / 60_000)
  if (minutos < 1) return 'menos de un minuto'
  if (minutos === 1) return 'alrededor de un minuto'
  if (minutos < 60) return `alrededor de ${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  const minutosSobrantes = resto === 0 ? '' : resto === 1 ? ' y un minuto' : ` y ${resto} minutos`
  return `alrededor de ${horas === 1 ? 'una hora' : `${horas} horas`}${minutosSobrantes}`
}

/**
 * ¿Hay una difusión saliendo ahora? La misma regla que `difusionEnCurso` en la
 * acción: estado `enviando` **y** un trabajador detrás.
 *
 * Mirar solo el trabajador dejaba bloqueada la pantalla después de «Detener»:
 * el trabajador sigue apuntado mientras duerme la pausa —dieciocho segundos por
 * omisión, una hora con un ritmo de uno— y hasta despertar no ve el estado
 * nuevo. La fila decía «Detenida» y el formulario, que había una enviándose.
 */
export const hayAlgunaEnviandose = (historial: Pick<DifusionDelHistorial, 'estado' | 'enCurso'>[]): boolean =>
  historial.some((d) => d.estado === 'enviando' && d.enCurso)

/**
 * Qué botones se ofrecen. Va aparte y sin estado de React para poder probarlo:
 * la pantalla se pinta en el servidor con el formulario vacío, y ahí los
 * botones salen desactivados por falta de texto, sea cual sea el correo.
 */
export function botonesDisponibles(e: {
  hayCorreo: boolean
  /** Lo que falla en el texto: impide la prueba y el envío. */
  problema: string | null
  /** Lo que falla en a quién va o por dónde: impide el envío, no la prueba, que va a quien la pide. */
  problemaDelDestino?: string | null
  ocupado: boolean
  cuantos: number
  algunaEnCurso: boolean
  /** Sin correo no hay cola ni cuota, y el aviso sale aunque otra difusión se esté enviando. */
  porCorreo?: boolean
}): { probar: boolean; enviar: boolean } {
  const probar = e.hayCorreo && !e.problema && !e.ocupado
  const listo = !e.problema && !e.problemaDelDestino && !e.ocupado && e.cuantos > 0
  const enviar = e.porCorreo === false ? listo : listo && e.hayCorreo && !e.algunaEnCurso
  return { probar, enviar }
}

/**
 * Cuántas cuentas reciben la difusión con este rol y estos lugares, y cuál es
 * la primera de la cola, la del saludo de la vista previa.
 *
 * La misma regla que `difusionLlegaA` y `condicionDeDestinatarios`, sobre las
 * filas que trae la página. La primera es la de identificador más bajo, como
 * en `destinatariosDe`, que arma la cola por identificador.
 */
export function destinatariosElegidos(
  conteos: ConteoDeDestinatarios[],
  audiencia: string,
  lugares: LugaresDeDifusion,
): { cuantos: number; primera: { nombre: string; email: string } | null } {
  let cuantos = 0
  let primera: ConteoDeDestinatarios['primera'] | null = null
  for (const c of conteos) {
    if (audiencia !== 'todas' && c.rol !== audiencia) continue
    if (lugares !== null && !lugares.includes(c.lugar)) continue
    cuantos += c.cuantos
    if (!primera || c.primera.id < primera.id) primera = c.primera
  }
  return { cuantos, primera: primera ? { nombre: primera.nombre, email: primera.email } : null }
}

const fecha = (valor: string) =>
  new Date(valor).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' })

/**
 * Qué decir cuando la acción de servidor no llega a contestar.
 *
 * Cuarta copia literal, tras `FormularioDocumento.tsx`, `TablaDocumentos.tsx` y
 * `PanelDeRespaldos.tsx`, y por el mismo motivo que da la tercera: importarla
 * de cualquiera de ellas arrastra una pantalla ajena, y el gancho común de
 * acciones del panel sigue sin existir. Aquí importa sobre todo en «Enviar»: sin
 * ella, una red cortada a mitad deja los botones desbloqueados y ningún aviso,
 * y lo natural es volver a pulsar sin saber si la primera salió.
 */
const motivoDeLaCaida = (fallo: unknown, porOmision: string): string =>
  fallo instanceof Error && fallo.message
    ? `${porOmision} ${fallo.message}`
    : `${porOmision} Compruebe la conexión e inténtelo otra vez.`

/**
 * La etiqueta de estado de una fila del historial.
 *
 * «Interrumpida» no es un estado guardado: es una difusión que dice `enviando`
 * sin que nadie la esté mandando: el servicio se reinició a mitad, o el
 * trabajador se cortó por un error que quedó en el registro. No
 * sigue sola a propósito (ver `lanzarDifusion`), y si se pintara «Enviando» el
 * administrador esperaría un avance que no va a llegar.
 */
function etiquetaDeEstado(d: DifusionDelHistorial): { texto: string; tono: Tono; icono: LucideIcon } {
  // El tono es el de la insignia semántica (`src/lib/tonosDeEstado.ts`), y el
  // icono acompaña a la palabra para que el estado no se diga solo con color.
  // «Con fallos» tenía una clase propia (`.difusion-etiqueta-fallos`) que era,
  // letra por letra, el tono de peligro.
  // Solo como aviso no hay envío que siga ni que falle: se guarda «enviada»
  // al publicarse, y si se ve todavía lo dice la columna del aviso.
  if (!d.porCorreo) return { texto: 'Publicada', tono: 'ok', icono: Check }
  switch (d.estado) {
    case 'enviando':
      return d.enCurso
        ? { texto: 'Enviando', tono: 'info', icono: Loader }
        : { texto: 'Interrumpida', tono: 'atencion', icono: Pause }
    case 'enviada':
      return { texto: 'Enviada', tono: 'ok', icono: Check }
    case 'con-fallos':
      return { texto: 'Con fallos', tono: 'peligro', icono: TriangleAlert }
    case 'detenida':
      return { texto: 'Detenida', tono: 'neutra', icono: Ban }
  }
}

export function PanelDeDifusion({
  audiencias,
  lugares,
  conteos,
  historial,
  hayCorreo,
  pausaMs,
  correosPorHora,
  direccionPlataforma,
}: {
  audiencias: AudienciaDelFormulario[]
  lugares: LugarDeDifusion[]
  conteos: ConteoDeDestinatarios[]
  historial: DifusionDelHistorial[]
  hayCorreo: boolean
  pausaMs: number
  correosPorHora: number
  direccionPlataforma: string
}) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [aviso, setAvisoEnPagina] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  /**
   * El resultado sale como aviso flotante, que se ve aunque se haya bajado al
   * historial; el de error, además, se queda en la página, porque trae el
   * motivo —la configuración del correo, el límite de pruebas— y hay que poder
   * releerlo cuando el flotante ya se fue. El bueno de «Enviando…» también se
   * queda: dice que el envío sigue aunque se salga, que es lo que se necesita
   * saber durante la próxima hora.
   */
  const setAviso = (a: { tipo: 'ok' | 'error'; texto: string } | null) => {
    setAvisoEnPagina(a && (a.tipo === 'error' || a.texto.startsWith('Enviando')) ? a : null)
    if (a) avisar(a.tipo, a.texto)
  }

  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [botonTexto, setBotonTexto] = useState('')
  const [botonEnlace, setBotonEnlace] = useState('')
  const [audiencia, setAudiencia] = useState(audiencias[0]?.valor ?? 'todas')
  // Los lugares: todos, que incluye las instituciones que se creen mientras el
  // aviso esté a la vista, o los que se marquen. Al pasar a elegir salen todos
  // marcados, para quitar los que sobran y no tener que marcar uno a uno.
  const [eligiendoLugares, setEligiendoLugares] = useState(false)
  const [lugaresMarcados, setLugaresMarcados] = useState<string[]>(() => lugares.map((l) => l.valor))
  // Por correo, como venía siendo, salvo que no haya servidor de correo: ahí
  // solo puede salir como aviso, y se deja marcado lo que sí se puede.
  const [porCorreo, setPorCorreo] = useState(hayCorreo)
  const [comoAviso, setComoAviso] = useState(!hayCorreo)
  const [diasDelAviso, setDiasDelAviso] = useState(String(DIAS_DEL_AVISO.porOmision))
  const [confirmando, setConfirmando] = useState(false)
  // Qué se está esperando, para rotular el botón que lo pidió y no todos: con
  // un «Enviando…» en la prueba mientras se detiene otra difusión, parecería
  // que salió un correo que nadie mandó.
  const [probando, setProbando] = useState(false)

  const idAyudaMensaje = useId()
  const idConfirmacion = useId()
  const botonConfirmar = useRef<HTMLButtonElement>(null)

  // Con una sola entrada, TraumaHub, no hay nada que elegir: la difusión va a
  // todos los lugares, que es el único, y el apartado no se pinta.
  const hayInstituciones = lugares.length > 1
  const lugaresDeLaDifusion: LugaresDeDifusion = hayInstituciones && eligiendoLugares ? lugaresMarcados : null
  const etiquetaDeAudiencia = audiencias.find((a) => a.valor === audiencia)?.etiqueta ?? audiencia
  const nombresDeLugares =
    lugaresDeLaDifusion === null
      ? null
      : lugares.filter((l) => lugaresDeLaDifusion.includes(l.valor)).map((l) => l.etiqueta)
  // El saludo de la vista previa es el que recibirá la primera persona de la
  // cola, con su nombre tal cual —vacío incluido, que sale «Hola.»—. Sin nadie
  // en el grupo no hay a quién mostrárselo, y queda el «Nombre» de muestra.
  // La vista previa vuelve a buscarla dentro de su memoria, a partir de
  // `conteos` y lo elegido: con el valor sacado aquí fuera, el compilador de
  // React no podía asegurar que nadie lo cambiara entre medias y renunciaba a
  // optimizar el componente entero.
  const { cuantos, primera } = destinatariosElegidos(conteos, audiencia, lugaresDeLaDifusion)
  const aQuienLeLlega = primera ? primera.nombre || primera.email : null
  const algunaEnCurso = hayAlgunaEnviandose(historial)
  const dias = Number(diasDelAviso)

  const sucio = [asunto, mensaje, botonTexto, botonEnlace].some((t) => t.trim() !== '')

  // Lo que impide enviar, en el orden en que conviene arreglarlo. El servidor
  // vuelve a comprobarlo todo; esto es para no dejar pulsar un botón que va a
  // contestar con un error.
  const tieneTexto = botonTexto.trim() !== ''
  const tieneEnlace = botonEnlace.trim() !== ''
  const enlaceInseguro = tieneEnlace && !esEnlaceSeguro(botonEnlace)
  const problema = !asunto.trim() || !mensaje.trim()
    ? 'Escriba el asunto y el mensaje.'
    : tieneTexto !== tieneEnlace
      ? 'El botón necesita el texto y el enlace, o ninguno de los dos.'
      : enlaceInseguro
        ? 'El enlace del botón tiene que ser una dirección completa, que empiece por http:// o https://.'
        : null
  // Lo del destino va aparte: no impide la prueba, que llega a quien la pide.
  const problemaDelDestino =
    lugaresDeLaDifusion !== null && lugaresDeLaDifusion.length === 0
      ? 'Elija al menos un lugar.'
      : !porCorreo && !comoAviso
        ? 'Elija cómo sale: por correo, como aviso en la plataforma o las dos.'
        : porCorreo && !hayCorreo
          ? 'Sin servidor de correo solo puede salir como aviso en la plataforma.'
          : comoAviso && !(Number.isInteger(dias) && dias >= 1 && dias <= DIAS_DEL_AVISO.maximo)
            ? `El aviso se ve de 1 a ${DIAS_DEL_AVISO.maximo} días.`
            : null

  const { probar: puedeProbar, enviar: puedeEnviar } = botonesDisponibles({
    hayCorreo,
    problema,
    problemaDelDestino,
    ocupado,
    cuantos,
    algunaEnCurso,
    porCorreo,
  })

  /**
   * La vista previa se arma con las mismas dos funciones con las que sale el
   * correo (`mensajeDeDifusion` y `armarCorreo`), no con un parecido. Lo único
   * distinto es el logotipo: en el correo va adjunto (`cid:`) y aquí se pide a
   * la plataforma, que el marco sí puede cargar.
   *
   * Va en un `<iframe sandbox="">` y no pintada en la página por dos motivos: el
   * HTML de un correo trae su `<body>` y sus estilos, que dentro del panel
   * chocarían con `admin.css`; y el sandbox vacío no deja correr nada ni seguir
   * enlaces desde el marco, así que lo que el administrador pegue en el mensaje
   * no puede hacer nada en su sesión.
   */
  const vistaPrevia = useMemo(() => {
    const { primera } = destinatariosElegidos(conteos, audiencia, lugaresDeLaDifusion)
    return armarCorreo(
      mensajeDeDifusion(
        {
          asunto: asunto.trim() || 'Asunto del correo',
          mensaje: mensaje.trim() || 'Aquí aparecerá su mensaje.',
          boton: tieneTexto && tieneEnlace ? { texto: botonTexto.trim(), enlace: botonEnlace.trim() } : undefined,
        },
        primera ? primera.nombre : 'Nombre',
      ),
      { logo: ruta('/logo-correo.png') },
    ).html
  }, [asunto, mensaje, botonTexto, botonEnlace, tieneTexto, tieneEnlace, conteos, audiencia, lugaresDeLaDifusion])

  // Con texto escrito, la barra lateral y Atrás preguntan antes de salir. Es
  // el mismo patrón que el editor de fichas: apuntarse solo mientras hay algo,
  // para que después de enviar —que vacía el formulario— se pueda salir sin
  // pregunta.
  useEffect(() => {
    if (!sucio) return
    return apuntarCambiosSinGuardar()
  }, [sucio])

  // Mientras una difusión sale, el historial se vuelve a pedir cada pocos
  // segundos para ver avanzar la barra. Solo entonces: una pantalla quieta que
  // consulta la base cada cuatro segundos para nada es carga gratuita. El
  // formulario no se pierde, porque `refresh` rehace la parte de servidor y
  // conserva el estado de este componente.
  useEffect(() => {
    if (!algunaEnCurso) return
    const reloj = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(reloj)
  }, [algunaEnCurso, router])

  useEffect(() => {
    if (confirmando) botonConfirmar.current?.focus()
  }, [confirmando])

  /** Cualquier cambio en lo escrito anula una confirmación ya pedida. */
  const cambiar = (fijar: (valor: string) => void) => (valor: string) => {
    fijar(valor)
    setConfirmando(false)
  }

  /** Lo mismo que `cambiar`, para las casillas. */
  const marcar = (fijar: (valor: boolean) => void) => (valor: boolean) => {
    fijar(valor)
    setConfirmando(false)
  }

  const datos = {
    asunto,
    mensaje,
    botonTexto,
    botonEnlace,
    audiencia,
    lugares: lugaresDeLaDifusion,
    porCorreo,
    comoAviso,
    diasDelAviso: comoAviso ? dias : undefined,
  }

  const probar = () => {
    setAviso(null)
    setProbando(true)
    iniciar(async () => {
      try {
        const resultado = await enviarPruebaDeDifusion(datos)
        if (resultado.exito && resultado.datos) {
          setAviso({
            tipo: 'ok',
            texto: `Prueba enviada a ${resultado.datos.para}. Si no llega en unos minutos, mire en el correo no deseado.`,
          })
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo enviar la prueba.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo enviar la prueba.') })
      } finally {
        setProbando(false)
      }
    })
  }

  const enviar = () => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await iniciarDifusion(datos)
        setConfirmando(false)
        if (resultado.exito && resultado.datos) {
          const conAviso = comoAviso ? ' El aviso ya se ve en la plataforma.' : ''
          setAviso({
            tipo: 'ok',
            texto: resultado.datos.porCorreo
              ? `Enviando «${asunto.trim()}» a ${personas(resultado.datos.total)}. El envío sigue aunque salga de esta pantalla; el avance se ve en el historial.${conAviso}`
              : `Publicado «${asunto.trim()}» como aviso para ${personas(resultado.datos.total)}. Se verá ${dias === 1 ? 'un día' : `${dias} días`}, o hasta que lo retire desde el historial.`,
          })
          setAsunto('')
          setMensaje('')
          setBotonTexto('')
          setBotonEnlace('')
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo empezar la difusión.' })
        }
      } catch (fallo) {
        setConfirmando(false)
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo empezar la difusión.') })
      }
    })
  }

  const detener = (d: DifusionDelHistorial) => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await detenerDifusion(d.id)
        if (resultado.exito) {
          setAviso({
            tipo: 'ok',
            texto: `Se detuvo «${d.asunto}». El correo que estuviera saliendo en ese instante termina de salir; los siguientes, no.`,
          })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo detener.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo detener.') })
      }
    })
  }

  const retirar = async (d: DifusionDelHistorial) => {
    const si = await confirmar({
      titulo: `¿Retirar el aviso «${d.asunto}»?`,
      mensaje: (
        <p>
          Deja de verse en la plataforma desde ya, también para quien todavía no lo ha leído. El correo,
          si lo hubo, no cambia.
        </p>
      ),
      confirmar: 'Retirar el aviso',
    })
    if (!si) return
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await retirarAviso(d.id)
        if (resultado.exito) {
          setAviso({ tipo: 'ok', texto: `Se retiró el aviso «${d.asunto}».` })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo retirar el aviso.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo retirar el aviso.') })
      }
    })
  }

  const reanudar = async (d: DifusionDelHistorial) => {
    const si = await confirmar({
      titulo: `¿Reanudar «${d.asunto}»?`,
      mensaje: (
        <>
          <p>
            Quedan {personas(d.pendientes)} por recibirla. Al ritmo configurado tardará{' '}
            {duracionAproximada(d.pendientes, pausaMs)}.
          </p>
          <p>
            Quienes ya la recibieron no la reciben otra vez; si el envío se cortó justo al mandar un
            correo, esa última persona puede recibirla dos veces.
          </p>
        </>
      ),
      confirmar: `Reanudar el envío a ${personas(d.pendientes)}`,
    })
    if (!si) return
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await reanudarDifusion(d.id)
        if (resultado.exito) {
          setAviso({ tipo: 'ok', texto: `Se reanudó «${d.asunto}».` })
          router.refresh()
        } else {
          setAviso({ tipo: 'error', texto: resultado.mensaje ?? 'No se pudo reanudar.' })
        }
      } catch (fallo) {
        setAviso({ tipo: 'error', texto: motivoDeLaCaida(fallo, 'No se pudo reanudar.') })
      }
    })
  }

  return (
    <div>
      <CabeceraDePagina
        titulo="Difusión"
        subtitulo="Un correo, un aviso dentro de la plataforma o los dos, a todas las cuentas activas o a un grupo: un aviso de clase, un caso nuevo, un cambio de horario. El correo sale uno por persona, con su nombre, al ritmo que admite el servidor de correo."
      />

      {aviso ? (
        <div className={`admin-aviso admin-aviso-${aviso.tipo}`} role="status">
          {aviso.texto}
        </div>
      ) : null}

      {!hayCorreo ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No hay servidor de correo configurado.</strong>
          Puede redactarla y publicarla como aviso dentro de la plataforma, pero no enviar nada por
          correo, ni la prueba. La configuración del correo saliente y su estado están en{' '}
          <Link href="/admin-panel/sistema">Sistema</Link>.
        </div>
      ) : null}

      <div className="difusion-rejilla">
        <section className="admin-card difusion-redaccion" aria-label="Redactar la difusión">
          <h2 className="difusion-subtitulo">Redactar</h2>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-audiencia">
              Para
            </label>
            <select
              id="difusion-audiencia"
              className="admin-form-input"
              value={audiencia}
              onChange={(e) => cambiar(setAudiencia)(e.target.value)}
            >
              {audiencias.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta} ({destinatariosElegidos(conteos, a.valor, lugaresDeLaDifusion).cuantos})
                </option>
              ))}
            </select>
            <p className="admin-form-hint">
              Solo cuentas activas. Las solicitudes de cuenta sin revisar y las cuentas desactivadas no
              reciben nada.
            </p>
          </div>

          {hayInstituciones ? (
            <fieldset className="difusion-opciones">
              <legend className="admin-form-label">Dónde</legend>
              <label className="difusion-casilla">
                <input
                  type="radio"
                  name="difusion-lugares"
                  checked={!eligiendoLugares}
                  onChange={() => marcar(setEligiendoLugares)(false)}
                />
                Todos los lugares
              </label>
              <label className="difusion-casilla">
                <input
                  type="radio"
                  name="difusion-lugares"
                  checked={eligiendoLugares}
                  onChange={() => marcar(setEligiendoLugares)(true)}
                />
                Solo los que elija
              </label>
              {eligiendoLugares ? (
                <div className="difusion-lugares">
                  {lugares.map((l) => (
                    <label key={l.valor} className="difusion-casilla">
                      <input
                        type="checkbox"
                        checked={lugaresMarcados.includes(l.valor)}
                        onChange={(e) => {
                          const marcada = e.target.checked
                          setLugaresMarcados((antes) =>
                            marcada ? [...antes, l.valor] : antes.filter((v) => v !== l.valor),
                          )
                          setConfirmando(false)
                        }}
                      />
                      {l.etiqueta}
                      <span className="difusion-casilla-cuantos">
                        {destinatariosElegidos(conteos, audiencia, [l.valor]).cuantos}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="admin-form-hint">
                {eligiendoLugares
                  ? 'Solo esos: una institución que se cree después no ve el aviso.'
                  : 'TraumaHub y cada institución, también las que se creen mientras el aviso esté a la vista.'}
              </p>
            </fieldset>
          ) : null}

          <fieldset className="difusion-opciones">
            <legend className="admin-form-label">Cómo sale</legend>
            <label className="difusion-casilla">
              <input type="checkbox" checked={porCorreo} onChange={(e) => marcar(setPorCorreo)(e.target.checked)} />
              Por correo
            </label>
            <label className="difusion-casilla">
              <input type="checkbox" checked={comoAviso} onChange={(e) => marcar(setComoAviso)(e.target.checked)} />
              Como aviso en la plataforma
            </label>
            {comoAviso ? (
              <div className="difusion-dias">
                <label className="difusion-etiqueta-menor" htmlFor="difusion-dias">
                  Se ve durante
                </label>
                <input
                  id="difusion-dias"
                  className="admin-form-input"
                  type="number"
                  min={1}
                  max={DIAS_DEL_AVISO.maximo}
                  step={1}
                  value={diasDelAviso}
                  onChange={(e) => cambiar(setDiasDelAviso)(e.target.value)}
                />
                <span>días</span>
              </div>
            ) : null}
            <p className="admin-form-hint">
              El aviso se abre solo en una ventana la próxima vez que cada persona entra, y queda en la
              campana de la barra hasta que vence o se retira.
            </p>
          </fieldset>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-asunto">
              Asunto
            </label>
            <input
              id="difusion-asunto"
              className="admin-form-input"
              value={asunto}
              maxLength={150}
              onChange={(e) => cambiar(setAsunto)(e.target.value)}
              placeholder="Sesión del lunes: fracturas de meseta tibial"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="difusion-mensaje">
              Mensaje
            </label>
            <textarea
              id="difusion-mensaje"
              className="admin-form-input difusion-mensaje"
              value={mensaje}
              maxLength={5000}
              rows={12}
              aria-describedby={idAyudaMensaje}
              onChange={(e) => cambiar(setMensaje)(e.target.value)}
            />
            <p className="admin-form-hint" id={idAyudaMensaje}>
              Una línea en blanco separa párrafos. Las líneas que empiezan por «- » forman una lista.
              Las direcciones que empiezan por https:// se convierten solas en enlaces. El saludo
              («Hola, …») lo pone la plataforma con el nombre de cada persona.
              <span className="difusion-contador">{mensaje.length} / 5000</span>
            </p>
          </div>

          <fieldset className="difusion-boton">
            <legend className="admin-form-label">Botón (opcional)</legend>
            <div className="admin-form-fila">
              <div>
                <label className="difusion-etiqueta-menor" htmlFor="difusion-boton-texto">
                  Texto
                </label>
                <input
                  id="difusion-boton-texto"
                  className="admin-form-input"
                  value={botonTexto}
                  maxLength={60}
                  onChange={(e) => cambiar(setBotonTexto)(e.target.value)}
                  placeholder="Abrir el caso"
                />
              </div>
              <div>
                <label className="difusion-etiqueta-menor" htmlFor="difusion-boton-enlace">
                  Enlace
                </label>
                <input
                  id="difusion-boton-enlace"
                  className="admin-form-input"
                  type="url"
                  value={botonEnlace}
                  maxLength={500}
                  aria-invalid={enlaceInseguro || undefined}
                  onChange={(e) => cambiar(setBotonEnlace)(e.target.value)}
                  placeholder={direccionPlataforma ? `${direccionPlataforma}/…` : 'https://…'}
                />
              </div>
            </div>
            {direccionPlataforma ? (
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary difusion-sugerencia"
                onClick={() => {
                  cambiar(setBotonEnlace)(direccionPlataforma)
                  if (!tieneTexto) setBotonTexto('Entrar a TraumaHub')
                }}
              >
                Usar la dirección de TraumaHub
              </button>
            ) : null}
            {hayInstituciones ? (
              <p className="admin-form-hint">
                Un enlace a TraumaHub se abre, para cada persona, en el lugar de su cuenta: quien es de
                una institución llega a su subdominio.
              </p>
            ) : null}
          </fieldset>

          {problema && sucio ? <p className="difusion-problema">{problema}</p> : null}
          {!problema && problemaDelDestino ? <p className="difusion-problema">{problemaDelDestino}</p> : null}
          {!problema && !problemaDelDestino && cuantos === 0 ? (
            <p className="difusion-problema">No hay ninguna cuenta activa en ese grupo.</p>
          ) : null}
          {algunaEnCurso && porCorreo ? (
            <p className="difusion-problema">
              Hay una difusión enviándose. Puede probar esta, pero no enviarla por correo hasta que
              aquella termine o se detenga; como aviso solo, sí.
            </p>
          ) : null}

          {confirmando ? (
            <div
              className="admin-aviso admin-aviso-atencion difusion-confirmacion"
              role="alertdialog"
              aria-labelledby={idConfirmacion}
            >
              <strong id={idConfirmacion}>
                {porCorreo
                  ? `¿Enviar «${asunto.trim()}» a ${personas(cuantos)}${comoAviso ? ', por correo y como aviso' : ''}?`
                  : `¿Publicar «${asunto.trim()}» como aviso para ${personas(cuantos)}?`}
              </strong>
              Grupo: {etiquetaDeAudiencia}
              {nombresDeLugares ? `, en ${nombresDeLugares.join(', ')}` : hayInstituciones ? ', en todos los lugares' : ''}.{' '}
              {porCorreo ? (
                <>
                  Al ritmo configurado —{correosPorHora} correos por hora— el correo tardará{' '}
                  {duracionAproximada(cuantos, pausaMs)}. El envío sigue aunque cierre esta pantalla y se
                  puede detener desde el historial, pero lo que ya salió no se recupera.{' '}
                </>
              ) : null}
              {comoAviso
                ? `El aviso se ve ${dias === 1 ? 'un día' : `${dias} días`} y se puede retirar antes desde el historial.`
                : null}
              <div className="admin-acciones difusion-confirmacion-botones">
                <button
                  ref={botonConfirmar}
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={enviar}
                  disabled={!puedeEnviar}
                >
                  <Send aria-hidden size={16} />
                  {ocupado
                    ? 'Empezando…'
                    : porCorreo
                      ? `Sí, enviar a ${personas(cuantos)}`
                      : `Sí, publicar para ${personas(cuantos)}`}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setConfirmando(false)}
                  disabled={ocupado}
                >
                  <X aria-hidden size={16} />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="admin-acciones difusion-envio">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={probar} disabled={!puedeProbar}>
                <Mail aria-hidden size={16} />
                {probando ? 'Enviando la prueba…' : 'Enviarme una prueba'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setConfirmando(true)}
                disabled={!puedeEnviar}
              >
                <Send aria-hidden size={16} />
                {/* «Enviar» es el correo; un aviso solo se publica. */}
                {porCorreo ? `Enviar a ${personas(cuantos)}` : `Publicar para ${personas(cuantos)}`}
              </button>
            </div>
          )}
        </section>

        <section className="admin-card difusion-vista" aria-label="Vista previa del correo">
          <div className="difusion-vista-cabecera">
            <h2 className="difusion-subtitulo">Vista previa</h2>
            <p className="admin-form-hint">
              {aQuienLeLlega
                ? `Así le llega a ${aQuienLeLlega}, el primer correo de la cola${
                    cuantos > 1 ? `; cada una de las ${cuantos} personas lo recibe con su nombre en el saludo` : ''
                  }.`
                : 'Así lo recibirá cada persona, con su nombre en el saludo.'}
              {comoAviso
                ? ' El aviso de la plataforma lleva el mismo asunto, mensaje y botón, sin el saludo.'
                : ''}
            </p>
          </div>
          <iframe className="difusion-vista-marco" title="Vista previa del correo" sandbox="" srcDoc={vistaPrevia} />
        </section>
      </div>

      <SeccionPlegable
        clave="difusion.historial"
        titulo="Historial"
        resumen={historial.length === 1 ? '1 difusión' : `${historial.length} difusiones`}
      >
        {historial.length > 0 ? (
          // «Enviados» es lo que el servidor de correo aceptó al mandarlo. Lo
          // que rebota después llega al buzón del remitente y la plataforma no
          // lo ve: decir «entregados», como el diseño, prometería un dato que
          // no se guarda.
          <p className="admin-form-hint difusion-historial-nota">
            {historial.length === 1 ? 'La última difusión' : `Las últimas ${historial.length} difusiones, de la más reciente a la más antigua`}. «Correo» es la parte de los destinatarios cuyo correo aceptó el servidor; lo
            que rebote después llega al buzón del remitente y no aparece aquí. «Aviso» cuenta quiénes lo
            cerraron en la plataforma.
          </p>
        ) : null}
        {historial.length === 0 ? (
          <Vacio icono={History} titulo="Todavía no se ha enviado ninguna difusión." compacto>
            Las que se manden desde aquí aparecerán con su avance y sus fallos.
          </Vacio>
        ) : (
      <div className="admin-table-container">
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Asunto</th>
                <th>Para</th>
                <th>Correo</th>
                <th>Aviso</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {historial.map((d) => {
                const estado = etiquetaDeEstado(d)
                const IconoDeEstado = estado.icono
                const interrumpida = d.estado === 'enviando' && !d.enCurso
                const reanudable = (d.estado === 'detenida' || interrumpida) && d.pendientes > 0
                const porcentaje = porcentajeEnviado(d)
                // El color de la barra dice cómo terminó y no cuánto falta: verde
                // si salió a todos, ámbar si alguno falló, y el azul de siempre
                // mientras sale o si se detuvo con gente por recibirla.
                const tonoDeLaBarra =
                  d.fallidos > 0 ? 'difusion-barra-con-fallos' : porcentaje === 100 ? 'difusion-barra-completa' : ''
                return (
                  <tr key={d.id}>
                    {/* Cada celda con rótulo lleva un solo hijo: en el teléfono la
                        celda es una fila flexible detrás de su rótulo, y dos
                        hijos se ponían uno al lado del otro y se cortaban
                        contra el borde. */}
                    <td data-etiqueta="Fecha">
                      <div className="difusion-fecha">
                        {fechaHora(d.creada)}
                        {d.autor ? <div className="admin-table-user-email">{d.autor}</div> : null}
                      </div>
                    </td>
                    <th scope="row" className="difusion-asunto">
                      {d.asunto}
                    </th>
                    <td data-etiqueta="Para">
                      <div>
                        {d.audiencia}
                        {d.lugares ? (
                          <div className="admin-table-user-email">{d.lugares.join(', ')}</div>
                        ) : hayInstituciones ? (
                          <div className="admin-table-user-email">Todos los lugares</div>
                        ) : null}
                        <div className="admin-table-user-email">{personas(d.total)}</div>
                      </div>
                    </td>
                    <td className="difusion-avance" data-etiqueta="Correo">
                      {!d.porCorreo ? (
                        <div className="admin-table-user-email">No salió por correo.</div>
                      ) : (
                      <div className="difusion-avance-cuerpo">
                      <div className="difusion-avance-cifras">
                        <span className="u-num">{porcentaje === null ? '—' : `${porcentaje} %`}</span>
                        <span className="admin-table-user-email">
                          {d.enviados} de {d.total}
                        </span>
                      </div>
                      <div
                        className={`admin-progreso ${tonoDeLaBarra}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={porcentaje ?? 0}
                        aria-label={`Enviados ${d.enviados} de ${d.total}`}
                      >
                        <div className="admin-progreso-relleno" style={{ width: `${porcentaje ?? 0}%` }} />
                      </div>
                      </div>
                      )}
                    </td>
                    <td data-etiqueta="Aviso">
                      {d.aviso ? (
                        <div>
                          {d.aviso.vigente ? `A la vista hasta el ${fecha(d.aviso.hasta)}` : `Se dejó de ver el ${fecha(d.aviso.hasta)}`}
                          {d.aviso.leidos !== null ? (
                            <div className="admin-table-user-email">
                              Leído por {d.aviso.leidos} de {d.total}
                              {d.aviso.porElBoton !== null
                                ? ` · ${d.aviso.porElBoton === 1 ? '1 siguió' : `${d.aviso.porElBoton} siguieron`} el botón`
                                : ''}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="admin-table-user-email">Sin aviso.</div>
                      )}
                    </td>
                    <td data-etiqueta="Estado">
                      <div>
                      <span className={claseDeInsignia(estado.tono)}>
                        <IconoDeEstado aria-hidden size={12} />
                        {estado.texto}
                      </span>
                      {interrumpida ? (
                        <div className="admin-table-user-email">
                          El envío se cortó a la mitad (un reinicio del servicio o un error: ver el
                          registro). Quedan {personas(d.pendientes)}.
                        </div>
                      ) : d.estado === 'detenida' && d.pendientes > 0 ? (
                        <div className="admin-table-user-email">Quedan {personas(d.pendientes)}.</div>
                      ) : null}
                      {/* Los fallos, bajo el estado que explican. Eran una
                          columna propia con un cero en casi todas las filas. */}
                      {d.fallidos > 0 ? (
                        <details className="difusion-fallos">
                          <summary>
                            {d.fallidos === 1 ? '1 fallido' : `${d.fallidos} fallidos`}
                          </summary>
                          <ul>
                            {d.fallos.map((f, i) => (
                              <li key={`${f.correo}-${i}`}>
                                <span className="difusion-fallo-correo">{f.correo}</span>
                                {f.motivo ? <span className="difusion-fallo-motivo">{f.motivo}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      </div>
                    </td>
                    {/* Vacía cuando no hay nada que hacer con la fila, para que
                        `td:empty` la esconda en el teléfono en lugar de dejar
                        un hueco al pie de la tarjeta. */}
                    <td className="admin-table-acciones">
                      {(d.estado === 'enviando' && d.enCurso) || reanudable || d.aviso?.vigente ? (
                      <div className="admin-table-acciones-fila">
                        {d.aviso?.vigente ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => retirar(d)}
                            disabled={ocupado}
                          >
                            <BellOff aria-hidden size={14} />
                            Retirar el aviso
                          </button>
                        ) : null}
                        {d.estado === 'enviando' && d.enCurso ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => detener(d)}
                            disabled={ocupado}
                          >
                            <Pause aria-hidden size={14} />
                            Detener
                          </button>
                        ) : null}
                        {reanudable ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            onClick={() => reanudar(d)}
                            disabled={ocupado || !hayCorreo || algunaEnCurso}
                            title={
                              !hayCorreo
                                ? 'No hay servidor de correo configurado.'
                                : algunaEnCurso
                                  ? 'Hay otra difusión enviándose.'
                                  : undefined
                            }
                          >
                            <Play aria-hidden size={14} />
                            Reanudar
                          </button>
                        ) : null}
                      </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>
        )}
      </SeccionPlegable>
    </div>
  )
}
