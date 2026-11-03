import type React from 'react'
import { MODULOS } from '@/app/(frontend)/admin-panel/modulos'
import { RevelarAlBajar } from '@/components/ui/RevelarAlBajar'
import type { PaginaLeida } from '@/lib/mediosDeLaPagina'
import { BarraDeVisitante } from './BarraDeVisitante'
import { CapasDelCuerpo } from './CapasDelCuerpo'
import { Capitulo } from './Capitulo'
import { CAPITULOS, type CapaDelCuerpo, type ClaveDeCapitulo } from './capitulos'
import { ComoEmpezar } from './ComoEmpezar'
import { Cotizar } from './Cotizar'
import { ElProblema } from './ElProblema'
import { fotoParaPintar, type FotoParaPintar } from './fotos'
import { Hero } from './Hero'
import { IlustracionExamina, IlustracionInterpreta, IlustracionOpera, IlustracionTecnica, LupaDeFluoroscopia } from './Ilustraciones'
import { PieDeVisitante } from './PieDeVisitante'
import { PreguntasFrecuentes } from './PreguntasFrecuentes'
import { Proximamente } from './Proximamente'
import { SobreNosotros } from './SobreNosotros'
import './portada.css'

/**
 * La portada pública (P-007 E3): el «Inicio · visitante v2» de Penpot
 * (D-231), armado por secciones.
 *
 * La reciben dos páginas: `/` cuando no hay sesión, y `/vista-previa` para que
 * el administrador vea lo que cambió en «Medios de la página» tal como lo ve
 * un visitante. Por eso no lee nada por su cuenta: todo llega en `pagina`
 * (`leerLaPaginaPublica`) y en `enMantencion`, y las dos páginas pintan lo
 * mismo con lo mismo.
 *
 * Cada sección después de la primera aparece al bajar (`RevelarAlBajar`), que
 * no esconde nada sin JavaScript ni con «reducir movimiento».
 */
export function PortadaPublica({
  pagina,
  enMantencion,
  vistaPrevia,
}: {
  pagina: PaginaLeida
  enMantencion: readonly string[]
  /** El aviso de arriba de `/vista-previa`; la portada de verdad no lo lleva. */
  vistaPrevia?: React.ReactNode
}) {
  const foto = (id: string) => fotoParaPintar(pagina, id)
  const capas: Record<CapaDelCuerpo, FotoParaPintar> = {
    piel: foto('portada.capas.piel'),
    musculo: foto('portada.capas.musculo'),
    hueso: foto('portada.capas.hueso'),
  }
  const modulosVisibles = MODULOS.map((m) => m.slug).filter((slug) => !enMantencion.includes(slug))

  const ilustraciones: Record<ClaveDeCapitulo, React.ReactNode> = {
    estudia: <CapasDelCuerpo capas={capas} />,
    examina: <IlustracionExamina foto={foto('portada.examina.imagen')} />,
    tecnica: <IlustracionTecnica foto={foto('portada.tecnica.imagen')} />,
    opera: <IlustracionOpera consola={foto('portada.opera.consola')} />,
    interpreta: (
      <IlustracionInterpreta
        coronal={foto('portada.interpreta.coronal')}
        axial={foto('portada.interpreta.axial')}
        sagital={foto('portada.interpreta.sagital')}
      />
    ),
  }

  return (
    <main className="portada">
      {vistaPrevia}
      <BarraDeVisitante textoCotizar={pagina.texto('portada.cotizar.antetitulo') || 'Cotizar'} />
      <Hero pagina={pagina} capas={capas} modulos={modulosVisibles.length} />
      <RevelarAlBajar>
        <ElProblema pagina={pagina} />
      </RevelarAlBajar>
      {CAPITULOS.map((capitulo, i) => (
        <RevelarAlBajar key={capitulo.clave}>
          <Capitulo
            capitulo={capitulo}
            pagina={pagina}
            enMantencion={enMantencion.includes(capitulo.modulo)}
            primero={i === 0}
            junto={capitulo.clave === 'opera' ? <LupaDeFluoroscopia foto={foto('portada.opera.fluoroscopia')} /> : null}
          >
            {ilustraciones[capitulo.clave]}
          </Capitulo>
        </RevelarAlBajar>
      ))}
      <RevelarAlBajar>
        <Proximamente pagina={pagina} />
      </RevelarAlBajar>
      <RevelarAlBajar>
        <ComoEmpezar pagina={pagina} />
      </RevelarAlBajar>
      <RevelarAlBajar>
        <SobreNosotros pagina={pagina} />
      </RevelarAlBajar>
      <RevelarAlBajar>
        <PreguntasFrecuentes pagina={pagina} />
      </RevelarAlBajar>
      <Cotizar pagina={pagina} modulosVisibles={modulosVisibles} />
      <PieDeVisitante pagina={pagina} />
    </main>
  )
}
