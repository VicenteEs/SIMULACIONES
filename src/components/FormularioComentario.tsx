'use client'

import React, { useState } from 'react'
import { crearComentario } from '@/app/(frontend)/acciones/comentarios'

export function FormularioComentario({
  coleccion,
  documentoId,
  label = '¿Encontraste un error o tienes una sugerencia? Deja un comentario',
}: {
  coleccion: string
  documentoId: string
  label?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'exito' | 'error'>('idle')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEstado('enviando')
    try {
      await crearComentario(coleccion, documentoId, texto)
      setEstado('exito')
      setTexto('')
      setTimeout(() => {
        setAbierto(false)
        setEstado('idle')
      }, 3000)
    } catch (error) {
      setEstado('error')
    }
  }

  if (!abierto) {
    return (
      <div className="contenedor-comentario-toggle">
        <button className="boton secundario boton-comentar" onClick={() => setAbierto(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="formulario-comentario tarjeta">
      <h3>Dejar un comentario o sugerencia</h3>
      <p className="descripcion">Los administradores y editores revisarán tu aporte para mejorar el contenido.</p>
      
      {estado === 'exito' ? (
        <div className="alerta exito">
          ¡Gracias! Tu comentario ha sido enviado y será revisado.
        </div>
      ) : (
        <form onSubmit={enviar}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Describe el error, sugerencia o corrección aquí..."
            required
            rows={4}
            disabled={estado === 'enviando'}
          />
          {estado === 'error' && (
            <p className="texto-error">Hubo un error al enviar el comentario. Intenta nuevamente.</p>
          )}
          <div className="acciones-formulario">
            <button type="button" className="boton sutil" onClick={() => setAbierto(false)} disabled={estado === 'enviando'}>
              Cancelar
            </button>
            <button type="submit" className="boton principal" disabled={estado === 'enviando' || !texto.trim()}>
              {estado === 'enviando' ? 'Enviando...' : 'Enviar comentario'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
