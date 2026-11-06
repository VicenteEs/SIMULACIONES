'use client'

import { useEffect, useState } from 'react'
import { Gauge, Timer } from 'lucide-react'
import {
  avisoDelManguito,
  estadoDelManguito,
  lecturaDelManguito,
  relojEnPalabras,
  relojEnTexto,
  segundosDelReloj,
  type ManguitoDelCaso,
  type ManguitoEnLaConsola,
  type Reloj,
} from '@/lib/relojesDelCaso'

/**
 * Los relojes de la barra de la consola (P-012 E5): el del procedimiento y, si el caso lo usa, el del manguito con su
 * botón de inflar y soltar.
 *
 * Son un componente aparte por el segundero. La consola es un componente de siete mil líneas, y con el segundo en su
 * estado cada tic la volvía a pintar entera, con el lienzo dentro. Aquí el tic repinta solo esta caja. La consola cambia
 * los relojes únicamente cuando pasa algo: la incisión, inflar, soltar o terminar.
 *
 * Nada de esto es una región viva. Un lector de pantalla que anunciara el reloj cada segundo no dejaría oír otra cosa. Lo
 * que importa de verdad, el aviso del manguito, lo dice la consola en «Lo que va pasando», que sí se anuncia.
 */
export function RelojesDeLaConsola({
  procedimiento,
  manguito,
  datosDelManguito,
  enJuego,
  alInflar,
  alSoltar,
}: {
  procedimiento: Reloj
  /** `null` si el caso no usa manguito: entonces no se enseña su reloj. */
  manguito: ManguitoEnLaConsola | null
  datosDelManguito: ManguitoDelCaso | null
  /** Hay un recorrido en marcha: sin él (eligiendo el modo, terminado o repasando), el manguito no se toca. */
  enJuego: boolean
  alInflar: () => void
  alSoltar: () => void
}) {
  const corre = procedimiento.desde !== null || (manguito?.periodo?.desde ?? null) !== null
  // La hora del último tic. Empieza en cero y se queda en la del último tic con los relojes parados: un reloj parado no la
  // mira (`segundosDelReloj` suma solo desde `desde`), y uno que se acaba de poner en marcha tiene su `desde` después de
  // ella, así que marca lo que llevaba hasta el tic siguiente. La hora se lee en el temporizador y no al pintar, que es
  // lo que pide `react-hooks/purity`: dos pintados del mismo estado tienen que dar lo mismo.
  const [ahora, setAhora] = useState(0)
  useEffect(() => {
    if (!corre) return
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [corre])

  const empezado = procedimiento.desde !== null || procedimiento.acumulado > 0
  const segundos = segundosDelReloj(procedimiento, ahora)

  return (
    <div className="consola-relojes" role="group" aria-label="Relojes del caso">
      <p
        className={`consola-reloj${empezado ? '' : ' en-espera'}`}
        title="Tiempo del procedimiento: cuenta desde la primera incisión y se para al terminar el caso."
      >
        <Timer size={14} aria-hidden />
        <span className="consola-reloj-nombre">Cirugía</span>
        <span className="consola-reloj-cifra u-num" aria-hidden>
          {relojEnTexto(segundos)}
        </span>
        <span className="sr-only">
          {empezado ? `${relojEnPalabras(segundos)} desde la incisión` : 'empieza con la primera incisión'}
        </span>
      </p>
      {manguito && datosDelManguito ? (
        <RelojDelManguito
          manguito={manguito}
          datos={datosDelManguito}
          ahora={ahora}
          enJuego={enJuego}
          alInflar={alInflar}
          alSoltar={alSoltar}
        />
      ) : null}
    </div>
  )
}

function RelojDelManguito({
  manguito,
  datos,
  ahora,
  enJuego,
  alInflar,
  alSoltar,
}: {
  manguito: ManguitoEnLaConsola
  datos: ManguitoDelCaso
  ahora: number
  enJuego: boolean
  alInflar: () => void
  alSoltar: () => void
}) {
  const lectura = lecturaDelManguito(manguito, ahora)
  // El estado es el del período de ahora: el tope es de un período seguido, no del total (`ManguitoEnLaConsola`).
  const estado = lectura.inflado ? estadoDelManguito(lectura.periodo, datos.tope) : null
  const enPalabras = lectura.inflado
    ? `inflado a ${datos.presion} mmHg hace ${relojEnPalabras(lectura.periodo)}` +
      (estado === 'pasado' ? ', pasado del tope' : estado === 'aviso' ? ', cerca del tope' : '')
    : 'desinflado'
  return (
    <div
      className={`consola-reloj consola-reloj-manguito${lectura.inflado ? ` inflado ${estado}` : ''}`}
      title={`Manguito de isquemia a ${datos.presion} mmHg. Avisa a los ${avisoDelManguito(datos.tope)} min seguidos y marca los ${datos.tope}, el tope del caso; soltarlo y volver a inflar empieza otro período.${lectura.total > lectura.periodo ? ` En total lleva ${relojEnPalabras(lectura.total)}.` : ''}`}
    >
      <Gauge size={14} aria-hidden />
      <span className="consola-reloj-nombre">Manguito</span>
      {lectura.inflado ? (
        <span className="consola-reloj-presion u-num" aria-hidden>
          {datos.presion} mmHg
        </span>
      ) : null}
      <span className="consola-reloj-cifra u-num" aria-hidden>
        {lectura.inflado ? relojEnTexto(lectura.periodo) : 'suelto'}
      </span>
      <span className="sr-only">
        {enPalabras}
        {lectura.total > lectura.periodo ? `; ${relojEnPalabras(lectura.total)} en total` : ''}
      </span>
      <button
        type="button"
        className="consola-reloj-boton"
        disabled={!enJuego}
        aria-label={lectura.inflado ? 'Soltar el manguito' : `Inflar el manguito a ${datos.presion} mmHg`}
        onClick={lectura.inflado ? alSoltar : alInflar}
      >
        {lectura.inflado ? 'Soltar' : 'Inflar'}
      </button>
    </div>
  )
}
