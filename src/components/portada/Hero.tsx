import Link from 'next/link'
import { ArrowRight, ArrowDown } from 'lucide-react'
import { MallaDeNodos } from '@/components/MallaDeNodos'
import { ImagenConCarga } from '@/components/ui/ImagenConCarga'
import { cifra } from '@/lib/graficos'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import type { CapaDelCuerpo } from './capitulos'
import type { FotoParaPintar } from './fotos'
import { Resaltado } from './Resaltado'

const NOMBRE_DE_CAPA: Record<CapaDelCuerpo, string> = { piel: 'Piel', musculo: 'Músculo', hueso: 'Hueso' }

/**
 * La primera pantalla: la promesa, los dos botones y el cuerpo en sus tres
 * capas, de frente.
 *
 * Las cifras no se escriben: las piezas se cuentan del catálogo del atlas y
 * los módulos, de los que no están en mantención. Las otras dos —tres planos
 * de corte, tres proyecciones de fluoroscopia— son lo que el atlas y el
 * simulador hacen, no un recuento, y cambian solo si cambia el código. Si el
 * catálogo no se puede leer, la cifra de piezas no sale: mejor tres cifras
 * ciertas que cuatro con una inventada.
 */
export function Hero({
  pagina,
  capas,
  modulos,
}: {
  pagina: PaginaLeida
  capas: Record<CapaDelCuerpo, FotoParaPintar>
  modulos: number
}) {
  const t = (clave: string) => pagina.texto(`portada.hero.${clave}`)
  const cifras = [
    ...(pagina.piezas ? [{ valor: cifra(pagina.piezas), rotulo: 'Estructuras con ficha' }] : []),
    { valor: '3', rotulo: 'Planos de corte' },
    { valor: '3', rotulo: 'Proyecciones de fluoroscopia' },
    { valor: String(modulos), rotulo: modulos === 1 ? 'Módulo clínico' : 'Módulos clínicos' },
  ]

  return (
    <section className="p-hero p-oscuro" aria-labelledby="p-hero-titular">
      <div className="p-hero-fondo" aria-hidden="true">
        <MallaDeNodos className="p-hero-malla" />
      </div>
      <div className="p-contenedor p-hero-rejilla">
        <div className="p-hero-texto">
          {t('antetitulo') ? (
            <p className="p-capsula-rotulo">
              <span aria-hidden="true" className="p-capsula-punto" />
              {t('antetitulo')}
            </p>
          ) : null}
          <h1 id="p-hero-titular" className="p-hero-titular">
            <Resaltado texto={t('titular')} />
          </h1>
          <p className="p-bajada p-hero-bajada">{t('bajada')}</p>
          <div className="p-hero-acciones">
            <a href="#cotizar" className="p-boton p-boton-cian p-boton-lg">
              {t('boton-principal')}
              <ArrowRight size={18} aria-hidden />
            </a>
            <a href="#modulos" className="p-boton p-boton-contorno p-boton-lg">
              <ArrowDown size={18} aria-hidden />
              {t('boton-secundario')}
            </a>
          </div>
          <p className="p-hero-cuenta">
            {t('pregunta-de-cuenta')} <Link href="/entrar">Entrar</Link>
          </p>
          <dl className="p-hero-cifras">
            {cifras.map((c) => (
              <div key={c.rotulo} className="p-hero-cifra">
                <dt>{c.rotulo}</dt>
                <dd>{c.valor}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className="p-hero-capas" aria-label="El cuerpo del atlas en tres capas">
          {(Object.keys(NOMBRE_DE_CAPA) as CapaDelCuerpo[]).map((capa) => (
            <li key={capa} className="p-hero-capa">
              <ImagenConCarga
                src={capas[capa].src}
                respaldo={capas[capa].respaldo}
                alt={capas[capa].alt}
                ancho={capas[capa].ancho}
                alto={capas[capa].alto}
                sizes="(max-width: 900px) 30vw, 220px"
                prioridad
                className="p-hero-capa-imagen"
              />
              <span className="p-hero-capa-nombre">{NOMBRE_DE_CAPA[capa]}</span>
            </li>
          ))}
        </ul>
      </div>
      <a href="#problema" className="p-hero-baja">
        <span>Baja</span>
        <ArrowDown size={16} aria-hidden />
      </a>
    </section>
  )
}
