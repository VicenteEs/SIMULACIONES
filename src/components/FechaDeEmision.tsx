'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { fechaDeEmision } from '@/lib/impresion'

/**
 * El día del membrete impreso, puesto al día justo antes de imprimir.
 *
 * La ficha se pinta en el servidor y la pestaña puede llevar horas abierta: sin
 * esto un PDF guardado pasada la medianoche saldría con el día en que se cargó
 * la página y no con el de quien lo guarda. `flushSync` porque `beforeprint` no
 * espera a que React programe el repintado: sin él el navegador congela la
 * página con el texto viejo.
 */
export function FechaDeEmision({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial)
  useEffect(() => {
    const ponerAlDia = () => flushSync(() => setTexto(fechaDeEmision()))
    window.addEventListener('beforeprint', ponerAlDia)
    return () => window.removeEventListener('beforeprint', ponerAlDia)
  }, [])
  return <time>{texto}</time>
}
