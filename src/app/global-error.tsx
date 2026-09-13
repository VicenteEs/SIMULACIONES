'use client'

import { useEffect, type CSSProperties } from 'react'
import { ruta } from '@/lib/rutas'

/**
 * La red de seguridad de último recurso: la que sí alcanza al layout raíz.
 *
 * `(frontend)/error.tsx` no cubre el layout de su propio segmento —lo dice la
 * documentación del marco, en
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`:
 * «It does **not** wrap the `layout.js` or `template.js` above it in the same
 * segment»—, y aquí eso no es un matiz: `(frontend)/layout.tsx` llama a
 * `obtenerSesion()` en **cada** petición (declara `dynamic = 'force-dynamic'`),
 * y `obtenerSesion()` abre Payload y consulta la base. Con Postgres caído el
 * fallo sale del layout, no de la página, así que el `error.tsx` del grupo ni
 * se entera y el residente vuelve a ver la pantalla genérica de Next, en
 * inglés. Es decir: el fallo más probable de todos era justamente el que se
 * quedaba fuera. Esto lo tapa.
 *
 * Vive en `src/app` y no dentro de un grupo porque no hay `src/app/layout.tsx`:
 * `(frontend)` y `(payload)` son cada uno su propia raíz, y `global-error.tsx`
 * en la raíz de `app` es lo único que los alcanza a los dos.
 *
 * Pinta su propio `<html>` y su propio `<body>` porque **sustituye** al layout
 * raíz mientras está activo: no hay documento alrededor que los aporte. Por lo
 * mismo no hay barra de navegación ni nombre de usuario: obtener la sesión es
 * precisamente lo que acaba de fallar.
 *
 * `retry` y no `reset`, igual que en `(frontend)/error.tsx`: `reset` se limita
 * a repintar lo que ya hay en el cliente, y lo que hay aquí es un layout que
 * reventó al consultar la base. Repintarlo sin volver a pedirlo al servidor
 * devolvería esta misma pantalla y el botón sería un engaño.
 */

/*
  Los colores van en línea, copiados de `(frontend)/estilos.css`, y no
  importando la hoja. Dos motivos, y el segundo pesa más que el primero:

  1. La documentación avisa de que `global-error` «renders their own document
     and do not include your global styles».
  2. Si esta pantalla se está pintando es porque algo muy gordo se rompió.
     Hacerla depender de que además cargue un recurso aparte es apostar justo
     cuando no hay que apostar.

  La contrapartida es real y hay que decirla: estos hexadecimales están
  duplicados. Si la paleta de `estilos.css` cambia, esta pantalla se queda con
  la vieja y no lo avisa nadie —hay que venir a cambiarlos a mano—. Se asume
  porque son cinco colores, no hay tema oscuro (ver la nota de `color-scheme`
  en `estilos.css`) y el destino de la copia es una pantalla que casi nunca se
  ve.
*/
const TINTA = '#0c1a38' // --tinta
const PIZARRA = '#46587a' // --pizarra
const MUDO = '#5a6880' // --mudo
const PAPEL = '#eef1f7' // --papel
const SUPERFICIE = '#ffffff' // --superficie
const LINEA = '#d7dfec' // --linea
const MARCA = '#12509e' // --marca

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

const estiloCuerpo: CSSProperties = {
  margin: 0,
  padding: '64px 20px',
  fontFamily: SANS,
  fontSize: 15,
  lineHeight: 1.6,
  background: PAPEL,
  color: TINTA,
}

const estiloCaja: CSSProperties = {
  maxWidth: 620,
  margin: '0 auto',
}

const estiloTitulo: CSSProperties = {
  margin: '0 0 18px',
  fontSize: 28,
  lineHeight: 1.15,
  fontWeight: 650,
  letterSpacing: '-0.022em',
}

const estiloTarjeta: CSSProperties = {
  background: SUPERFICIE,
  border: `1px solid ${LINEA}`,
  borderRadius: 10,
  padding: '24px 26px',
}

const estiloParrafo: CSSProperties = {
  margin: 0,
  color: PIZARRA,
}

const estiloFilaBotones: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginTop: 22,
}

const estiloBoton: CSSProperties = {
  display: 'inline-block',
  background: MARCA,
  color: '#fff',
  border: `1px solid ${MARCA}`,
  borderRadius: 4,
  padding: '11px 20px',
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const estiloEnlace: CSSProperties = {
  ...estiloBoton,
  background: 'transparent',
  color: MARCA,
  borderColor: LINEA,
  textDecoration: 'none',
}

const estiloAviso: CSSProperties = {
  margin: '18px 0 0',
  fontSize: 13,
  color: MUDO,
}

const estiloCodigo: CSSProperties = {
  fontFamily: MONO,
  fontSize: 12.5,
  color: TINTA,
}

export default function FalloGeneral({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Lo mismo que en `(frontend)/error.tsx`: en producción Next sustituye el
    // mensaje por uno genérico para no filtrar detalles internos, y lo único
    // que cruza del servidor al navegador es `digest`. Sin imprimirlo, quien
    // mire la consola no tiene con qué buscar en el registro del servidor.
    console.error('[traumahub] fallo general de la plataforma:', error.digest ?? '(sin código)', error)
  }, [error])

  return (
    // `colorScheme` se declara aquí porque la regla de `estilos.css` que lo
    // fija no llega a este documento. Sin ella, Chrome de Android aplica su
    // tema oscuro automático a las páginas que no dicen nada y reescribe estos
    // colores por su cuenta: la tarjeta blanca se oscurece y el texto gris
    // pierde el contraste con el que se eligió.
    <html lang="es" style={{ colorScheme: 'light' }}>
      <body style={estiloCuerpo}>
        <main style={estiloCaja}>
          <h1 style={estiloTitulo}>La plataforma no ha podido cargar</h1>
          <div style={estiloTarjeta}>
            <p style={estiloParrafo}>
              No es por nada que usted haya hecho. Cuando falla así, lo habitual es que sea la base
              de datos, que no responde; mientras dure, ninguna página de TraumaHub se abre. Vuelva
              a intentarlo dentro de un momento: si fue algo pasajero, la sesión sigue abierta.
            </p>
            <div style={estiloFilaBotones}>
              {/*
                El botón va antes que el enlace por el mismo motivo que en
                `(frontend)/error.tsx`: es la salida que no abandona la página.
              */}
              <button type="button" style={estiloBoton} onClick={() => retry()}>
                Volver a intentarlo
              </button>
              {/*
                Aquí la salida a mano es un `<a>` y no un `<Link>` a propósito.
                `<Link>` navega por el árbol del router, y el árbol del router
                es justamente lo que acaba de romperse; una recarga completa
                vuelve a montar el documento desde cero, que es el único intento
                de verdad distinto al de `retry()`.

                Y al ser una URL escrita a mano necesita `ruta()`: sin ella,
                bajo el prefijo `/traumahub` este enlace saldría a la raíz del
                dominio, que es otra página distinta detrás del mismo proxy.
              */}
              <a style={estiloEnlace} href={ruta('/')}>
                Ir a la portada
              </a>
            </div>
            {error.digest ? (
              <p style={estiloAviso}>
                Si vuelve a ocurrir, dé este código al equipo docente:{' '}
                <code style={estiloCodigo}>{error.digest}</code>. Con él se encuentra el fallo
                exacto en el registro del servidor.
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}
