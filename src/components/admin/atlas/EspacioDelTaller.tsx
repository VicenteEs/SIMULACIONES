'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Pestanas } from '@/components/ui/Pestanas'
import { TallerDeAtlas } from './TallerDeAtlas'

/**
 * El taller anatómico con sus dos pestañas: «Anatomía» (el cuerpo y las
 * preparaciones de siempre) e «Instrumental» (el listado de instrumentos y sus
 * modelos 3D), D-165.
 *
 * Las dos se quedan **montadas** una vez abiertas y se esconden con `hidden`: el
 * taller de anatomía guarda media hora de trabajo en su estado, y desmontarlo al
 * mirar un instrumento sería perderla sin avisar. La de instrumental no se monta
 * hasta que se la pide —lleva su propio visor y su propia carga— para que quien
 * solo viene a preparar anatomía no pague por ella.
 */
const TallerDeInstrumental = dynamic(() => import('./TallerDeInstrumental').then((m) => m.TallerDeInstrumental), { ssr: false })

export function EspacioDelTaller({
  esAdmin,
  preparacionInicial,
  comentarioInicial,
  pestanaInicial,
}: {
  esAdmin: boolean
  preparacionInicial?: string
  comentarioInicial?: string
  pestanaInicial: 'anatomia' | 'instrumental'
}) {
  const [activa, setActiva] = useState<string>(pestanaInicial)
  const [instrumentalAbierta, setInstrumentalAbierta] = useState(pestanaInicial === 'instrumental')

  return (
    <div className="atlas-con-pestanas">
      <Pestanas
        base="espacio"
        etiqueta="Taller"
        pestanas={[
          { id: 'anatomia', etiqueta: 'Anatomía' },
          { id: 'instrumental', etiqueta: 'Instrumental' },
        ]}
        activa={activa}
        alCambiar={(id) => {
          setActiva(id)
          if (id === 'instrumental') setInstrumentalAbierta(true)
        }}
      />
      <div role="tabpanel" id="espacio-panel-anatomia" aria-labelledby="espacio-pestana-anatomia" hidden={activa !== 'anatomia'}>
        <TallerDeAtlas esAdmin={esAdmin} preparacionInicial={preparacionInicial} comentarioInicial={comentarioInicial} />
      </div>
      <div role="tabpanel" id="espacio-panel-instrumental" aria-labelledby="espacio-pestana-instrumental" hidden={activa !== 'instrumental'}>
        {instrumentalAbierta ? <TallerDeInstrumental esAdmin={esAdmin} /> : null}
      </div>
    </div>
  )
}
