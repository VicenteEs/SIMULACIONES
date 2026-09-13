'use client'

import React, { useEffect, useState } from 'react'
import { registrarVisita, marcarComoLeida } from '@/app/(frontend)/acciones/actividad'

export function RastreadorActividad({
  coleccion,
  documentoId,
  completadoInicial = false,
}: {
  coleccion: string
  documentoId: string
  completadoInicial?: boolean
}) {
  const [completado, setCompletado] = useState(completadoInicial)
  const [cargando, setCargando] = useState(false)

  // Sin `await` y sin `catch` a propósito: `registrarVisita` no propaga nada
  // —lo explica su cabecera en `acciones/actividad.ts`— porque la visita es una
  // comodidad y su fallo no puede estropear la lectura de la ficha.
  useEffect(() => {
    registrarVisita(coleccion, documentoId)
  }, [coleccion, documentoId])

  async function alternarLeida() {
    setCargando(true)
    const nuevoEstado = !completado
    // La casilla se mueve antes de que conteste el servidor porque el gesto
    // tiene que responder al instante, y se devuelve a su sitio si la escritura
    // falla: dejarla marcada sobre una escritura que no ocurrió es lo único
    // peor que no marcarla, y es la razón de que `marcarComoLeida` lance en vez
    // de tragarse el fallo.
    setCompletado(nuevoEstado)
    try {
      await marcarComoLeida(coleccion, documentoId, nuevoEstado)
    } catch {
      setCompletado(!nuevoEstado)
    }
    setCargando(false)
  }

  return (
    <div className="rastreador-actividad">
      <label className="checkbox-leida">
        <input
          type="checkbox"
          checked={completado}
          onChange={alternarLeida}
          disabled={cargando}
        />
        <span>{completado ? 'Marcada como leída' : 'Marcar como leída'}</span>
      </label>
    </div>
  )
}
