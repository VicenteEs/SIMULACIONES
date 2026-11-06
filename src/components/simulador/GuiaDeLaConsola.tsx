'use client'

import { useSyncExternalStore } from 'react'
import { CircleHelp, Layers, Scan, Wrench, X } from 'lucide-react'

/**
 * «Qué hay en la consola»: tres llamadas numeradas bajo la consola del
 * simulador, como en el tablero de Penpot (P-007 E4, D-237). Salen la primera
 * vez; quien las cierra no las vuelve a ver hasta que pulse «Qué hay en la
 * consola» para abrirlas otra vez.
 *
 * Van debajo de la consola y no encima de ella con globos sobre cada panel,
 * que es lo que dibuja Penpot: la consola son cinco mil líneas que reparten su
 * espacio según el ancho y el modo, y un globo anclado a un panel que se movió
 * señala a la nada. Aquí el número de cada tarjeta y su título bastan para
 * encontrar el panel.
 *
 * Lo cerrado se recuerda en el navegador (`localStorage`), porque es una
 * comodidad de quien mira y no un dato de la plataforma. Puede no haber
 * almacenamiento —ventana privada, datos bloqueados—: entonces se recuerda en
 * memoria mientras dure la página, y la guía se cierra igual al pulsar.
 */

const CLAVE = 'traumahub.guia-de-la-consola'

type Estado = 'abierta' | 'cerrada'

// Lo que se guardó cuando el almacenamiento no aceptó escribir.
let enMemoria: Estado | null = null
const oyentes = new Set<() => void>()

function leer(): Estado {
  if (enMemoria) return enMemoria
  try {
    return window.localStorage.getItem(CLAVE) === 'cerrada' ? 'cerrada' : 'abierta'
  } catch {
    return 'abierta'
  }
}

function guardar(estado: Estado) {
  enMemoria = estado
  try {
    if (estado === 'cerrada') window.localStorage.setItem(CLAVE, 'cerrada')
    else window.localStorage.removeItem(CLAVE)
    // Escrito de verdad: lo que manda vuelve a ser el almacenamiento, que es lo
    // que ven las otras pestañas.
    enMemoria = null
  } catch {
    // Se queda en memoria.
  }
  for (const avisar of oyentes) avisar()
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar)
  // Otra pestaña que la cierra o la abre.
  window.addEventListener('storage', avisar)
  return () => {
    oyentes.delete(avisar)
    window.removeEventListener('storage', avisar)
  }
}

const LLAMADAS = [
  {
    icono: Layers,
    titulo: 'Capas del paciente',
    texto: 'Encienda o apague piel, fascia, músculo y hueso para ver qué atraviesa cada instrumento.',
  },
  {
    icono: Scan,
    titulo: 'Fluoroscopia en vivo',
    texto:
      'Dispare el arco en C en AP, lateral u oblicua, acerque la imagen y arrastre la extremidad bajo el haz. La M agranda el monitor, con la última toma de la otra proyección al lado.',
  },
  {
    icono: Wrench,
    titulo: 'Mesa de instrumental',
    texto: 'Por familias, o pedido por su nombre con la tecla I: cada paso pide el instrumento correcto, y la consola lo comprueba al usarlo.',
  },
]

export function GuiaDeLaConsola() {
  // `null` en el servidor y en el primer pintado: allí no se sabe qué decidió
  // quien mira, y pintar la guía para quitarla un instante después la haría
  // parpadear justo a quien ya la había cerrado.
  const estado = useSyncExternalStore<Estado | null>(suscribir, leer, () => null)
  if (estado === null) return null

  if (estado === 'cerrada') {
    return (
      <div className="guia-consola-reabrir">
        <button type="button" className="boton boton-fantasma boton-sm" onClick={() => guardar('abierta')}>
          <CircleHelp size={16} aria-hidden="true" />
          Qué hay en la consola
        </button>
      </div>
    )
  }

  return (
    <section className="guia-consola" aria-labelledby="titulo-guia-consola">
      <div className="guia-consola-cabecera">
        <h2 id="titulo-guia-consola">Qué hay en la consola</h2>
        <button type="button" className="boton boton-fantasma boton-sm" onClick={() => guardar('cerrada')}>
          <X size={16} aria-hidden="true" />
          Entendido, ocultar
        </button>
      </div>
      <ol className="guia-consola-llamadas">
        {LLAMADAS.map(({ icono: Icono, titulo, texto }, i) => (
          <li key={titulo}>
            <span className="guia-consola-numero" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <h3>
                <Icono size={17} aria-hidden="true" />
                {titulo}
              </h3>
              <p>{texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
