'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Circle, Eye, EyeOff, RotateCcw, Square, Trash2, Upload } from 'lucide-react'
import type { MandoDelLienzo } from '@/components/simulador/LienzoQuirurgico'
import { ESQUEMAS } from '@/admin/esquema'
import { formularioDeArchivo, subidorQueAvisa } from '@/admin/subidas'
import { claveEstable } from '@/admin/identidadDeBloques'
import {
  BITS_POR_SEGUNDO,
  cuadrosDeLaDescripcion,
  cuadrosDelTexto,
  disponerElCuadro,
  duracionLegible,
  formatoDeGrabacion,
  gradienteDelFondo,
  hayQueParar,
  nombreDeLaGrabacion,
  pesoLegible,
  radiosDelGradiente,
  tamanoDeLaGrabacion,
  TECHO_DE_LA_IMAGEN,
  textoDeLosCuadros,
  tipoDelArchivo,
  type DisposicionDelCuadro,
  type GradienteDelFondo,
  type PosicionDelCuadro,
} from '@/lib/grabacionDelPaso'

/**
 * «Grabar la demostración» del editor (P-013, pedido 11 de Cristóbal: «a los
 * editores permitirnos el modo grabar», con cuadros explicativos encima).
 *
 * Graba solo el lienzo, sin el panel ni el ratón, con el cuadro explicativo
 * quemado en la imagen, y lo deja como «Demostración» del paso (P-009). Cómo y
 * por qué así, en `src/lib/grabacionDelPaso.ts`.
 *
 * El estado vive en `useGrabadoraDelPaso`, que monta el editor entero y no la
 * pestaña del paso. Una grabación dura lo que tarde el gesto, y en ese rato se
 * cambia de pestaña o de paso sin pensarlo: con el estado en la pestaña, eso la
 * cortaba y la tiraba. Por lo mismo, lo grabado recuerda de qué paso es
 * (`PasoGrabado`), y al usarlo se apunta en ese paso por su clave, no en el que
 * esté abierto.
 */

type Fila = Record<string, unknown>

/** De qué paso es lo que se graba. Se fija al empezar. */
interface PasoGrabado {
  clave: string
  numero: number
  titulo: string
}

interface Grabado {
  paso: PasoGrabado
  archivo: File
  url: string
  ms: number
  /** Paró sola, porque se acercaba al techo de los medios. */
  porElTecho: boolean
}

type Fase =
  | { fase: 'quieta' }
  | { fase: 'preparando'; paso: PasoGrabado }
  | { fase: 'grabando'; paso: PasoGrabado; bytes: number }
  | ({ fase: 'grabada' } & Grabado)
  | ({ fase: 'subiendo'; fraccion: number } & Grabado)

/** Lo que está en marcha mientras se graba: nada de esto se pinta, y por eso no es estado. */
interface EnMarcha {
  grabadora: MediaRecorder | null
  dejar: () => void
  cuadro: number
  reloj: number
  flujo: MediaStream | null
}

/** Cuánto se espera el primer dibujo del lienzo antes de decir que no llega. */
const ESPERA_DEL_PRIMER_CUADRO_MS = 3000

/** El de la consola cuando no se encuentra otro: el lienzo es transparente, y sin fondo el vídeo saldría en negro. */
const FONDO_POR_OMISION = '#0f1729'

