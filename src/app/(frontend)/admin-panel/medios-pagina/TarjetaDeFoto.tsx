'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ImageUp, RotateCcw, Upload, X } from 'lucide-react'
import { restaurarFotoDeLaPagina, retirarFotosAnteriores } from '@/app/(frontend)/acciones/mediosPagina'
import { subidorQueAvisa } from '@/admin/subidas'
import { IMAGENES_DE_PARTIDA } from '@/components/portada/imagenes'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import { TIPOS_DE_FOTO, problemaDeLaFoto, type EspacioDeFoto } from '@/lib/espaciosDeLaPagina'
import type { FotoSubida } from '@/lib/mediosDeLaPagina'

type Estado = 'quieto' | 'subiendo' | 'procesando' | 'restaurando'

// Con la zona fijada: la tarjeta es de cliente y se pinta dos veces, en el
// servidor y en el navegador, y con dos zonas una subida de cerca de la
// medianoche hidrataba con dos días distintos (ver `impresion.ts`).
const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : ''

/**
 * Una foto de la página: la que se ve hoy, y cambiarla o volver a la original.
 *
 * Cambiarla es elegir —o arrastrar— un archivo, verlo en el sitio de la actual
 * antes de que viaje, escribir qué se ve y guardar. La vista previa sale del
 * propio archivo (`URL.createObjectURL`), no de una subida a medias: hasta que
 * se pulsa «Guardar la foto» no se ha mandado nada, y «Cancelar» no deja restos
 * en el servidor.
 *
 * `alSuciar` le dice al panel si hay una foto elegida sin guardar, para que la
 * barra lateral y Atrás pregunten antes de salir.
 */
