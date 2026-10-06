'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAvisos } from '@/components/ui/Avisos'
import { useConfirmar } from '@/components/ui/Confirmar'
import { cambiarMantencionDeModulo } from '@/app/(frontend)/acciones/admin'

/**
 * El interruptor de un módulo en la tarjeta de «Contenido» (D-156).
 *
 * Es un `role="switch"` de verdad y no un botón que cambia de texto: quien usa
 * un lector de pantalla oye «Biblioteca visible, interruptor, activado» y sabe
 * qué estado tiene antes de pulsarlo. Activado es **visible**, que es el estado
 * normal; apagarlo es la excepción deliberada, y por eso es lo único que pide
 * confirmación. Devolverlo a visible no rompe nada y no pregunta.
 *
 * El texto de la confirmación dice qué ve cada quien, porque la duda de quien lo
 * pulsa es esa: si el editor sigue entrando, y si el residente va a ver un error
 * o simplemente nada.
 *
 * Pinta desde lo que el servidor ya tiene guardado (`enMantencion` llega por
 * props y `router.refresh()` lo vuelve a traer), no desde un estado propio: dos
 * pestañas del administrador abiertas a la vez no se contradicen.
 */
export function InterruptorDeMantencion({
  modulo,
  nombre,
  enMantencion,
}: {
  modulo: string
  nombre: string
  enMantencion: boolean
}) {
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const avisar = useAvisos()
  const confirmar = useConfirmar()

  const cambiar = async () => {
    const aMantencion = !enMantencion
    if (aMantencion) {
      const si = await confirmar({
        titulo: `¿Poner «${nombre}» en mantención?`,
        mensaje: (
          <>
            Los residentes dejarán de ver «{nombre}» en todas partes: la barra, la portada y
            cualquier enlace. Los editores y administradores lo seguirán viendo, marcado como «En
            mantención». Se puede devolver a visible cuando quiera.
          </>
        ),
        confirmar: 'Poner en mantención',
      })
      if (!si) return
    }
    iniciar(async () => {
      const resultado = await cambiarMantencionDeModulo(modulo, aMantencion)
      if (resultado.exito) {
        avisar(
          aMantencion ? 'atencion' : 'ok',
          aMantencion
            ? `«${nombre}» quedó en mantención: los residentes ya no lo ven.`
            : `«${nombre}» vuelve a estar visible para los residentes.`,
        )
        router.refresh()
      } else {
        avisar('error', resultado.mensaje ?? 'No se pudo cambiar el estado del módulo.')
      }
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!enMantencion}
      aria-label={`${nombre}: visible para los residentes`}
      className={`interruptor-mantencion${enMantencion ? ' interruptor-mantencion-apagado' : ''}`}
      disabled={enCurso}
      onClick={cambiar}
    >
      <span className="interruptor-mantencion-pista" aria-hidden="true">
        <span className="interruptor-mantencion-bola" />
      </span>
      <span className="interruptor-mantencion-texto">
        {enMantencion ? 'En mantención' : 'Visible para residentes'}
      </span>
    </button>
  )
}
