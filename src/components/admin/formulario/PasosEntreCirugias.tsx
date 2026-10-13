'use client'

import { useRef, useState } from 'react'
import { ClipboardPaste, Copy, Download, FileUp, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAvisos } from '@/components/ui/Avisos'
import {
  empaquetarPasos,
  esPasosCopiados,
  nombreDeArchivoDePasos,
  pegarPasos,
  type PasosCopiados,
} from '@/lib/pasosCopiados'
import {
  copiarAlPortapapeles,
  leerDelPortapapeles,
  vaciarElPortapapeles,
} from '@/lib/portapapelesDePasos'

type Fila = Record<string, unknown>

/**
 * Copiar y pegar pasos entre cirugías (petición de Cristóbal).
 *
 * «Muchos de los pasos se van a repetir entre una cirugía y otra: el
 * posicionamiento, el abordaje.» Se copian desde un caso, se abre otro y se pegan.
 * Lo copiado vive en el navegador (`portapapelesDePasos.ts`) y sobrevive a cambiar
 * de ficha; para llevarlo a otro ordenador se guarda en un archivo y se carga allí.
 *
 * El diálogo hace las cuatro cosas que hacen falta y nada más: elegir qué pasos
 * copiar, ver lo que hay copiado, pegarlo (al principio o tras el paso que se
 * mira) y duplicar el paso actual de un solo clic.
 */
