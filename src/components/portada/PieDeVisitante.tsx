import Link from 'next/link'
import { LogoChessCore } from '@/components/LogoChessCore'
import { AUTORIA } from '@/lib/autoria'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { ruta } from '@/lib/rutas'
import { Ancla } from './Ancla'
import { CAPITULOS } from './capitulos'

/**
 * El pie de la portada pública, el de Penpot: marca y lema, tres columnas de
 * enlaces y la firma.
 *
 * Reemplaza al pie de toda la plataforma solo en esta página: el de siempre
 * se sigue montando desde `layout.tsx` y lo esconde la hoja
 * (`body:has(> .portada) > .pie-de-pagina`), igual que dentro del panel. Por
 * eso este repite lo que aquel no puede perder: quién lo desarrolla, con el
 * nombre de `AUTORIA` (D-121), y el crédito de BodyParts3D que exige su
 * licencia.
 *
 * Los módulos enlazan a su capítulo y no a su página: quien llega aquí no
 * tiene cuenta, y la página del módulo lo mandaría a «Entrar».
 */
export function PieDeVisitante({ pagina, enLaPortada = true }: { pagina: PaginaLeida; enLaPortada?: boolean }) {
  const correo = pagina.texto('general.correo')
  const lema = pagina.texto('general.lema')

  return (
    <footer className="p-pie p-oscuro">
      <div className="p-contenedor">
        <div className="p-pie-rejilla">
          <div className="p-pie-marca">
            <Link href="/" className="p-marca" aria-label="TraumaHub, inicio">
              <img src={ruta('/icon.png')} alt="" width={30} height={30} />
              <span>
                TraumaHub
                <span className="p-marca-sub">Plataforma docente</span>
              </span>
            </Link>
            {lema ? <p>{lema}</p> : null}
          </div>
          <nav aria-label="Plataforma">
            <h2 className="p-rotulo-mono">Plataforma</h2>
            <ul>
              <li>
                <Ancla id="problema" enLaPortada={enLaPortada}>
                  Qué resuelve
                </Ancla>
              </li>
              <li>
                <Ancla id="empezar" enLaPortada={enLaPortada}>
                  Cómo empezar
                </Ancla>
              </li>
              <li>
                <Link href="/planes">Planes</Link>
              </li>
              <li>
                <Ancla id="nosotros" enLaPortada={enLaPortada}>
                  Equipo
                </Ancla>
              </li>
              <li>
                <Ancla id="preguntas" enLaPortada={enLaPortada}>
                  Preguntas
                </Ancla>
              </li>
            </ul>
          </nav>
          <nav aria-label="Módulos">
            <h2 className="p-rotulo-mono">Módulos</h2>
            <ul>
              {CAPITULOS.map((c) => (
                <li key={c.clave}>
                  <Ancla id={c.clave} enLaPortada={enLaPortada}>
                    {c.nombreDelModulo}
                  </Ancla>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Contacto">
            <h2 className="p-rotulo-mono">Contacto</h2>
            <ul>
              <li>
                <Ancla id="cotizar" enLaPortada={enLaPortada}>
                  Cotizar
                </Ancla>
              </li>
              <li>
                <a href={`mailto:${correo}`}>{correo}</a>
              </li>
              <li>
                <Link href="/creditos">Créditos y licencias</Link>
              </li>
              <li>
                <Link href="/privacidad">Aviso de privacidad</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="p-pie-firma">
          <p className="p-pie-autoria">
            <span>Desarrollado por</span>
            <LogoChessCore sobre="oscuro" alto={44} />
            <span>{AUTORIA.nombre}</span>
          </p>
          <p>Modelo anatómico: BodyParts3D · licencia CC BY 4.0</p>
        </div>
      </div>
    </footer>
  )
}
