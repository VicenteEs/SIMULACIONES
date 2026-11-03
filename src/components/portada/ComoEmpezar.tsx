import { GraduationCap, MessageSquare, Users } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { Resaltado } from './Resaltado'

const ICONOS = [MessageSquare, Users, GraduationCap] as const

/**
 * «Cómo empezar»: tres pasos colgados del hilo, alternando lados.
 *
 * Una lista ordenada (`<ol>`): el orden es lo que se cuenta, y así un lector de
 * pantalla dice «1 de 3» sin que el número tenga que estar en el texto. Un paso
 * sin título no se pinta.
 */
export function ComoEmpezar({ pagina }: { pagina: PaginaLeida }) {
  const t = (clave: string) => pagina.texto(`portada.empezar.${clave}`)
  const pasos = [1, 2, 3]
    .map((n, i) => ({ n, titulo: t(`paso-${n}.titulo`), texto: t(`paso-${n}.texto`), Icono: ICONOS[i] }))
    .filter((p) => p.titulo)
  if (pasos.length === 0) return null

  return (
    <section id="empezar" className="p-empezar p-claro" aria-labelledby="p-empezar-titular">
      <div className="p-contenedor">
        <header className="p-centrado">
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id="p-empezar-titular" className="p-titular p-titular-medio">
            <Resaltado texto={t('titular')} />
          </h2>
        </header>
        <ol className="p-pasos">
          {pasos.map(({ n, titulo, texto, Icono }) => (
            <li key={n} className="p-paso">
              <span className="p-icono-caja p-icono-caja-grande" aria-hidden="true">
                <Icono size={20} />
              </span>
              <span>
                <span className="p-rotulo-mono">Paso {n}</span>
                <strong>{titulo}</strong>
                {texto ? <span className="p-paso-texto">{texto}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
