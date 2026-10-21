'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ScanLine, Trash2 } from 'lucide-react'
import { ruta } from '@/lib/rutas'
import { pngConTextos } from '@/lib/pngConMetadatos'
import {
  ALTO_DE_LA_LAMINA,
  ANCHO_DE_LA_LAMINA,
  MAXIMO_DE_TOMAS,
  SUGERENCIAS_DE_INTERVENCION,
  TOPES_DE_LOS_DATOS,
  dibujarLaLamina,
  fechaParaLaLamina,
  limpiarLosDatos,
  nombreDelArchivo,
  textosDeLosMetadatos,
  type DatosDeLaLamina,
} from '@/lib/laminaPostoperatoria'
import { KV_INICIAL, KV_MAXIMO, KV_MINIMO, CONTRASTE_MAXIMO, CONTRASTE_MINIMO, PROYECCIONES_DE_FLUOROSCOPIA, type AjustesDeLaImagen, type ProyeccionDeFluoroscopia } from '@/lib/radiografia'

/**
 * La radiografía postoperatoria (P-004 E11, pedido 17 de Cristóbal).
 *
 * Al terminar la cirugía se toman una o más radiografías de lo que quedó en la escena —las mismas que sabe hacer la
 * fluoroscopia, pero rectangulares y en positivo— y se arma la lámina que se presenta en la reunión clínica: fondo negro, el
 * caso, el diagnóstico, la intervención, el cirujano y la fecha, con el logotipo. **Sin los insumos ni el puntaje** (Q4): es
 * una imagen para mostrar, no el informe de la simulación.
 *
 * La toma la hace quien monta este panel (`tomar`): aquí solo se elige la proyección y se revelan los datos. Lo escrito se
 * entrega con `alGuardar` al descargar, para que viaje con el recorrido.
 */

interface Toma {
  etiqueta: string
  /** El lienzo con la placa revelada: es lo que se dibuja en la lámina. */
  lienzo: HTMLCanvasElement
  /** La misma imagen para la miniatura. */
  url: string
}