export function PasosEntreCirugias({
  nombreDelCaso,
  pasos,
  indiceActual,
  nodosDelModelo,
  alPegar,
}: {
  nombreDelCaso: string
  pasos: Fila[]
  indiceActual: number
  /** Los objetos del modelo abierto, para adaptar «piezas que se ven». `null` si todavía no cargó. */
  nodosDelModelo: () => string[] | null
  /** Recibe los pasos ya con lo pegado y la posición del primero que se pegó. */
  alPegar: (pasos: Fila[], primero: number) => void
}) {
  const avisar = useAvisos()
  const [abierto, setAbierto] = useState(false)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [copiado, setCopiado] = useState<PasosCopiados | null>(null)
  const [error, setError] = useState<string | null>(null)
  const entradaDeArchivo = useRef<HTMLInputElement>(null)

  const abrir = () => {
    setCopiado(leerDelPortapapeles())
    setElegidos(new Set([indiceActual]))
    setError(null)
    setAbierto(true)
  }

  const alternar = (i: number) =>
    setElegidos((previos) => {
      const nuevos = new Set(previos)
      if (nuevos.has(i)) nuevos.delete(i)
      else nuevos.add(i)
      return nuevos
    })

  const copiar = () => {
    if (elegidos.size === 0) return
    const copia = empaquetarPasos(pasos, [...elegidos], nombreDelCaso)
    if (!copiarAlPortapapeles(copia)) {
      setError('Este navegador no deja guardar lo copiado. Use «Guardar en un archivo» para llevarlo a otro caso.')
      return
    }
    setCopiado(copia)
    setError(null)
    avisar(
      'ok',
      `${copia.pasos.length === 1 ? 'Se copió 1 paso' : `Se copiaron ${copia.pasos.length} pasos`}. Abra la otra cirugía y use «Pegar».`,
    )
  }

  const pegar = (despuesDe: number) => {
    if (!copiado) return
    const r = pegarPasos(pasos, copiado, despuesDe, nodosDelModelo())
    alPegar(r.pasos, r.primero)
    avisar(
      r.avisos.length > 0 ? 'atencion' : 'ok',
      `${r.pegados === 1 ? 'Se pegó 1 paso' : `Se pegaron ${r.pegados} pasos`}.${r.avisos.length > 0 ? ` ${r.avisos.join(' ')}` : ''}`,
    )
    setAbierto(false)
  }

  const duplicar = () => {
    const paso = pasos[indiceActual]
    if (!paso) return
    const copia = empaquetarPasos(pasos, [indiceActual], nombreDelCaso)
    const r = pegarPasos(pasos, copia, indiceActual, nodosDelModelo())
    alPegar(r.pasos, r.primero)
    avisar('ok', 'Se duplicó el paso.')
    setAbierto(false)
  }

  const guardarEnArchivo = () => {
    if (!copiado) return
    const archivo = new Blob([JSON.stringify(copiado, null, 2)], { type: 'application/json' })
    const direccion = URL.createObjectURL(archivo)
    const enlace = document.createElement('a')
    enlace.href = direccion
    enlace.download = nombreDeArchivoDePasos(copiado.desdeElCaso)
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    // Se suelta después: el navegador necesita la dirección un instante para empezar la descarga.
    window.setTimeout(() => URL.revokeObjectURL(direccion), 2000)
  }

  const cargarDeArchivo = async (archivo: File | undefined) => {
    if (!archivo) return
    try {
      const valor: unknown = JSON.parse(await archivo.text())
      if (!esPasosCopiados(valor)) {
        setError('Ese archivo no es de pasos copiados de TraumaHub.')
        return
      }
      if (!copiarAlPortapapeles(valor)) {
        setError('Este navegador no deja guardar lo copiado.')
        return
      }
      setCopiado(valor)
      setError(null)
    } catch {
      setError('No se pudo leer ese archivo.')
    }
  }

  return (
    <>
      <button
        type="button"
        className="consola-boton"
        onClick={abrir}
        aria-label="Copiar y pegar pasos entre cirugías"
        title="Copiar y pegar pasos entre cirugías"
      >
        <Copy size={14} aria-hidden />
        <ClipboardPaste size={14} aria-hidden />
      </button>

      {abierto ? (
        <Modal titulo="Pasos entre cirugías" onCerrar={() => setAbierto(false)} error={error} ancho="ancho">
          <div className="pasos-entre-cirugias">
            <section aria-labelledby="pec-copiar">
              <h3 id="pec-copiar">Copiar pasos de «{nombreDelCaso || 'este caso'}»</h3>
              <p className="campo-ayuda">
                Marque los que quiere llevar a otra cirugía: el posicionamiento, el abordaje… Se copian con su texto,
                su objetivo, sus rangos, el instrumento y la fase.
              </p>
              <ul className="pec-lista">
                {pasos.map((paso, i) => (
                  <li key={String(paso._clave ?? paso.id ?? i)}>
                    <label>
                      <input type="checkbox" checked={elegidos.has(i)} onChange={() => alternar(i)} />
                      <span>
                        <strong>{i + 1}.</strong> {typeof paso.titulo === 'string' && paso.titulo ? paso.titulo : '(sin título)'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="pec-acciones">
                <button type="button" className="admin-btn admin-btn-primary" onClick={copiar} disabled={elegidos.size === 0}>
                  <Copy size={14} aria-hidden /> Copiar {elegidos.size} {elegidos.size === 1 ? 'paso' : 'pasos'}
                </button>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={duplicar} disabled={pasos.length === 0}>
                  Duplicar el paso {indiceActual + 1}
                </button>
              </div>
            </section>

            <section aria-labelledby="pec-pegar">
              <h3 id="pec-pegar">Pegar</h3>
              {copiado ? (
                <>
                  <p>
                    Hay <strong>{copiado.pasos.length}</strong> {copiado.pasos.length === 1 ? 'paso copiado' : 'pasos copiados'}{' '}
                    de «{copiado.desdeElCaso || 'otro caso'}»:
                  </p>
                  <ol className="pec-copiados">
                    {copiado.pasos.map((p, i) => (
                      <li key={i}>{typeof p.titulo === 'string' && p.titulo ? p.titulo : '(sin título)'}</li>
                    ))}
                  </ol>
                  <div className="pec-acciones">
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary"
                      onClick={() => pegar(indiceActual)}
                      disabled={pasos.length === 0}
                    >
                      <ClipboardPaste size={14} aria-hidden /> Pegar después del paso {indiceActual + 1}
                    </button>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => pegar(-1)}>
                      Pegar al principio
                    </button>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => pegar(pasos.length - 1)}>
                      Pegar al final
                    </button>
                  </div>
                  <div className="pec-acciones">
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={guardarEnArchivo}>
                      <Download size={14} aria-hidden /> Guardar en un archivo
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={() => {
                        vaciarElPortapapeles()
                        setCopiado(null)
                      }}
                    >
                      <Trash2 size={14} aria-hidden /> Descartar lo copiado
                    </button>
                  </div>
                </>
              ) : (
                <p className="campo-ayuda">
                  No hay nada copiado todavía. Copie pasos de otra cirugía, o cargue un archivo guardado desde otro
                  ordenador.
                </p>
              )}
              <div className="pec-acciones">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => entradaDeArchivo.current?.click()}>
                  <FileUp size={14} aria-hidden /> Cargar de un archivo
                </button>
                <input
                  ref={entradaDeArchivo}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    void cargarDeArchivo(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
            </section>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
