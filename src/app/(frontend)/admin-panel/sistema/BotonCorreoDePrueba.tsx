'use client'

import { useState, useTransition } from 'react'
import { Mail } from 'lucide-react'
import { enviarCorreoDePrueba } from '@/app/(frontend)/acciones/correo'
import { useAvisos } from '@/components/ui/Avisos'

/**
 * «Enviarme un correo de prueba», dentro de la fila «Correo saliente».
 *
 * El resultado se queda escrito junto al botón y no se va solo: la explicación
 * de un fallo nombra la variable del `.env` que hay que cambiar, y quien la
 * lee va a abrir ese archivo en otra ventana. Un aviso que desaparece a los
 * pocos segundos obliga a enviar otra prueba para volver a leerlo, y cada
 * prueba gasta cuota de envío.
 *
 * Por eso aquí el aviso flotante del panel (`useAvisos`) va además del
 * escrito, no en su lugar: avisa de que llegó la respuesta aunque se haya
 * bajado la página, y el texto que se relee sigue junto al botón.
 */
export function BotonCorreoDePrueba() {
  const [enCurso, iniciar] = useTransition()
  const [aviso, setAvisoEscrito] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const avisar = useAvisos()
  const setAviso = (a: { tipo: 'ok' | 'error'; texto: string } | null) => {
    setAvisoEscrito(a)
    if (a) avisar(a.tipo, a.tipo === 'ok' ? 'Correo de prueba enviado.' : 'No se pudo enviar el correo de prueba.')
  }

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
    <div className="sistema-prueba">
      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={enviar} disabled={enCurso}>
        <Mail aria-hidden size={14} />
        {enCurso ? 'Enviando…' : 'Enviarme un correo de prueba'}
      </button>
      {aviso ? (
        <div
          role="status"
          className={`admin-aviso admin-aviso-${aviso.tipo} sistema-prueba-aviso`}
        >
          {aviso.texto}
        </div>
      ) : null}
    </div>
  )
}
