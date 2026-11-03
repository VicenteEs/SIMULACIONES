'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Save } from 'lucide-react'
import { guardarTextosDeLaPagina, restaurarTextoDeLaPagina } from '@/app/(frontend)/acciones/mediosPagina'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { MARCAS_DE_CIFRA, normalizarTexto, problemaDelTexto, type EspacioDeTexto } from '@/lib/espaciosDeLaPagina'

/**
 * Los textos de una sección de la página, en un formulario que se guarda
 * entero (P-007 E2).
 *
 * Por sección y no campo a campo: un titular y su bajada se escriben juntos y
 * se leen juntos, y guardar cada tecla por separado dejaría la portada a medio
 * cambiar mientras se escribe. Cada campo lleva su contador, su original a la
 * vista cuando se aparta de él, y la misma regla que aplica el servidor
 * (`problemaDelTexto`), para que el aviso salga mientras se escribe y no al
 * guardar.
 */
export function SeccionDeTextos({
  clave,
  titulo,
  espacios,
  actuales,
  alSuciar,
}: {
  clave: string
  titulo: string
  espacios: readonly EspacioDeTexto[]
  /** El texto guardado de cada espacio cambiado; los que no están, valen su original. */
  actuales: Record<string, string>
  alSuciar: (clave: string, sucia: boolean) => void
}) {
  const router = useRouter()
  const avisar = useAvisos()
  const confirmar = useConfirmar()
  const guardados = useMemo(
    () => Object.fromEntries(espacios.map((e) => [e.id, actuales[e.id] ?? e.original])) as Record<string, string>,
    [espacios, actuales],
  )
  const [valores, setValores] = useState(guardados)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lo guardado cambió por fuera (se restauró un texto, o `router.refresh`
  // trajo lo que escribió otro administrador): se adopta, salvo en los campos
  // que se están editando, que no se pisan.
  const [base, setBase] = useState(guardados)
  if (base !== guardados) {
    setBase(guardados)
    setValores((antes) =>
      Object.fromEntries(espacios.map((e) => [e.id, antes[e.id] !== base[e.id] ? antes[e.id] : guardados[e.id]])),
    )
  }

  const sucios = espacios.filter((e) => normalizarTexto(e, valores[e.id] ?? '') !== normalizarTexto(e, guardados[e.id]))
  const problemas = Object.fromEntries(
    espacios.map((e) => [e.id, problemaDelTexto(e, normalizarTexto(e, valores[e.id] ?? ''))]),
  ) as Record<string, string | null>
  const hayProblemas = sucios.some((e) => problemas[e.id])

  useEffect(() => {
    alSuciar(clave, sucios.length > 0)
    return () => alSuciar(clave, false)
  }, [alSuciar, clave, sucios.length])

  const guardar = async () => {
    if (sucios.length === 0 || hayProblemas) return
    setGuardando(true)
    setError(null)
    const respuesta = await guardarTextosDeLaPagina(sucios.map((e) => ({ espacio: e.id, texto: valores[e.id] ?? '' })))
    setGuardando(false)
    if (!respuesta.exito) {
      setError(respuesta.mensaje ?? 'No se pudieron guardar los textos.')
      return
    }
    avisar('ok', `«${titulo}» guardada. Ya se ve en la página.`)
    router.refresh()
  }

  const restaurar = async (espacio: EspacioDeTexto) => {
    const si = await confirmar({
      titulo: '¿Volver al texto original?',
      mensaje: 'Se pierde lo escrito en este campo y vuelve el texto con que parte la página.',
      confirmar: 'Restaurar el original',
    })
    if (!si) return
    const respuesta = await restaurarTextoDeLaPagina(espacio.id)
    if (!respuesta.exito) {
      setError(respuesta.mensaje ?? 'No se pudo restaurar el texto.')
      return
    }
    setValores((antes) => ({ ...antes, [espacio.id]: espacio.original }))
    avisar('ok', `«${espacio.nombre}» volvió al original.`)
    router.refresh()
  }

  return (
    <section className="admin-card mp-seccion" aria-labelledby={`titulo-${clave}`}>
      <header className="mp-seccion-cabecera">
        <h3 id={`titulo-${clave}`} className="mp-seccion-titulo">
          {titulo}
        </h3>
        {sucios.length > 0 ? (
          <span className="insignia insignia-atencion">
            {sucios.length === 1 ? '1 cambio sin guardar' : `${sucios.length} cambios sin guardar`}
          </span>
        ) : null}
      </header>

      {espacios.map((espacio) => {
        const id = `texto-${espacio.id}`
        const valor = valores[espacio.id] ?? ''
        const largo = [...normalizarTexto(espacio, valor)].length
        const cambiado = espacio.id in actuales
        const problema = problemas[espacio.id]
        const conCifra = espacio.original.includes(MARCAS_DE_CIFRA.piezas)
        const Campo = espacio.forma === 'parrafo' ? 'textarea' : 'input'
        return (
          <div key={espacio.id} className="admin-form-group mp-campo">
            <div className="mp-campo-cabecera">
              <label className="admin-form-label" htmlFor={id}>
                {espacio.nombre}
                {espacio.opcional ? <span className="mp-opcional"> · opcional</span> : null}
              </label>
              {cambiado ? <span className="insignia insignia-info">Cambiado</span> : null}
              <span className={`mp-contador${largo > espacio.maximo ? ' mp-contador-pasado' : ''}`} aria-live="polite">
                {largo} / {espacio.maximo}
              </span>
            </div>
            <Campo
              id={id}
              className="admin-form-input"
              value={valor}
              {...(espacio.forma === 'parrafo' ? { rows: Math.min(6, Math.max(2, Math.ceil(espacio.maximo / 110))) } : {})}
              {...(espacio.forma === 'correo' ? { type: 'email', autoComplete: 'email' } : {})}
              aria-invalid={problema ? true : undefined}
              aria-describedby={problema ? `${id}-problema` : undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setValores((antes) => ({ ...antes, [espacio.id]: e.target.value }))
              }
            />
            {problema ? (
              <p id={`${id}-problema`} className="mp-error">
                {problema}
              </p>
            ) : null}
            {espacio.ayuda ? <p className="admin-form-hint">{espacio.ayuda}</p> : null}
            {conCifra ? (
              <p className="admin-form-hint">
                «{MARCAS_DE_CIFRA.piezas}» se cambia por el número de piezas del atlas, contado al pintar la página.
              </p>
            ) : null}
            {cambiado ? (
              <div className="mp-original">
                <p>
                  <span className="mp-original-rotulo">Original:</span> {espacio.original || <em>vacío</em>}
                </p>
                <button type="button" className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => restaurar(espacio)}>
                  <RotateCcw size={14} aria-hidden /> Restaurar el original
                </button>
              </div>
            ) : null}
          </div>
        )
      })}

      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-acciones mp-seccion-acciones">
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={guardar}
          disabled={guardando || sucios.length === 0 || hayProblemas}
        >
          <Save size={16} aria-hidden /> {guardando ? 'Guardando…' : 'Guardar la sección'}
        </button>
        {sucios.length > 0 && !guardando ? (
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setValores(guardados)}>
            Descartar los cambios
          </button>
        ) : null}
      </div>
    </section>
  )
}
