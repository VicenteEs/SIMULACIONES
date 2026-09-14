'use client'

import { useState, useTransition } from 'react'
import { enviarCorreoDePrueba } from '@/app/(frontend)/acciones/correo'

/**
 * «Enviarme un correo de prueba», dentro de la fila «Correo saliente».
 *
 * El resultado se queda escrito junto al botón y no se va solo: la explicación
 * de un fallo nombra la variable del `.env` que hay que cambiar, y quien la
 * lee va a abrir ese archivo en otra ventana. Un aviso que desaparece a los
 * pocos segundos obliga a enviar otra prueba para volver a leerlo, y cada
 * prueba gasta cuota de envío.
 */
export function BotonCorreoDePrueba() {
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const enviar = () => {
    setAviso(null)
    iniciar(async () => {
      try {
        const resultado = await enviarCorreoDePrueba()
        setAviso(
          resultado.exito && resultado.datos
            ? {
                tipo: 'ok',
                texto: `Enviado a ${resultado.datos.para}. Revise también la carpeta de correo no deseado.`,
              }
            : { tipo: 'error', texto: resultado.mensaje ?? 'No se pudo enviar el correo de prueba.' },
        )
      } catch {
        // Lo que se cae antes de llegar a `accion()` —la red, la sesión
        // caducada, un despliegue a mitad— sale como excepción. Sin esto el
        // botón se desbloquea sin decir nada, y eso se lee como «enviado».
        setAviso({
          tipo: 'error',
          texto: 'No se pudo enviar el correo de prueba. Compruebe la conexión e inténtelo otra vez.',
        })
      }
    })
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={enviar} disabled={enCurso}>
        {enCurso ? 'Enviando…' : 'Enviarme un correo de prueba'}
      </button>
      {aviso ? (
        <div
          role="status"
          className={`admin-aviso admin-aviso-${aviso.tipo}`}
          style={{ marginTop: '0.5rem', marginBottom: 0 }}
        >
          {aviso.texto}
        </div>
      ) : null}
    </div>
  )
}
