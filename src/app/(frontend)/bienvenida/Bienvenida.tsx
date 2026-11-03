'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, CircleAlert, CircleCheck, Loader2, MessageSquare, RotateCcw } from 'lucide-react'
import { cerrarLaBienvenida } from '@/app/(frontend)/acciones/bienvenida'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import type { ClaveDeRecorrido, Recorrido } from '@/lib/bienvenida'

/**
 * Los dos pasos de la bienvenida. El tercero de la barra de progreso es el
 * propio módulo: «Empezar mi recorrido» lleva a él, y es ahí donde el recorrido
 * empieza de verdad. Por eso el segundo paso dice «2 de 3» y no hay pantalla
 * que diga «3 de 3», como en el tablero de Penpot, donde el botón del segundo
 * paso ya es el de empezar.
 *
 * El primer paso no estaba en Penpot como tablero y es lo mínimo para que el
 * segundo no llegue de la nada: lo que cuenta la portada del residente y de
 * dónde salen sus números, que es lo que nadie explica el primer día.
 */
export function Bienvenida({ nombre, recorridos }: { nombre: string; recorridos: Recorrido[] }) {
  const router = useRouter()
  // Sin recorridos —una cuenta a la que aún no se le asignó ningún módulo— el
  // segundo paso no tendría qué ofrecer: se queda en el primero y su botón
  // lleva a la portada, que explica que faltan módulos.
  const hayEleccion = recorridos.length > 0
  const [paso, setPaso] = useState<1 | 2>(1)
  const [elegido, setElegido] = useState<ClaveDeRecorrido | null>(recorridos[0]?.clave ?? null)
  const [enviando, setEnviando] = useState<'empezar' | 'saltar' | null>(null)
  const [error, setError] = useState('')
  const titular = useRef<HTMLHeadingElement>(null)
  const montado = useRef(false)

  // Al cambiar de paso el foco va al titular nuevo, como en el registro: el
  // botón que se pulsó desaparece, y sin esto el foco caía en `<body>`.
  useEffect(() => {
    if (!montado.current) {
      montado.current = true
      return
    }
    titular.current?.focus()
  }, [paso])

  async function cerrar(recorrido: ClaveDeRecorrido | null) {
    setError('')
    setEnviando(recorrido === null ? 'saltar' : 'empezar')
    try {
      const resultado = await cerrarLaBienvenida(recorrido)
      if (!resultado.exito || !resultado.datos) {
        setError(resultado.mensaje ?? 'No se pudo guardar la elección.')
        setEnviando(null)
        return
      }
      // `refresh` además de `push`, como `FormularioEntrar`: la portada es de
      // servidor y sin él podría salir la versión que el enrutador guardó.
      router.push(resultado.datos.destino)
      router.refresh()
    } catch {
      setError('No se pudo conectar con el servidor. Revise la conexión y vuelva a intentarlo.')
      setEnviando(null)
    }
  }

  const ocupado = enviando !== null

  return (
    <section className="bv-tarjeta" aria-labelledby="bv-titulo">
      <div className="bv-progreso" aria-hidden="true">
        <span data-hecho="true" />
        <span data-hecho={paso === 2 ? 'true' : undefined} />
        <span />
      </div>
      <p className="bv-paso">Paso {paso} de 3</p>

      {paso === 1 ? (
        <>
          <h1 id="bv-titulo" ref={titular} tabIndex={-1}>
            {nombre ? `Hola, ${nombre}` : 'Te damos la bienvenida'}
          </h1>
          <p className="bv-bajada">
            Tu cuenta ya está activa. Antes de empezar, tres cosas que conviene saber de la plataforma.
          </p>
          <ul className="bv-consejos">
            <li>
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <strong>Marca como leída cada ficha al terminarla</strong>
                <span>Tu inicio cuenta lo que llevas y lo que te queda por leer.</span>
              </div>
            </li>
            <li>
              <RotateCcw size={20} aria-hidden="true" />
              <div>
                <strong>Retoma donde quedaste</strong>
                <span>«Continúa leyendo» te devuelve a la pestaña o al paso en que ibas.</span>
              </div>
            </li>
            <li>
              <MessageSquare size={20} aria-hidden="true" />
              <div>
                <strong>Comenta lo que no te cuadre</strong>
                <span>Cada ficha tiene su botón «Comentar», y le llega al equipo docente.</span>
              </div>
            </li>
          </ul>
        </>
      ) : (
        <>
          <h1 id="bv-titulo" ref={titular} tabIndex={-1}>
            ¿Por dónde quieres empezar?
          </h1>
          <p className="bv-bajada">
            Elegimos tu primer recorrido según lo que tengas esta semana. Los demás módulos siguen en el menú, para cuando
            los necesites.
          </p>
          {/* Radios de verdad y no botones con `aria-pressed`: es elegir uno de
              varios, y así las flechas y el lector de pantalla hacen lo que
              hacen en cualquier grupo de opciones sin una línea más. */}
          <fieldset className="bv-opciones" aria-labelledby="bv-titulo" disabled={ocupado}>
            {recorridos.map((r) => {
              const identidad = IDENTIDAD_DE_MODULO[r.coleccion]
              const Icono = identidad?.icono ?? BookOpen
              return (
                <label key={r.clave} className={`bv-opcion ${identidad?.clase ?? ''}`}>
                  <input
                    type="radio"
                    name="recorrido"
                    value={r.clave}
                    checked={elegido === r.clave}
                    onChange={() => setElegido(r.clave)}
                  />
                  <Icono size={22} aria-hidden="true" className="bv-opcion-icono" />
                  <span className="bv-opcion-titulo">{r.titulo}</span>
                  <span className="bv-opcion-bajada">{r.bajada}</span>
                  <CircleCheck size={22} aria-hidden="true" className="bv-opcion-marca" />
                </label>
              )
            })}
          </fieldset>
        </>
      )}

      {error ? (
        <p className="bv-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="bv-acciones">
        <button type="button" className="bv-saltar" onClick={() => cerrar(null)} disabled={ocupado}>
          {enviando === 'saltar' ? <Loader2 size={16} aria-hidden="true" className="bv-girando" /> : null}
          Saltar por ahora
        </button>
        {paso === 1 && hayEleccion ? (
          <button type="button" className="boton" onClick={() => setPaso(2)}>
            Continuar
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : paso === 1 ? (
          <button type="button" className="boton" onClick={() => cerrar(null)} disabled={ocupado}>
            Ir a mi inicio
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="boton" onClick={() => cerrar(elegido)} disabled={ocupado || !elegido}>
            {enviando === 'empezar' ? (
              <>
                <Loader2 size={18} aria-hidden="true" className="bv-girando" />
                Abriendo…
              </>
            ) : (
              <>
                Empezar mi recorrido
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>
    </section>
  )
}
