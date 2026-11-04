import Image from 'next/image'
import Link from 'next/link'
import { BarChart3, BookOpen, Lock, Scissors } from 'lucide-react'
import { MallaDeNodos } from '@/components/MallaDeNodos'
import { IMAGENES_DE_PARTIDA } from '@/components/portada/imagenes'
import { ruta } from '@/lib/rutas'
import './acceso.css'

/**
 * Los paneles oscuros de `/entrar` y `/registro` (P-007 E3, D-236), copiados
 * de los tableros de Penpot.
 *
 * Las figuras son las capturas del atlas con que parte la portada, las
 * originales y no las que se hayan cambiado en «Medios de la página»: esos
 * espacios son de la portada, y una foto subida para el titular no tiene por
 * qué servir de pie en esta columna estrecha. Son decorativas (`alt=""`): lo
 * que dicen ya está escrito al lado.
 */

/** La píldora de la marca, que lleva a la portada: sin la barra de la plataforma, es la única salida. */
export function LogoDeAcceso({ claro = false }: { claro?: boolean }) {
  return (
    <Link href="/" className={`ac-logo${claro ? ' ac-logo-claro' : ''}`} aria-label="TraumaHub, volver a la portada">
      <img src={ruta('/icon.png')} alt="" width={32} height={32} />
      <span>
        TraumaHub
        <span className="ac-logo-sub">Plataforma docente</span>
      </span>
    </Link>
  )
}

const CAPAS = ['capa-piel', 'capa-musculo', 'capa-hueso'] as const

export function PanelDeEntrar() {
  return (
    <aside className="ac-marca" aria-label="TraumaHub">
      <MallaDeNodos className="ac-marca-malla" />
      <LogoDeAcceso />
      <p className="ac-marca-titular">Su plataforma docente, a un paso.</p>
      <p className="ac-marca-bajada">Retome la lectura donde la dejó, practique en el simulador y revise las técnicas AO.</p>
      <div className="ac-figuras" aria-hidden="true">
        {CAPAS.map((capa) => (
          // `sizes` es el ancho que pinta la hoja: 360 px de alto por la
          // proporción de las capturas. Sin él, `next/image` sirve la de 690 px
          // para una columna de 143. En el teléfono la hoja las oculta, y al ir
          // con carga diferida no llegan a pedirse.
          <Image key={capa} src={IMAGENES_DE_PARTIDA[capa]} alt="" sizes="150px" />
        ))}
      </div>
    </aside>
  )
}

/**
 * «Lo que te espera adentro»: lo mismo que promete la portada, en tres líneas,
 * a quien está a punto de pedir la cuenta. La nota del candado dice quién ve
 * los datos sin prometer más de lo que hace la plataforma: los ven sus
 * administradores, no uno «de su programa», que el tablero daba por hecho y la
 * plataforma no distingue.
 */
export function PanelDeRegistro() {
  return (
    <aside className="ac-marca ac-marca-registro" aria-labelledby="registro-promesas">
      <MallaDeNodos className="ac-marca-malla" />
      <Image className="ac-marca-figura" src={IMAGENES_DE_PARTIDA['capa-musculo']} alt="" aria-hidden sizes="120px" />
      <h2 id="registro-promesas">Lo que te espera adentro</h2>
      <ul className="ac-promesas">
        <li>
          <span aria-hidden>
            <BookOpen size={20} />
          </span>
          Fichas por segmento, de la definición a la rehabilitación
        </li>
        <li>
          <span aria-hidden>
            <Scissors size={20} />
          </span>
          El simulador del pabellón, con fluoroscopia en tres proyecciones
        </li>
        <li>
          <span aria-hidden>
            <BarChart3 size={20} />
          </span>
          Tu avance por módulo, para saber qué te falta
        </li>
      </ul>
      <p className="ac-candado">
        <Lock size={20} aria-hidden />
        {/* Antes decía que solo los veían los administradores, y el aviso (Q-005) dice otra cosa: los editores ven los
            comentarios con su nombre y su correo. La promesa del panel no puede ser más ancha que la del aviso. */}
        <span>
          Tus datos se usan solo para la plataforma. Quién los ve y dónde se guardan lo dice el{' '}
          <Link href="/privacidad">aviso de privacidad</Link>.
        </span>
      </p>
    </aside>
  )
}