export function RadiografiaPostoperatoria({
  caso,
  diagnosticoInicial,
  cirujanoInicial,
  intervencionInicial,
  tomar,
  alGuardar,
  alCerrar,
}: {
  /** El nombre del caso, que va en la lámina. */
  caso: string
  /** La fractura, autocompletada con la clasificación y el hueso del caso. */
  diagnosticoInicial: string
  /** El nombre de quien opera, de su cuenta; se corrige a mano. */
  cirujanoInicial: string
  /** Propuesta según lo usado en el recorrido (`intervencionPropuesta`). */
  intervencionInicial: string
  /** Hace la toma en el lienzo dado; `false` si no pudo (la escena no cargó). */
  tomar: (destino: HTMLCanvasElement, proyeccion: ProyeccionDeFluoroscopia, zoom: number, ajustes: Partial<AjustesDeLaImagen>) => boolean
  alGuardar: (datos: DatosDeLaLamina) => void
  alCerrar: () => void
}) {
  const [proyeccion, setProyeccion] = useState<ProyeccionDeFluoroscopia>('ap')
  const [zoom, setZoom] = useState(1)
  const [kv, setKv] = useState(KV_INICIAL)
  const [contraste, setContraste] = useState(1)
  const [tomas, setTomas] = useState<Toma[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  const [cirujano, setCirujano] = useState(cirujanoInicial)
  const [diagnostico, setDiagnostico] = useState(diagnosticoInicial)
  const [intervencion, setIntervencion] = useState(intervencionInicial)
  const [equipo, setEquipo] = useState('')
  const [fecha] = useState(() => fechaParaLaLamina())

  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const lienzoDeLaLamina = useRef<HTMLCanvasElement>(null)

  // El logotipo se carga una vez. Si no llega, la lámina lleva el nombre escrito y se puede descargar igual.
  useEffect(() => {
    const imagen = new Image()
    imagen.onload = () => setLogo(imagen)
    imagen.src = ruta('/logo-hd.png')
  }, [])

  const datos = useMemo(
    () => limpiarLosDatos({ caso, diagnostico, intervencion, cirujano, fecha, equipo }),
    [caso, diagnostico, intervencion, cirujano, fecha, equipo],
  )

  // La vista previa es la propia lámina, a su tamaño real: lo que se ve es lo que se descarga.
  useEffect(() => {
    const lienzo = lienzoDeLaLamina.current
    const ctx = lienzo?.getContext('2d')
    if (!lienzo || !ctx) return
    dibujarLaLamina(
      ctx,
      datos,
      tomas.map((t) => ({ imagen: t.lienzo, etiqueta: t.etiqueta })),
      logo,
    )
  }, [datos, tomas, logo])

  const hacerLaToma = () => {
    if (tomas.length >= MAXIMO_DE_TOMAS) {
      setAviso(`Caben ${MAXIMO_DE_TOMAS} radiografías en la lámina: quite una para tomar otra.`)
      return
    }
    const lienzo = document.createElement('canvas')
    const hecha = tomar(lienzo, proyeccion, zoom, { kv, contraste })
    if (!hecha) {
      setAviso('No se pudo tomar la radiografía: la escena todavía no está lista.')
      return
    }
    const etiqueta = PROYECCIONES_DE_FLUOROSCOPIA.find((p) => p.valor === proyeccion)?.etiqueta ?? proyeccion
    setTomas((actuales) => [...actuales, { etiqueta, lienzo, url: lienzo.toDataURL('image/png') }])
    setAviso(null)
  }

  const descargar = () => {
    const lienzo = lienzoDeLaLamina.current
    if (!lienzo) return
    lienzo.toBlob(async (blob) => {
      if (!blob) {
        setAviso('No se pudo generar la imagen.')
        return
      }
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const png = pngConTextos(bytes, textosDeLosMetadatos(datos))
        const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }))
        const enlace = document.createElement('a')
        enlace.href = url
        enlace.download = nombreDelArchivo(datos)
        enlace.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        alGuardar(datos)
        setAviso('Lámina descargada. Los datos quedaron guardados con su recorrido.')
      } catch (error) {
        console.error('[radiografía] no se pudo armar la lámina:', error)
        setAviso('No se pudo armar la lámina. Vuelva a intentarlo.')
      }
    }, 'image/png')
  }

  return (
    <section className="radiografia-post" aria-label="Radiografía postoperatoria">
      <div className="radiografia-post-cabecera">
        <h3 className="consola-subtitulo">
          <ScanLine size={16} aria-hidden /> Radiografía postoperatoria
        </h3>
        <button type="button" className="consola-boton" onClick={alCerrar}>
          Cerrar
        </button>
      </div>

      <div className="consola-submodo" role="group" aria-label="Proyección de la radiografía">
        {PROYECCIONES_DE_FLUOROSCOPIA.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={`consola-submodo-boton${proyeccion === p.valor ? ' activo' : ''}`}
            aria-pressed={proyeccion === p.valor}
            title={p.ayuda}
            onClick={() => setProyeccion(p.valor)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <label className="consola-deslizador">
        <span className="consola-deslizador-cabeza">
          <span>Zoom</span>
          <output className="u-num">{zoom.toFixed(1).replace('.', ',')}×</output>
        </span>
        <input type="range" min={0.6} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <label className="consola-deslizador">
        <span className="consola-deslizador-cabeza">
          <span>Penetración</span>
          <output className="u-num">{kv} kV</output>
        </span>
        <input type="range" min={KV_MINIMO} max={KV_MAXIMO} step={1} value={kv} onChange={(e) => setKv(Number(e.target.value))} />
      </label>
      <label className="consola-deslizador">
        <span className="consola-deslizador-cabeza">
          <span>Contraste</span>
          <output className="u-num">{contraste.toFixed(1).replace('.', ',')}</output>
        </span>
        <input
          type="range"
          min={CONTRASTE_MINIMO}
          max={CONTRASTE_MAXIMO}
          step={0.1}
          value={contraste}
          onChange={(e) => setContraste(Number(e.target.value))}
        />
      </label>
      <button type="button" className="consola-aplicar" onClick={hacerLaToma}>
        <ScanLine size={16} aria-hidden /> Tomar radiografía ({tomas.length}/{MAXIMO_DE_TOMAS})
      </button>

      {tomas.length > 0 ? (
        <ul className="radiografia-post-tomas" aria-label="Radiografías tomadas">
          {tomas.map((t, i) => (
            <li key={`${t.etiqueta}-${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- una miniatura generada en el navegador, sin servidor que la optimice */}
              <img src={t.url} alt={`Radiografía ${t.etiqueta}`} />
              <span>{t.etiqueta}</span>
              <button
                type="button"
                className="consola-boton"
                aria-label={`Quitar la radiografía ${t.etiqueta}`}
                onClick={() => setTomas((actuales) => actuales.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="consola-ayuda">Elija la proyección y toque «Tomar radiografía». Puede tomar hasta {MAXIMO_DE_TOMAS}: de frente, de lado y oblicua.</p>
      )}

      <div className="radiografia-post-datos">
        <label>
          <span>Cirujano (Dr.)</span>
          <input type="text" value={cirujano} maxLength={TOPES_DE_LOS_DATOS.cirujano} onChange={(e) => setCirujano(e.target.value)} placeholder="Nombre y apellido" />
        </label>
        <label>
          <span>Fractura</span>
          <input type="text" value={diagnostico} maxLength={TOPES_DE_LOS_DATOS.diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
        </label>
        <label>
          <span>Intervención</span>
          <input
            type="text"
            list="radiografia-post-intervenciones"
            value={intervencion}
            maxLength={TOPES_DE_LOS_DATOS.intervencion}
            onChange={(e) => setIntervencion(e.target.value)}
          />
          <datalist id="radiografia-post-intervenciones">
            {SUGERENCIAS_DE_INTERVENCION.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Equipo (opcional)</span>
          <input type="text" value={equipo} maxLength={TOPES_DE_LOS_DATOS.equipo} onChange={(e) => setEquipo(e.target.value)} />
        </label>
        <p className="consola-ayuda">Fecha: {fecha}. La lámina no lleva los insumos ni el puntaje.</p>
      </div>

      <canvas
        ref={lienzoDeLaLamina}
        className="radiografia-post-lamina"
        width={ANCHO_DE_LA_LAMINA}
        height={ALTO_DE_LA_LAMINA}
        role="img"
        aria-label="Vista previa de la lámina"
      />
      <button type="button" className="consola-aplicar" onClick={descargar} disabled={tomas.length === 0}>
        <Download size={16} aria-hidden /> Descargar lámina (PNG)
      </button>
      {aviso ? (
        <p className="consola-ayuda" role="status">
          {aviso}
        </p>
      ) : null}
    </section>
  )
}
