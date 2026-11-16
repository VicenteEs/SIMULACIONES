'use client'

import { useRouter } from 'next/navigation'
import React, { useState, useTransition } from 'react'
import { elegirInstitucionDePrueba } from '@/app/(frontend)/acciones/institucionDePrueba'

/**
 * El selector de la franja de ved (D-396): en qué institución se está mirando.
 *
 * Un campo de texto y no una lista: ved se abre a cualquiera que tenga su
 * dirección, y una lista enseñaría los nombres de todas las instituciones a
 * quien no ha entrado. Quien prueba sabe el subdominio de la que creó.
 */
export function SelectorDeInstitucionDePrueba({ actual }: { actual: { subdominio: string; nombre: string } | null }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [pendiente, iniciar] = useTransition()

  const elegir = (subdominio: string) =>
    iniciar(async () => {
      setError('')
      const respuesta = await elegirInstitucionDePrueba(subdominio)
      if (!respuesta.exito) {
        setError(respuesta.mensaje ?? 'No se pudo cambiar la institución.')
        return
      }
      setTexto('')
      router.refresh()
    })

  return (
    <span className="selector-de-institucion">
      {' '}
      Mirando como{' '}
      <strong>{actual ? `${actual.nombre} (${actual.subdominio})` : 'TraumaHub'}</strong>.{' '}
      <form
        className="selector-de-institucion-formulario"
        onSubmit={(evento) => {
          evento.preventDefault()
          elegir(texto)
        }}
      >
        <label>
          <span className="sr-only">Subdominio de la institución</span>
          <input
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="subdominio"
            maxLength={63}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={pendiente || !texto.trim()}>
          Cambiar
        </button>
        {actual ? (
          <button type="button" disabled={pendiente} onClick={() => elegir('')}>
            Volver a TraumaHub
          </button>
        ) : null}
      </form>
      {error ? (
        <span role="alert" className="selector-de-institucion-error">
          {' '}
          {error}
        </span>
      ) : null}
    </span>
  )
}
