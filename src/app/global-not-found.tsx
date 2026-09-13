import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { ruta } from '@/lib/rutas'

/**
 * La otra mitad del «no encontrado»: la dirección que no casa con ninguna ruta.
 *
 * `(frontend)/not-found.tsx` y `admin-panel/not-found.tsx` solo atienden las
 * llamadas a `notFound()` desde una página que sí existe. Una dirección que no
 * corresponde a ninguna ruta —`/traumahub/bibliotecaa`, un enlace que se copió
 * perdiendo un segmento, una URL vieja de antes de renombrar un módulo— no pasa
 * por ninguna página: Next la resuelve en el enrutador y la manda a la ruta
 * interna `/_not-found`, que se compone en la raíz de `app`. Ahí no llega
 * ninguno de los dos archivos de arriba, y hasta que existió este el residente
 * veía la pantalla por omisión de Next: en inglés, sin barra y sin salida.
 *
 * Y esa otra mitad no se podía cerrar con un `src/app/not-found.tsx` corriente,
 * que es lo primero que se intenta: ese archivo se pinta **dentro** del layout
 * raíz, y aquí no hay uno solo —`(frontend)` y `(payload)` son cada uno su
 * propia raíz y no existe `src/app/layout.tsx`—. Es literalmente el primero de
 * los dos casos que el documento del marco nombra para mandar a
 * `global-not-found`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`:
 * «Your app has multiple root layouts […] so there's no single layout to
 * compose a global 404 from»).
 *
 * **Este archivo no hace nada por sí solo.** `global-not-found` va detrás de una
 * bandera experimental, y Next ni siquiera busca el archivo si está apagada
 * (`node_modules/next/dist/build/entries.js`: `isGlobalNotFoundEnabled:
 * config.experimental.globalNotFound ? true : undefined`). Hace falta esto en
 * `next.config.mjs`, dentro del `experimental` que ya existe al lado de
 * `serverActions`:
 *
 *     experimental: {
 *       globalNotFound: true,
 *       serverActions: { bodySizeLimit: '8mb' },
 *     }
 *
 * Sin esa línea el archivo se queda inerte —no rompe la compilación, no avisa
 * de nada— y la dirección que no casa vuelve a la pantalla en inglés. Si algún
 * día la bandera desaparece o cambia de nombre al subir de versión mayor, el
 * síntoma será exactamente ese y no habrá error que lo delate: hay que venir a
 * mirar aquí.
 *
 * Documento completo, con `<html>` y `<body>` propios, porque esta página se
 * sirve **saltándose** el árbol de layouts: no hay documento alrededor que los
 * aporte. Lo exige el mismo documento del marco: «this file must return a full
 * HTML document».
 *
 * Sin props, igual que los otros dos «no encontrado»: no hay error que
 * registrar ni nada que reintentar. La dirección no va a existir porque se pida
 * otra vez.
 */

export const metadata: Metadata = {
  title: 'No encontrado',
  description: 'La dirección que ha abierto no existe en la plataforma.',
  // Repetido del layout de `(frontend)` a sabiendas: esta página se pinta fuera
  // de ese layout y no hereda su `metadata`. El acceso es cerrado y no debe
  // indexarse (D-020); el 404 tampoco, aunque Next ya inyecte `noindex` por su
  // cuenta en las páginas que responden 404. Dos avisos cuestan una etiqueta.
  robots: { index: false, follow: false },
}

/*
  Los colores van en línea, copiados de `(frontend)/estilos.css`, por el mismo
  motivo que en `src/app/global-error.tsx`: esta página se sirve fuera del árbol
  de layouts y la hoja global no llega hasta aquí —el documento del marco lo
  dice sin rodeos: «you'll need to import any global styles […] that your 404
  page requires»—.

  La contrapartida es la misma y ya va por la tercera copia: si la paleta de
  `estilos.css` cambia, estas dos pantallas se quedan con la vieja y no lo avisa
  nadie. Se asume porque son cuatro colores, porque no hay tema oscuro (ver la
  nota de `color-scheme` en `estilos.css`) y porque el destino es una pantalla
  que casi nunca se ve. El día que sean más, o que aparezca una cuarta copia, lo
  que toca es sacar la paleta a un módulo propio y que las tres la importen.
*/
const TINTA = '#0c1a38' // --tinta
const PIZARRA = '#46587a' // --pizarra
const PAPEL = '#eef1f7' // --papel
const SUPERFICIE = '#ffffff' // --superficie
const LINEA = '#d7dfec' // --linea
const MARCA = '#12509e' // --marca

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

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

const estiloEnlace: CSSProperties = {
  display: 'inline-block',
  background: 'transparent',
  color: MARCA,
  border: `1px solid ${LINEA}`,
  borderRadius: 4,
  padding: '11px 20px',
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
}

export default function NoEncontradoGlobal() {
  return (
    // `colorScheme` se declara aquí porque la regla de `estilos.css` que lo fija
    // no llega a este documento. Sin ella, Chrome de Android aplica su tema
    // oscuro automático a las páginas que no dicen nada y reescribe estos
    // colores por su cuenta: la tarjeta blanca se oscurece y el texto en
    // `--pizarra` pierde el contraste con el que se eligió.
    <html lang="es" style={{ colorScheme: 'light' }}>
      <body style={estiloCuerpo}>
        <main style={estiloCaja}>
          <h1 style={estiloTitulo}>Esta dirección no existe</h1>
          <div style={estiloTarjeta}>
            <p style={estiloParrafo}>
              No hay ninguna página en esa dirección. Lo corriente es que el enlace llegara mal
              copiado o que apunte a una parte de la plataforma que cambió de sitio. No es un fallo
              del servidor y su sesión sigue abierta: desde la portada están todos los módulos.
            </p>
            <div style={estiloFilaBotones}>
              {/*
                Una sola salida, y a la portada: esta pantalla se pinta sin
                sesión —el enrutador no llegó a montar nada, así que aquí no se
                sabe si quien mira es un residente dentro o alguien de fuera— y
                la portada es la única dirección que sirve en los dos casos.
                Ofrecer «Ir a la biblioteca», como hace el `not-found.tsx`
                público, mandaría a media plataforma a la pantalla de entrar.

                `<a>` y no `<Link>` a propósito: esta página se sirve fuera del
                árbol del router y `<Link>` navegaría por un router que aquí no
                existe. Y al ser una URL escrita a mano necesita `ruta()`: sin
                ella, bajo el prefijo `/traumahub` el enlace saldría a la raíz
                del dominio, que es otra página distinta detrás del mismo proxy.
              */}
              <a style={estiloEnlace} href={ruta('/')}>
                Ir a la portada
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
