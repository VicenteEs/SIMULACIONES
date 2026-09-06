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

  // Registrar visita al montar
  useEffect(() => {
    registrarVisita(coleccion, documentoId)
  }, [coleccion, documentoId])

  async function toggleLeida() {
    setCargando(true)
    const nuevoEstado = !completado
    setCompletado(nuevoEstado) // optimistic update
    try {
      await marcarComoLeida(coleccion, documentoId, nuevoEstado)
    } catch {
      setCompletado(!nuevoEstado) // revert on error
    }
    setCargando(false)
  }

  return (
    <div className="rastreador-actividad">
      <label className="checkbox-leida">
        <input 
          type="checkbox" 
          checked={completado} 
          onChange={toggleLeida}
          disabled={cargando}
        />
        <span>{completado ? 'Marcada como leída' : 'Marcar como leída'}</span>
      </label>
    </div>
  )
}