const LETRA = (tamano: number) => `600 ${tamano}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

const techoDeLosMedios = () => ESQUEMAS.find((e) => e.slug === 'medios')?.subida?.maximoBytes ?? 0

type Fondo = (ctx: CanvasRenderingContext2D, ancho: number, alto: number) => void

const fondoLiso =
  (color: string): Fondo =>
  (ctx, ancho, alto) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, ancho, alto)
  }

/** El degradado de CSS en el lienzo 2D: un círculo unidad escalado a la elipse, que el 2D no tiene degradados elípticos. */
const fondoConGradiente =
  (g: GradienteDelFondo): Fondo =>
  (ctx, ancho, alto) => {
    const [rx, ry] = radiosDelGradiente(g.centro, ancho, alto)
    const cx = g.centro[0] * ancho
    const cy = g.centro[1] * alto
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(rx, ry)
    const degradado = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    for (const p of g.paradas) degradado.addColorStop(p.en, p.color)
    ctx.fillStyle = degradado
    ctx.fillRect(-cx / rx, -cy / ry, ancho / rx, alto / ry)
    ctx.restore()
  }

/**
 * Lo que hay detrás del lienzo: el primer contenedor, subiendo, con un
 * degradado radial o un color que no sea transparente.
 *
 * El lienzo de three.js se crea con `alpha`: lo que no tapa el modelo deja ver
 * lo que tiene detrás, que en la consola es el foco de `consola.css`. En el
 * vídeo no hay nada detrás, y sin pintarlo esos píxeles salen negros
 * (`gradienteDelFondo`).
 */
function fondoDetrasDe(lienzo: HTMLCanvasElement): Fondo {
  for (let nodo = lienzo.parentElement; nodo; nodo = nodo.parentElement) {
    const estilo = getComputedStyle(nodo)
    const gradiente = gradienteDelFondo(estilo.backgroundImage)
    if (gradiente) return fondoConGradiente(gradiente)
    const color = estilo.backgroundColor
    if (color && color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) return fondoLiso(color)
  }
  return fondoLiso(FONDO_POR_OMISION)
}

/** Copia el lienzo entero, sin deformarlo, centrado sobre el fondo. */
function copiarElCuadro(origen: HTMLCanvasElement, destino: HTMLCanvasElement, fondo: Fondo) {
  const ctx = destino.getContext('2d')
  if (!ctx || origen.width === 0 || origen.height === 0) return
  const escala = Math.min(destino.width / origen.width, destino.height / origen.height)
  const ancho = origen.width * escala
  const alto = origen.height * escala
  const x = (destino.width - ancho) / 2
  const y = (destino.height - alto) / 2
  // Lo que quede fuera del lienzo, si cambió de proporción a mitad de grabación, va del color de la consola.
  ctx.fillStyle = FONDO_POR_OMISION
  ctx.fillRect(0, 0, destino.width, destino.height)
  // El fondo, del tamaño del lienzo y donde va el lienzo: es el de su caja, no el de la imagen entera.
  ctx.save()
  ctx.translate(x, y)
  fondo(ctx, ancho, alto)
  ctx.restore()
  ctx.drawImage(origen, x, y, ancho, alto)
}

/** El cuadro explicativo, con el mismo azul oscuro de las etiquetas de la consola. */
function pintarElCuadro(ctx: CanvasRenderingContext2D, d: DisposicionDelCuadro) {
  const { x, y, ancho, alto } = d.caja
  ctx.fillStyle = 'rgba(15, 23, 41, 0.86)'
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, ancho, alto, Math.round(d.tamano * 0.35))
  else ctx.rect(x, y, ancho, alto)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = LETRA(d.tamano)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  d.lineas.forEach((linea, i) => ctx.fillText(linea, x + ancho / 2, y + d.relleno + d.interlinea * (i + 0.5)))
}

export interface Grabadora {
  fase: Fase
  /** Los cuadros del paso, como los tiene el recuadro: los de su descripción hasta que se escriba otra cosa. */
  textoDe: (clave: string, descripcion: unknown) => string
  escribirTexto: (clave: string, texto: string) => void
  olvidarTexto: (clave: string) => void
  posicion: PosicionDelCuadro
  setPosicion: (p: PosicionDelCuadro) => void
  /** Los cuadros con que se graba ahora, y cuál está en la imagen (`-1`, ninguno). */
  cuadros: string[]
  actual: number
  irAlCuadro: (i: number) => void
  transcurrido: number
  empezar: (paso: PasoGrabado, cuadros: string[]) => void
  detener: () => void
  descartar: () => void
  usar: (escribirEnElPaso: (clave: string, cambios: Fila) => boolean) => void
  aviso: string | null
  error: string | null
}

export function useGrabadoraDelPaso(mando: React.MutableRefObject<MandoDelLienzo | null>): Grabadora {
  const [fase, setFase] = useState<Fase>({ fase: 'quieta' })
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [posicion, setPosicion] = useState<PosicionDelCuadro>('abajo')
  const [cuadros, setCuadros] = useState<string[]>([])
  const [actual, setActual] = useState(-1)
  const [transcurrido, setTranscurrido] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Lo que lee el bucle que pinta cada cuadro. Va en referencias para que cambiar de cuadro explicativo no rehaga la
  // grabación, que es lo que haría pasarlo como dependencia.
  const enPantalla = useRef<{ texto: string | null; posicion: PosicionDelCuadro }>({ texto: null, posicion: 'abajo' })
  useEffect(() => {
    enPantalla.current = { texto: actual >= 0 ? (cuadros[actual] ?? null) : null, posicion }
  }, [actual, cuadros, posicion])

  const enMarcha = useRef<EnMarcha | null>(null)
  const montada = useRef(true)
  const urlViva = useRef<string | null>(null)

  /** Suelta el lienzo, el bucle y la captura. No toca lo ya grabado. */
  const soltar = useCallback(() => {
    const m = enMarcha.current
    if (!m) return
    enMarcha.current = null
    m.dejar()
    cancelAnimationFrame(m.cuadro)
    window.clearInterval(m.reloj)
    for (const pista of m.flujo?.getTracks() ?? []) pista.stop()
  }, [])

  useEffect(() => {
    montada.current = true
    return () => {
      montada.current = false
      const m = enMarcha.current
      // Al desmontarse el editor no queda nadie a quien enseñarle lo grabado: se para sin guardarlo.
      if (m?.grabadora && m.grabadora.state !== 'inactive') {
        m.grabadora.ondataavailable = null
        m.grabadora.onstop = null
        m.grabadora.stop()
      }
      soltar()
      if (urlViva.current) URL.revokeObjectURL(urlViva.current)
    }
  }, [soltar])

  const textoDe = useCallback(
    (clave: string, descripcion: unknown) => textos[clave] ?? textoDeLosCuadros(cuadrosDeLaDescripcion(descripcion)),
    [textos],
  )
  const escribirTexto = useCallback((clave: string, texto: string) => setTextos((t) => ({ ...t, [clave]: texto })), [])
  const olvidarTexto = useCallback(
    (clave: string) =>
      setTextos((t) => {
        const resto = { ...t }
        delete resto[clave]
        return resto
      }),
    [],
  )

  const empezar = useCallback(
    (paso: PasoGrabado, conCuadros: string[]) => {
      if (enMarcha.current) return
      setError(null)
      setAviso(null)
      const lienzo = mando.current
      const formato =
        typeof MediaRecorder === 'undefined' ? null : formatoDeGrabacion((f) => MediaRecorder.isTypeSupported(f))
      if (!lienzo) {
        setError('El lienzo todavía no está listo: espere a que cargue el modelo.')
        return
      }
      if (!formato) {
        setError('Este navegador no sabe grabar vídeo. Pruebe con Chrome o Edge.')
        return
      }
      setCuadros(conCuadros)
      setActual(conCuadros.length > 0 ? 0 : -1)
      setFase({ fase: 'preparando', paso })

      const imagen = document.createElement('canvas')
      const ultimo = document.createElement('canvas')
      let fondo: Fondo = fondoLiso(FONDO_POR_OMISION)
      let disposicion: { clave: string; d: DisposicionDelCuadro | null } | null = null
      const medir = (s: string, tamano: number) => {
        const ctx = imagen.getContext('2d')
        if (!ctx) return s.length * tamano * 0.5
        ctx.font = LETRA(tamano)
        return ctx.measureText(s).width
      }
      const pintar = () => {
        const m = enMarcha.current
        if (!m) return
        // «Repetir este paso» y «Deshacer» vuelven a montar el lienzo, que empieza sin oyentes: se sigue grabando del
        // nuevo, que si no la grabación se quedaría en el último cuadro del viejo sin decir nada. Se pregunta al lienzo y
        // no se compara el mando, que se rehace en cada pintado: con la comparación se volvía a escuchar en cada cuadro,
        // y cada vez se pedía un dibujo que no hacía falta.
        const vigente = mando.current
        if (vigente && !vigente.sigueEscuchando(alDibujar)) {
          m.dejar()
          m.dejar = vigente.escucharLosCuadros(alDibujar, TECHO_DE_LA_IMAGEN.ancho)
        }
        const ctx = imagen.getContext('2d')
        if (ctx) {
          ctx.drawImage(ultimo, 0, 0)
          const { texto, posicion: donde } = enPantalla.current
          if (texto) {
            const clave = `${donde}|${texto}`
            if (disposicion?.clave !== clave) disposicion = { clave, d: disponerElCuadro(texto, imagen.width, imagen.height, medir, donde) }
            if (disposicion.d) pintarElCuadro(ctx, disposicion.d)
          }
        }
        m.cuadro = requestAnimationFrame(pintar)
      }
      const arrancar = () => {
        const m = enMarcha.current
        if (!m) return
        const techo = techoDeLosMedios()
        const flujo = imagen.captureStream(30)
        const grabadora = new MediaRecorder(flujo, { mimeType: formato, videoBitsPerSecond: BITS_POR_SEGUNDO })
        const trozos: Blob[] = []
        let bytes = 0
        let porElTecho = false
        const desde = performance.now()
        grabadora.ondataavailable = (e) => {
          if (e.data.size === 0) return
          trozos.push(e.data)
          bytes += e.data.size
          setFase((f) => (f.fase === 'grabando' ? { ...f, bytes } : f))
          if (hayQueParar(bytes, techo) && grabadora.state === 'recording') {
            porElTecho = true
            grabadora.stop()
          }
        }
        grabadora.onstop = () => {
          soltar()
          if (!montada.current) return
          const tipo = tipoDelArchivo(grabadora.mimeType || formato)
          const blob = new Blob(trozos, { type: tipo })
          if (blob.size === 0) {
            setFase({ fase: 'quieta' })
            setError('No se grabó nada: el navegador no entregó ningún cuadro.')
            return
          }
          const archivo = new File([blob], nombreDeLaGrabacion(paso.titulo, paso.numero, new Date(), tipo), { type: tipo })
          const url = URL.createObjectURL(blob)
          if (urlViva.current) URL.revokeObjectURL(urlViva.current)
          urlViva.current = url
          setFase({ fase: 'grabada', paso, archivo, url, ms: performance.now() - desde, porElTecho })
        }
        m.grabadora = grabadora
        m.flujo = flujo
        m.reloj = window.setInterval(() => setTranscurrido(performance.now() - desde), 250)
        // Un trozo por segundo: es lo que deja contar los bytes mientras se graba y parar antes del techo.
        grabadora.start(1000)
        setTranscurrido(0)
        setFase({ fase: 'grabando', paso, bytes: 0 })
        m.cuadro = requestAnimationFrame(pintar)
      }
      // El primer cuadro da el tamaño de la grabación y el fondo, y con él empieza a grabar: antes no se sabe qué
      // proporción tiene el lienzo, y la imagen no puede cambiar de tamaño a mitad de vídeo.
      let preparado = false
      const alDibujar = (origen: HTMLCanvasElement) => {
        if (!enMarcha.current) return
        if (!preparado) {
          preparado = true
          const { ancho, alto } = tamanoDeLaGrabacion(origen.width, origen.height)
          imagen.width = ultimo.width = ancho
          imagen.height = ultimo.height = alto
          fondo = fondoDetrasDe(origen)
          copiarElCuadro(origen, ultimo, fondo)
          arrancar()
          return
        }
        copiarElCuadro(origen, ultimo, fondo)
      }
      enMarcha.current = { grabadora: null, dejar: () => {}, cuadro: 0, reloj: 0, flujo: null }
      enMarcha.current.dejar = lienzo.escucharLosCuadros(alDibujar, TECHO_DE_LA_IMAGEN.ancho)
      window.setTimeout(() => {
        const m = enMarcha.current
        if (!m || m.grabadora || !montada.current) return
        soltar()
        setFase({ fase: 'quieta' })
        setError('El lienzo no dibujó nada en tres segundos. Compruebe que el modelo está cargado y vuelva a intentarlo.')
      }, ESPERA_DEL_PRIMER_CUADRO_MS)
    },
    [mando, soltar],
  )

  const detener = useCallback(() => {
    const m = enMarcha.current
    if (!m) return
    if (m.grabadora && m.grabadora.state !== 'inactive') {
      m.grabadora.stop()
      return
    }
    // Aún no había empezado: no hay nada que enseñar.
    soltar()
    setFase({ fase: 'quieta' })
  }, [soltar])

  const descartar = useCallback(() => {
    if (urlViva.current) URL.revokeObjectURL(urlViva.current)
    urlViva.current = null
    setFase({ fase: 'quieta' })
    setAviso(null)
    setError(null)
  }, [])

  const usar = useCallback(
    (escribirEnElPaso: (clave: string, cambios: Fila) => boolean) => {
      if (fase.fase !== 'grabada') return
      const grabado: Grabado = { paso: fase.paso, archivo: fase.archivo, url: fase.url, ms: fase.ms, porElTecho: fase.porElTecho }
      const techo = techoDeLosMedios()
      if (techo > 0 && grabado.archivo.size > techo) {
        setError(`Pesa ${pesoLegible(grabado.archivo.size)} y el techo de los medios son ${pesoLegible(techo)}: grábela más corta.`)
        return
      }
      setError(null)
      setFase({ fase: 'subiendo', fraccion: 0, ...grabado })
      const avisar = (fraccion: number) => setFase((f) => (f.fase === 'subiendo' ? { ...f, fraccion } : f))
      void (async () => {
        try {
          // Por la ruta de subidas y no por una acción, como el selector de archivos: el porqué, en `src/admin/subidas.ts`.
          const resultado = await subidorQueAvisa(avisar)(formularioDeArchivo('medios', grabado.archivo))
          if (!montada.current) return
          if (!resultado.exito || !resultado.datos) {
            setFase({ fase: 'grabada', ...grabado })
            setError(resultado.mensaje ?? 'No se pudo subir la grabación.')
            return
          }
          const apuntada = escribirEnElPaso(grabado.paso.clave, { demostracion: resultado.datos.id })
          URL.revokeObjectURL(grabado.url)
          if (urlViva.current === grabado.url) urlViva.current = null
          setFase({ fase: 'quieta' })
          setAviso(
            apuntada
              ? `Lista: es la demostración del paso ${grabado.paso.numero}. Falta guardar la ficha, como con todo lo que se escribe aquí.`
              : `Se subió a los medios como «${grabado.archivo.name}», pero el paso ${grabado.paso.numero} ya no está como estaba: elíjala en su campo «Demostración».`,
          )
        } catch {
          if (!montada.current) return
          setFase({ fase: 'grabada', ...grabado })
          setError('No se pudo subir la grabación: el navegador cortó la subida.')
        }
      })()
    },
    [fase],
  )

  const irAlCuadro = useCallback((i: number) => setActual(i), [])

  return {
    fase,
    textoDe,
    escribirTexto,
    olvidarTexto,
    posicion,
    setPosicion,
    cuadros,
    actual,
    irAlCuadro,
    transcurrido,
    empezar,
    detener,
    descartar,
    usar,
    aviso,
    error,
  }
}

/** El panel de la grabación, al pie de la pestaña del paso. */
export function PanelDeGrabacion({
  grabadora: g,
  paso,
  numero,
  escribirEnElPaso,
}: {
  grabadora: Grabadora
  paso: Fila
  numero: number
  escribirEnElPaso: (clave: string, cambios: Fila) => boolean
}) {
  const id = useId()
  const clave = claveEstable(paso)
  const titulo = typeof paso.titulo === 'string' ? paso.titulo : ''
  const texto = clave ? g.textoDe(clave, paso.descripcion) : ''
  const cuadros = cuadrosDelTexto(texto)
  const desLaDescripcion = textoDeLosCuadros(cuadrosDeLaDescripcion(paso.descripcion))
  const { fase } = g
  const ocupada = fase.fase !== 'quieta'
  const deOtroPaso = ocupada && 'paso' in fase && fase.paso.clave !== clave

  return (
    <section className="editor-grabacion" aria-labelledby={`${id}-titulo`}>
      <h4 id={`${id}-titulo`} className="editor-grabacion-titulo">
        Grabar la demostración
      </h4>
      <p className="campo-ayuda">
        Se graba solo el lienzo —sin este panel ni el ratón— con el cuadro explicativo encima, y queda como
        «Demostración» del paso: el residente la ve en práctica al llegar a él.
      </p>

      {deOtroPaso && 'paso' in fase ? (
        <p className="editor-grabacion-otro" role="note">
          Esta grabación es del paso {fase.paso.numero}
          {fase.paso.titulo ? ` («${fase.paso.titulo}»)` : ''}, y ahí se apunta al usarla.
        </p>
      ) : null}

      {fase.fase === 'quieta' ? (
        <>
          <label className="campo-etiqueta" htmlFor={`${id}-cuadros`}>
            Cuadros explicativos
          </label>
          <textarea
            id={`${id}-cuadros`}
            className="campo-control editor-grabacion-texto"
            rows={5}
            value={texto}
            disabled={!clave}
            aria-describedby={`${id}-ayuda-cuadros`}
            onChange={(e) => clave && g.escribirTexto(clave, e.target.value)}
          />
          <p id={`${id}-ayuda-cuadros`} className="campo-ayuda">
            Uno por párrafo, separados por una línea en blanco: {cuadros.length === 1 ? 'hay 1' : `hay ${cuadros.length}`}.
            Salen de «Qué se hace» del paso; lo que cambie aquí vale solo para grabar. Mientras graba, se pasa de uno a
            otro con «Siguiente».
          </p>
          <div className="editor-simulador-capturas-botones">
            <label className="editor-grabacion-posicion">
              <span>Cuadro</span>
              <select
                className="campo-control"
                value={g.posicion}
                onChange={(e) => g.setPosicion(e.target.value === 'arriba' ? 'arriba' : 'abajo')}
              >
                <option value="abajo">abajo</option>
                <option value="arriba">arriba</option>
              </select>
            </label>
            {clave && texto !== desLaDescripcion ? (
              <button type="button" className="consola-boton" onClick={() => g.olvidarTexto(clave)}>
                <RotateCcw size={14} aria-hidden /> Volver a los de la descripción
              </button>
            ) : null}
            <button
              type="button"
              className="consola-boton consola-boton-grabar"
              disabled={!clave}
              onClick={() => clave && g.empezar({ clave, numero, titulo }, cuadros)}
            >
              <Circle size={14} aria-hidden /> Grabar
            </button>
          </div>
          {!clave ? <p className="campo-ayuda">Guarde la ficha una vez para poder grabar este paso.</p> : null}
        </>
      ) : null}

      {fase.fase === 'preparando' ? (
        <div className="editor-simulador-capturas-botones" role="status">
          <span>Preparando la grabación…</span>
          <button type="button" className="consola-boton" onClick={g.detener}>
            Cancelar
          </button>
        </div>
      ) : null}

      {fase.fase === 'grabando' ? (
        <>
          <div className="editor-grabacion-en-curso" role="status" aria-live="polite">
            <span className="editor-grabacion-punto" aria-hidden />
            Grabando el paso {fase.paso.numero} · {duracionLegible(g.transcurrido)} · {pesoLegible(fase.bytes)}
          </div>
          <div className="editor-simulador-capturas-botones">
            <button type="button" className="consola-boton consola-boton-grabar" onClick={g.detener}>
              <Square size={14} aria-hidden /> Detener
            </button>
          </div>
          {g.cuadros.length > 0 ? (
            <div className="editor-grabacion-cuadros">
              <p className="campo-ayuda">
                {g.actual >= 0 ? `En la imagen, el cuadro ${g.actual + 1} de ${g.cuadros.length}:` : 'Sin cuadro en la imagen.'}
              </p>
              {g.actual >= 0 ? <blockquote className="editor-grabacion-cita">{g.cuadros[g.actual]}</blockquote> : null}
              <div className="editor-simulador-capturas-botones">
                <button type="button" className="consola-boton" disabled={g.actual <= 0} onClick={() => g.irAlCuadro(g.actual - 1)}>
                  <ChevronLeft size={14} aria-hidden /> Anterior
                </button>
                <button
                  type="button"
                  className="consola-boton"
                  disabled={g.actual >= g.cuadros.length - 1}
                  onClick={() => g.irAlCuadro(g.actual + 1)}
                >
                  Siguiente <ChevronRight size={14} aria-hidden />
                </button>
                {g.actual >= 0 ? (
                  <button type="button" className="consola-boton" onClick={() => g.irAlCuadro(-1)}>
                    <EyeOff size={14} aria-hidden /> Quitar el cuadro
                  </button>
                ) : (
                  <button type="button" className="consola-boton" onClick={() => g.irAlCuadro(0)}>
                    <Eye size={14} aria-hidden /> Enseñar el primero
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {fase.fase === 'grabada' || fase.fase === 'subiendo' ? (
        <>
          <video className="editor-grabacion-video" src={fase.url} controls loop muted playsInline aria-label={`Grabación del paso ${fase.paso.numero}`} />
          <p className="campo-ayuda">
            {duracionLegible(fase.ms)} · {pesoLegible(fase.archivo.size)} · {fase.archivo.name}
            {fase.porElTecho ? ' · paró sola, cerca del techo de lo que se puede subir' : ''}
          </p>
          {fase.fase === 'subiendo' ? (
            <div className="editor-grabacion-subida" role="status">
              <progress max={1} value={fase.fraccion} />
              <span>{fase.fraccion < 1 ? `Subiendo… ${Math.round(fase.fraccion * 100)} %` : 'Guardándola en los medios…'}</span>
            </div>
          ) : (
            <div className="editor-simulador-capturas-botones">
              <button type="button" className="consola-boton consola-boton-primario" onClick={() => g.usar(escribirEnElPaso)}>
                <Upload size={14} aria-hidden /> Usar como demostración del paso {fase.paso.numero}
              </button>
              <button type="button" className="consola-boton" onClick={g.descartar}>
                <Trash2 size={14} aria-hidden /> Descartar
              </button>
            </div>
          )}
        </>
      ) : null}

      {g.aviso ? (
        <p className="editor-grabacion-aviso" role="status">
          {g.aviso}
        </p>
      ) : null}
      {g.error ? <p className="campo-error">{g.error}</p> : null}
    </section>
  )
}
