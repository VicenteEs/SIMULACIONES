import type { Metadata } from 'next'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Miga } from '@/components/Estados'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Créditos · TraumaHub',
  robots: { index: false, follow: false },
}

/**
 * Créditos del material de terceros.
 *
 * No es cortesía: la licencia del atlas anatómico —CC BY 4.0— **obliga** a
 * atribuir y a indicar los cambios allí donde el material se muestre. Esta
 * página es donde se cumple, y el visor enlaza aquí.
 *
 * El texto sale de `public/atlas/ATRIBUCION.md`, que escribe el guion de
 * ingesta: así el crédito y el material que describe no pueden separarse.
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
        Qué material de terceros usa esta plataforma, con qué licencia y qué se cambió.
      </p>

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
  return markdown.split('\n').map((linea, i) => {
    const clave = `l${i}`
    if (linea.startsWith('# ')) return null
    if (linea.startsWith('## ')) return <h3 key={clave}>{linea.slice(3)}</h3>
    if (linea.startsWith('> ')) {
      return (
        <blockquote key={clave} className="creditos-cita">
          {linea.slice(2)}
        </blockquote>
      )
    }
    if (linea.startsWith('- ')) return <li key={clave}>{sinMarcas(linea.slice(2))}</li>
    if (linea.trim() === '' || linea.startsWith('---')) return null
    return <p key={clave}>{sinMarcas(linea)}</p>
  })
}

/** Quita el énfasis y los enlaces del markdown, dejando el texto legible. */
const sinMarcas = (texto: string): string =>
  texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
