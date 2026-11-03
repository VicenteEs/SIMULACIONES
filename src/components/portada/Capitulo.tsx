import React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { ROTULO_PROXIMAMENTE } from '@/lib/modulosAnunciados'
import type { CapituloDeLaPortada } from './capitulos'
import { Hilo } from './Hilo'
import { Resaltado } from './Resaltado'

/**
 * Un capítulo de la portada: un módulo contado con su ilustración al lado.
 *
 * La ilustración alterna de lado de un capítulo a otro (D-231: «una página
 * tras otra, alternando los lados»), y el hilo del centro se abomba hacia el
 * texto, donde lleva el nodo con el número. En el teléfono todo va en una
 * columna, el texto primero: la ilustración sin su titular no se entiende.
 *
 * Un módulo en mantención conserva su capítulo —lo que el módulo es no cambia
 * por estar en obras— pero no ofrece entrar: el botón se cambia por la
 * insignia «Próximamente», la misma que lleva el módulo 06.
 */
export function Capitulo({
  capitulo: c,
  pagina,
  enMantencion,
  primero,
  junto,
  children,
}: {
  capitulo: CapituloDeLaPortada
  pagina: PaginaLeida
  enMantencion: boolean
  /** El primero lleva el ancla «Módulos» de la barra. */
  primero: boolean
  /** Lo que acompaña al botón en su fila: en Opera, la lupa de fluoroscopia. */
  junto?: React.ReactNode
  /** La ilustración. */
  children: React.ReactNode
}) {
  const t = (clave: string) => pagina.texto(`portada.${c.clave}.${clave}`)
  const puntos = [1, 2, 3]
    .map((n, i) => ({ n, titulo: t(`punto-${n}.titulo`), texto: t(`punto-${n}.texto`), Icono: c.iconos?.[i] ?? null }))
    .filter((p) => p.titulo)
  const idDelTitular = `p-${c.clave}-titular`

  const accion = enMantencion ? (
    <span className="insignia-proximamente">{ROTULO_PROXIMAMENTE}</span>
  ) : (
    <Link href={c.ruta} className={c.destacado ? 'p-boton p-boton-cian p-boton-lg' : 'p-enlace-flecha'}>
      {t('boton')}
      <ArrowRight size={c.destacado ? 18 : 16} aria-hidden />
    </Link>
  )

  return (
    <section
      id={primero ? 'modulos' : c.clave}
      data-ancla="modulos"
      className={[
        'p-capitulo',
        c.fondo === 'oscuro' ? 'p-oscuro' : 'p-claro',
        `p-capitulo-${c.clave}`,
        `p-ilustracion-${c.ilustracion}`,
        c.destacado ? 'p-capitulo-destacado' : '',
      ].join(' ')}
      style={{ '--tono': `var(--mod-${c.tono})`, '--tono-tenue': `var(--mod-${c.tono}-tenue)` } as React.CSSProperties}
      aria-labelledby={idDelTitular}
    >
      {/* El ancla de cada capítulo para el pie: el primero ya usa «modulos». */}
      {primero ? <span id={c.clave} className="p-ancla-extra" aria-hidden="true" /> : null}
      <Hilo forma={c.ilustracion === 'izquierda' ? 'derecha' : 'izquierda'} />
      <div className="p-contenedor p-capitulo-rejilla">
        <div className="p-capitulo-texto">
          <span className="p-nodo" aria-hidden="true">
            {c.numero}
          </span>
          <p className="p-antetitulo">{t('antetitulo')}</p>
          <h2 id={idDelTitular} className="p-titular">
            <Resaltado texto={t('titular')} />
          </h2>
          <p className="p-bajada">{t('bajada')}</p>
        </div>

        <div className="p-capitulo-ilustracion">{children}</div>

        {puntos.length > 0 ? (
          <ul className={`p-puntos${c.iconos ? '' : ' p-puntos-numerados'}`}>
            {puntos.map(({ n, titulo, texto, Icono }) => (
              <li key={n} className="p-punto">
                <span className="p-icono-caja" aria-hidden="true">
                  {Icono ? <Icono size={18} /> : n}
                </span>
                <span>
                  <strong>{titulo}</strong>
                  {texto ? <span className="p-punto-texto">{texto}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="p-capitulo-accion">
          {accion}
          {junto}
        </div>
      </div>
    </section>
  )
}