export function TarjetaDeFoto({
  espacio,
  vigente,
  alSuciar,
}: {
  espacio: EspacioDeFoto
  vigente: FotoSubida | null
  alSuciar: (clave: string, sucia: boolean) => void
}) {
  const router = useRouter()
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const entrada = useRef<HTMLInputElement>(null)
  const [elegida, setElegida] = useState<{ archivo: File; vista: string } | null>(null)
  const [alt, setAlt] = useState(vigente?.alt ?? espacio.descripcion)
  const [estado, setEstado] = useState<Estado>('quieto')
  const [avance, setAvance] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const original = IMAGENES_DE_PARTIDA[espacio.original]
  const ocupada = estado !== 'quieto'

  // La dirección temporal de la vista previa ocupa memoria hasta que se
  // suelta; con una foto de 8 MB elegida y cambiada varias veces se nota.
  useEffect(() => {
    if (!elegida) return
    return () => URL.revokeObjectURL(elegida.vista)
  }, [elegida])

  useEffect(() => {
    alSuciar(espacio.id, elegida !== null)
    return () => alSuciar(espacio.id, false)
  }, [alSuciar, espacio.id, elegida])

  const elegir = (archivo: File | undefined) => {
    if (!archivo || ocupada) return
    const problema = problemaDeLaFoto({ tipo: archivo.type, bytes: archivo.size })
    if (problema) {
      setError(problema)
      return
    }
    setError(null)
    setElegida({ archivo, vista: URL.createObjectURL(archivo) })
  }

  const cancelar = () => {
    setElegida(null)
    setError(null)
    setAlt(vigente?.alt ?? espacio.descripcion)
  }

  const guardar = async () => {
    if (!elegida) return
    const descripcion = alt.trim()
    if (!descripcion) {
      setError('Escriba qué se ve en la foto: es lo único que llega de ella a quien no la ve.')
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Sin conexión a internet. La foto sigue elegida: vuelva a pulsar «Guardar la foto» cuando vuelva la red.')
      return
    }
    setEstado('subiendo')
    setAvance(0)
    setError(null)

    const formulario = new FormData()
    formulario.set('coleccion', 'medios-pagina')
    formulario.set('archivo', elegida.archivo)
    formulario.set('espacio', espacio.id)
    formulario.set('alt', descripcion)
    const respuesta = await subidorQueAvisa((fraccion) => {
      setAvance(fraccion)
      if (fraccion >= 1) setEstado('procesando')
    })(formulario)

    if (!respuesta.exito) {
      setEstado('quieto')
      setError(respuesta.mensaje ?? 'No se pudo subir la foto.')
      return
    }
    // Si retirar las anteriores falla no se dice nada: la nueva ya es la que se
    // ve y la única que se sirve, y las viejas se retiran en la próxima subida.
    await retirarFotosAnteriores(espacio.id).catch(() => null)
    setElegida(null)
    setEstado('quieto')
    avisar('ok', `«${espacio.nombre}» cambiada. Ya se ve en la página.`)
    router.refresh()
  }

  const restaurar = async () => {
    const si = await confirmar({
      titulo: '¿Volver a la foto original?',
      mensaje: 'La foto subida se borra del servidor y vuelve a verse la captura del atlas con que parte la página.',
      confirmar: 'Restaurar la original',
      peligro: true,
    })
    if (!si) return
    setEstado('restaurando')
    const respuesta = await restaurarFotoDeLaPagina(espacio.id)
    setEstado('quieto')
    if (!respuesta.exito) {
      setError(respuesta.mensaje ?? 'No se pudo restaurar la foto.')
      return
    }
    setAlt(espacio.descripcion)
    avisar('ok', `«${espacio.nombre}» volvió a la original.`)
    router.refresh()
  }

  const insignia = elegida
    ? { clase: 'insignia-atencion', texto: 'Vista previa, sin guardar' }
    : vigente
      ? { clase: 'insignia-info', texto: 'Cambiada' }
      : { clase: 'insignia-neutra', texto: 'Original' }

  return (
    <article
      className={`admin-card mp-foto${arrastrando ? ' mp-foto-arrastrando' : ''}`}
      onDragOver={(e) => {
        if (ocupada) return
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastrando(false)
        elegir(e.dataTransfer.files?.[0])
      }}
    >
      <div className="mp-foto-marco">
        {elegida ? (
          // Del propio archivo, sin pasar por el optimizador: no está en el
          // servidor todavía.
          <Image src={elegida.vista} alt="" fill unoptimized sizes="360px" className="mp-foto-imagen" />
        ) : (
          <ImagenConCarga
            key={vigente?.id ?? 'original'}
            src={vigente?.src ?? original}
            respaldo={original}
            alt={vigente?.alt ?? espacio.descripcion}
            ancho={vigente?.ancho ?? undefined}
            alto={vigente?.alto ?? undefined}
            sizes="(max-width: 700px) 100vw, 360px"
            className="mp-foto-imagen"
          />
        )}
        <span className={`insignia ${insignia.clase} mp-foto-insignia`}>{insignia.texto}</span>
        {arrastrando ? (
          <span className="mp-foto-soltar" aria-hidden>
            <ImageUp size={28} /> Suelte la foto aquí
          </span>
        ) : null}
      </div>

      <div className="mp-foto-cuerpo">
        <h3 className="mp-foto-titulo">{espacio.nombre}</h3>
        <p className="admin-form-hint">{espacio.recomendado}</p>
        {espacio.ayuda ? <p className="admin-form-hint">{espacio.ayuda}</p> : null}
        {vigente && !elegida ? <p className="mp-fecha">Subida el {fecha(vigente.subidaEn)}</p> : null}

        {elegida ? (
          <div className="mp-foto-guardar">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor={`alt-${espacio.id}`}>
                Qué se ve en la foto
              </label>
              <input
                id={`alt-${espacio.id}`}
                className="admin-form-input"
                value={alt}
                maxLength={200}
                onChange={(e) => setAlt(e.target.value)}
                disabled={ocupada}
              />
              <p className="admin-form-hint">Lo lee el lector de pantalla en lugar de la foto.</p>
            </div>
            {estado === 'subiendo' || estado === 'procesando' ? (
              <div role="status" aria-live="polite">
                <progress className="admin-progreso-nativo" max={1} value={avance} />
                <p className="admin-form-hint">
                  {estado === 'procesando' ? 'Guardando en el servidor…' : `Subiendo… ${Math.round(avance * 100)} %`}
                </p>
              </div>
            ) : null}
            <div className="admin-acciones">
              <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={guardar} disabled={ocupada}>
                <Upload size={15} aria-hidden /> Guardar la foto
              </button>
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={cancelar} disabled={ocupada}>
                <X size={15} aria-hidden /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-acciones">
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => entrada.current?.click()}
              disabled={ocupada}
            >
              <ImageUp size={15} aria-hidden /> Cambiar la foto
            </button>
            {vigente ? (
              <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" onClick={restaurar} disabled={ocupada}>
                <RotateCcw size={15} aria-hidden /> {estado === 'restaurando' ? 'Restaurando…' : 'Restaurar la original'}
              </button>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="mp-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <input
        ref={entrada}
        type="file"
        hidden
        accept={TIPOS_DE_FOTO.join(',')}
        onChange={(e) => {
          elegir(e.target.files?.[0])
          // Sin esto, volver a elegir el mismo archivo tras cancelar no dispara
          // `change` y el botón parece no hacer nada.
          e.target.value = ''
        }}
      />
    </article>
  )
}
