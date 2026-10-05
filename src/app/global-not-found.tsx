import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { ruta } from '@/lib/rutas'
import { House, MapPinOff } from 'lucide-react'

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
const MUDO = '#5a6880' // --mudo
const PAPEL = '#eef1f7' // --papel
const SUPERFICIE = '#ffffff' // --superficie
const LINEA = '#d7dfec' // --linea
const MARCA = '#12509e' // --marca
const MARCA_TENUE = '#e7f0fb' // --marca-tenue

const SANS =
  "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

const estiloCuerpo: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: SANS,
  fontSize: 15,
  lineHeight: 1.6,
  background: PAPEL,
  color: TINTA,
}

const estiloCaja: CSSProperties = {
  flex: '1 0 auto',
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  padding: '56px 20px 48px',
  textAlign: 'center',
}

const estiloLogo: CSSProperties = {
  width: 180,
  maxWidth: '60%',
  height: 'auto',
  aspectRatio: '1200 / 655',
  display: 'block',
  margin: '0 auto 40px',
}

const estiloIcono: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 72,
  height: 72,
  borderRadius: 16,
  background: MARCA_TENUE,
  color: MARCA,
  marginBottom: 20,
}

const estiloCodigo: CSSProperties = {
  display: 'block',
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: MUDO,
  marginBottom: 8,
}

const estiloTitulo: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 28,
  lineHeight: 1.15,
  fontWeight: 650,
  letterSpacing: '-0.022em',
}

const estiloParrafo: CSSProperties = {
  margin: '0 auto',
  maxWidth: '52ch',
  color: PIZARRA,
}

const estiloEnlace: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  marginTop: 28,
  padding: '0 22px',
  background: MARCA,
  color: SUPERFICIE,
  border: `1px solid ${MARCA}`,
  borderRadius: 8,
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
}

const estiloPie: CSSProperties = {
  borderTop: `1px solid ${LINEA}`,
  padding: '20px 24px 24px',
  textAlign: 'center',
  fontSize: 13,
  color: MUDO,
}

const estiloPieEnlace: CSSProperties = {
  color: MARCA,
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
          {/* El logotipo, porque esta página sale sin barra: sin él no hay nada
              en la pantalla que diga que se sigue en TraumaHub y no en otra
              página del mismo dominio. Pasa por `ruta()` como todo `<img>`
              escrito a mano. */}
          <img src={ruta('/logo-hd.png')} alt="TraumaHub" style={estiloLogo} />
          <span style={estiloIcono} aria-hidden="true">
            <MapPinOff size={34} strokeWidth={1.6} />
          </span>
          <span style={estiloCodigo}>Error 404 · Dirección desconocida</span>
          <h1 style={estiloTitulo}>Esta dirección no existe</h1>
          <p style={estiloParrafo}>
            No hay ninguna página en esa dirección. Lo corriente es que el enlace llegara mal
            copiado o que apunte a una parte de la plataforma que cambió de sitio. No es un fallo
            del servidor y su sesión sigue abierta: desde la portada están todos los módulos.
          </p>
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
            <House size={18} aria-hidden="true" />
            Ir a la portada
          </a>
        </main>
        {/* El pie de las demás páginas no llega aquí (es del layout), así que
            se repite su primera línea. */}
        <footer style={estiloPie}>
          <strong style={{ color: PIZARRA }}>TraumaHub</strong> · Plataforma docente de
          traumatología ·{' '}
          <a style={estiloPieEnlace} href={ruta('/creditos')}>
            Créditos y licencias
          </a>
        </footer>
      </body>
    </html>
  )
}
