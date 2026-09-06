import { RichText } from '@payloadcms/richtext-lexical/react'
import { estaVacio } from '@/lib/textoRico'

/**
 * Pinta un campo de texto con formato.
 *
 * Envuelve al renderizador de Payload para resolver de una vez las dos cosas
 * que hay que repetir en cada sitio donde aparece un campo rico:
 *
 *  - un campo vacío no debe dejar un hueco ni un párrafo en blanco, y un árbol
 *    «vacío» no es `null` sino un párrafo sin texto, que se ve igual de raro;
 *  - los campos que antes eran un área de texto simple pueden traer todavía
 *    una cadena si la migración no ha pasado por ellos, y la página tiene que
 *    seguir mostrando el contenido en lugar de romperse.
 *
 * Como el renderizador de Payload, no usa `dangerouslySetInnerHTML`: pinta el
 * árbol con componentes, y por eso el contenido del autor no puede introducir
 * comportamiento en la página.
 */
export function Rico({ valor, className }: { valor: unknown; className?: string }) {
  if (valor === null || valor === undefined) return null

  // Contenido anterior a la migración: texto llano guardado tal cual.
  if (typeof valor === 'string') {
    const texto = valor.trim()
    if (texto.length === 0) return null
    return (
      <div className={className}>
        {texto.split(/\n{2,}/).map((parrafo, i) => (
          <p key={i}>{parrafo}</p>
        ))}
      </div>
    )
  }

  if (estaVacio(valor)) return null

  return (
    <div className={className}>
      <RichText data={valor as never} />
    </div>
  )
}

/** ¿Hay algo que mostrar? Útil para decidir si pintar el rótulo del campo. */
export function tieneContenido(valor: unknown): boolean {
  if (typeof valor === 'string') return valor.trim().length > 0
  if (valor === null || valor === undefined) return false
  return !estaVacio(valor)
}
