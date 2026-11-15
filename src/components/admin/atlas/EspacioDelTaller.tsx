'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { Pestanas } from '@/components/ui/Pestanas'
import { guardarElTema } from '@/app/(frontend)/acciones/atlas'
import { TEMAS, temaValido, type Tema } from '@/lib/temas'
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
 *
 * Aquí vive también la paleta (P-014 E7): el dueño pidió que el médico eligiera
 * entre las tres propuestas «en el taller anatómico», y que cambiara el taller y
 * el simulador. El desplegable va junto a las pestañas porque vale para las dos;
 * la caja que las envuelve lleva `data-tema`, y de ahí cuelgan los colores
 * (`admin.css`). Se pinta al elegir, sin esperar al servidor, porque elegir una
 * paleta es mirarla: si no se pudo guardar se vuelve a la de antes y se dice.
 */
const TallerDeInstrumental = dynamic(() => import('./TallerDeInstrumental').then((m) => m.TallerDeInstrumental), { ssr: false })

export function EspacioDelTaller({
  esAdmin,
  preparacionInicial,
  comentarioInicial,
  pestanaInicial,
  temaInicial,
}: {
  esAdmin: boolean
  preparacionInicial?: string
  comentarioInicial?: string
  pestanaInicial: 'anatomia' | 'instrumental'
  /** La paleta que la plataforma tiene guardada al abrir el taller. */
  temaInicial: Tema
}) {
  const [activa, setActiva] = useState<string>(pestanaInicial)
  const [instrumentalAbierta, setInstrumentalAbierta] = useState(pestanaInicial === 'instrumental')
  const [tema, setTema] = useState<Tema>(temaInicial)
  const [avisoDelTema, setAvisoDelTema] = useState<string | null>(null)
  const [guardandoElTema, empezarAGuardar] = useTransition()

  const elegirElTema = (nuevo: Tema) => {
    const anterior = tema
    setTema(nuevo)
    setAvisoDelTema(null)
    empezarAGuardar(async () => {
      // Una acción de servidor que no llega —la red, el servidor reiniciándose— no devuelve `exito: false`:
      // lanza. Dentro de una transición ese fallo sube hasta el límite de error de la página, y el taller se
      // iría entero, con el trabajo sin guardar dentro, por un cambio de color. Se recoge aquí.
      const respuesta = await guardarElTema(nuevo).catch(() => null)
      if (respuesta?.exito) return
      setTema(anterior)
      setAvisoDelTema(respuesta?.mensaje ?? 'No se pudo guardar la paleta. Compruebe la conexión y vuelva a elegirla.')
    })
  }

  return (
    <div className="atlas-con-pestanas" data-tema={tema}>
      <div className="atlas-cabecera-del-taller">
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
        <label className="atlas-paleta" title="Los colores del taller y del simulador. Vale para toda la plataforma: es lo que verán los residentes.">
          Paleta
          <select value={tema} disabled={guardandoElTema} onChange={(evento) => elegirElTema(temaValido(evento.target.value))}>
            {TEMAS.map((t) => (
              <option key={t.valor} value={t.valor} title={t.resumen}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      {avisoDelTema ? (
        <p className="atlas-paleta-aviso" role="alert">
          {avisoDelTema}
        </p>
      ) : null}
      <div role="tabpanel" id="espacio-panel-anatomia" aria-labelledby="espacio-pestana-anatomia" hidden={activa !== 'anatomia'}>
        <TallerDeAtlas esAdmin={esAdmin} preparacionInicial={preparacionInicial} comentarioInicial={comentarioInicial} />
      </div>
      <div role="tabpanel" id="espacio-panel-instrumental" aria-labelledby="espacio-pestana-instrumental" hidden={activa !== 'instrumental'}>
        {instrumentalAbierta ? <TallerDeInstrumental esAdmin={esAdmin} /> : null}
      </div>
    </div>
  )
}
