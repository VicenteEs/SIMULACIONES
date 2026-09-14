import type { Metadata } from 'next'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Miga } from '@/components/Estados'
import { AUTORIA } from '@/lib/autoria'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Créditos · TraumaHub',
  robots: { index: false, follow: false },
}

/**
 * Créditos: quién desarrolló la plataforma y el material de terceros que usa.
 *
 * La autoría sale de `AUTORIA` (`src/lib/autoria.ts`), como en el pie de página,
 * en la barra del panel y en los correos; escrita a mano aquí, sería la cuarta
 * copia que se queda atrás el día que cambie la dirección.
 *
 * No es cortesía: la licencia del atlas anatómico —CC BY 4.0— **obliga** a
 * atribuir y a indicar los cambios allí donde el material se muestre. Esta
 * página es donde se cumple, y el visor enlaza aquí.
 *
 * El texto sale de `public/atlas/ATRIBUCION.md`, que escribe el guion de
 * ingesta: así el crédito y el material que describe no pueden separarse. La
 * plantilla está en `scripts/atlas/atribucion.mjs`, y es ahí donde se cambia lo
 * que esta página dice: el archivo corregido a mano vuelve al texto de la
 * plantilla en cuanto se regenera, y la página deja de enseñar el cambio sin
 * que nada falle.
 */
export default async function PaginaCreditos() {
  let atribucion: string | null = null
  try {
    atribucion = await readFile(join(process.cwd(), 'public', 'atlas', 'ATRIBUCION.md'), 'utf8')
  } catch {
    atribucion = null
  }

  return (
    <main>
      <Miga href="/" texto="Inicio" />
      <h1>Créditos y licencias</h1>
      <p className="entrada">
        Quién desarrolló esta plataforma, qué material de terceros usa, con qué licencia y qué se
        cambió.
      </p>

      {/* Primero, y no al final con el aviso: el pie de cada página enlaza aquí
          con el nombre de quien la desarrolló, y quien llega pulsándolo busca
          eso antes que la licencia del atlas. */}
      <section className="tarjeta">
        <h2>Desarrollo</h2>
        <p>
          TraumaHub fue desarrollado por <strong>{AUTORIA.nombre}</strong>.
        </p>
        <p>
          Para consultas, sugerencias o problemas con la plataforma, escriba a{' '}
          <a href={`mailto:${AUTORIA.correo}`}>{AUTORIA.correo}</a>.
        </p>
      </section>

      <section className="tarjeta">
        <h2>Atlas anatómico</h2>
        {atribucion ? (
          <div className="creditos-texto">{formatear(atribucion)}</div>
        ) : (
          <p>
            El atlas anatómico no está instalado en este servidor, así que no hay nada que
            atribuir todavía.
          </p>
        )}
      </section>

      <section className="tarjeta">
        <h2>Aviso</h2>
        <p>
          Todo el material tridimensional de esta plataforma es <strong>docente</strong>. Representa
          anatomía de referencia y no la de ningún paciente: no sirve para diagnosticar ni para
          planificar una intervención concreta.
        </p>
      </section>
    </main>
  )
}

/**
 * Pinta el archivo de atribución.
 *
 * Se recorre a mano en vez de inyectar marcado: el resto de la plataforma pinta
 * el contenido con componentes y sin `dangerouslySetInnerHTML`, y no hay razón
 * para hacer una excepción justo en la página de créditos.
 */
function formatear(markdown: string) {
  return bloquesDe(markdown).map((bloque, i) => {
    const clave = `b${i}`
    switch (bloque.tipo) {
      case 'titulo':
        return <h3 key={clave}>{bloque.texto}</h3>
      case 'cita':
        return (
          <blockquote key={clave} className="creditos-cita">
            {sinMarcas(bloque.texto)}
          </blockquote>
        )
      case 'lista':
        return (
          <ul key={clave}>
            {bloque.elementos.map((elemento, j) => (
              <li key={`${clave}-${j}`}>{sinMarcas(elemento)}</li>
            ))}
          </ul>
        )
      case 'parrafo':
        return <p key={clave}>{sinMarcas(bloque.texto)}</p>
    }
  })
}

type Bloque =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'cita'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; elementos: string[] }

/**
 * Agrupa las líneas del archivo en bloques.
 *
 * Antes cada línea era un elemento, y el archivo está cortado a ochenta
 * columnas: un punto de la lista que ocupaba dos líneas salía partido en un
 * `<li>` con media frase y un `<p>` suelto con la otra media, y la cita del
 * crédito exigido, en dos citas. Con las ocho correcciones de sistema y la
 * traducción de los nombres, «Cambios realizados» —justo lo que la licencia
 * obliga a declarar— pasaba a leerse a trozos.
 *
 * Una línea que no abre bloque continúa el que está abierto; una línea en
 * blanco lo cierra. Es lo que hace markdown, y lo único que usa este archivo.
 */
function bloquesDe(markdown: string): Bloque[] {
  const bloques: Bloque[] = []
  let abierto: Bloque | null = null

  // El archivo puede llegar con CRLF si el repositorio se sacó en Windows, y
  // con el `\r` pegado ninguna línea en blanco parecía en blanco.
  for (const linea of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (linea.trim() === '' || linea.startsWith('---') || linea.startsWith('# ')) {
      abierto = null
    } else if (linea.startsWith('## ')) {
      bloques.push({ tipo: 'titulo', texto: linea.slice(3) })
      abierto = null
    } else if (linea.startsWith('> ')) {
      if (abierto?.tipo === 'cita') {
        abierto.texto += ` ${linea.slice(2).trim()}`
      } else {
        abierto = { tipo: 'cita', texto: linea.slice(2).trim() }
        bloques.push(abierto)
      }
    } else if (linea.startsWith('- ')) {
      if (abierto?.tipo === 'lista') {
        abierto.elementos.push(linea.slice(2).trim())
      } else {
        abierto = { tipo: 'lista', elementos: [linea.slice(2).trim()] }
        bloques.push(abierto)
      }
    } else if (abierto?.tipo === 'lista') {
      abierto.elementos[abierto.elementos.length - 1] += ` ${linea.trim()}`
    } else if (abierto?.tipo === 'cita' || abierto?.tipo === 'parrafo') {
      abierto.texto += ` ${linea.trim()}`
    } else {
      abierto = { tipo: 'parrafo', texto: linea.trim() }
      bloques.push(abierto)
    }
  }

  return bloques
}

/** Quita el énfasis y los enlaces del markdown, dejando el texto legible. */
const sinMarcas = (texto: string): string =>
  texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
