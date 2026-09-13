import type { ReactNode } from 'react'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import { enlaceSeguro, estaVacio } from '@/lib/textoRico'
import { ruta } from '@/lib/rutas'

/**
 * Cómo se pinta un enlace escrito dentro del contenido.
 *
 * El convertidor que trae Payload emite `<a href={fields.url}>` tal cual, y eso
 * deja dos cosas sin hacer:
 *
 *  - **El prefijo.** Next.js resuelve el prefijo de `<Link>`, `redirect()`,
 *    `router.push()` y `next/image`, pero no el de un `<a>`. Sin `ruta()`, un
 *    enlace del autor a `/biblioteca/12` sale en el servidor sin `/traumahub`,
 *    lo atiende otra página del mismo dominio detrás del proxy y devuelve un
 *    404 que no menciona TraumaHub. En desarrollo, con el prefijo vacío,
 *    funciona igual: por eso se publica sin que nadie lo note.
 *  - **La comprobación de la dirección.** `enlaceSeguro` se aplicaba solo al
 *    convertir desde el editor, y el panel no es la única vía de escritura: la
 *    API REST de Payload sigue aceptando `PATCH` de cualquiera con sesión de
 *    editor, sin pasar por `depurarDocumento`. Lo que hoy desactiva un
 *    `javascript:` guardado por ahí es React, no este repositorio, y esa red no
 *    cubre `file:` ni los esquemas del sistema. Comprobar aquí es lo que hace
 *    que la promesa la sostenga esta casa y no una dependencia —y lo que la
 *    mantendrá en pie el día que alguien use el conversor a HTML del paquete
 *    para el PDF o el correo—.
 *
 * Un enlace que no pasa la comprobación se pinta como texto, sin `<a>`: se lee
 * igual y no queda nada muerto que pulsar.
 */
function enlacePintado(direccion: unknown, hijos: ReactNode[]): ReactNode {
  const destino = enlaceSeguro(direccion)
  if (!destino) return <>{hijos}</>
  // Una ficha de la propia plataforma se abre donde está: mandarla a otra
  // pestaña rompe el «atrás» y deja al residente con dos ventanas de lo mismo.
  if (destino.startsWith('/')) return <a href={ruta(destino)}>{hijos}</a>
  return (
    <a href={destino} target="_blank" rel="noopener noreferrer">
      {hijos}
    </a>
  )
}

/**
 * Convertidores del renderizador de Payload con el enlace propio.
 *
 * Se exporta para que todos los sitios que pintan un campo rico compartan la
 * misma regla: dos renderizadores con criterios distintos sobre el mismo
 * contenido acaban siendo dos comportamientos que nadie recuerda comparar.
 */
export const conversoresRicos: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  link: ({ node, nodesToJSX }) =>
    enlacePintado(node.fields?.url, nodesToJSX({ nodes: node.children })),
  autolink: ({ node, nodesToJSX }) =>
    enlacePintado(node.fields?.url, nodesToJSX({ nodes: node.children })),
})

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
      <RichText data={valor as never} converters={conversoresRicos} />
    </div>
  )
}

/** ¿Hay algo que mostrar? Útil para decidir si pintar el rótulo del campo. */
export function tieneContenido(valor: unknown): boolean {
  if (typeof valor === 'string') return valor.trim().length > 0
  if (valor === null || valor === undefined) return false
  return !estaVacio(valor)
}
