/**
 * Iconos de la bandeja de instrumental.
 *
 * Trazos sueltos y no una librería de iconos, por lo mismo que en el resto del
 * panel: no se arrastra un paquete entero por once dibujos. Cada uno es una
 * silueta reconocible a 22 píxeles, que es el tamaño al que se ven de verdad.
 *
 * El traumatólogo elige cuál le toca a cada instrumento desde el catálogo. Es
 * la única parte del vocabulario que no puede ampliar por su cuenta, y se
 * acepta a cambio de que la bandeja se vea siempre igual: un icono subido como
 * archivo llegaría con cualquier tamaño, cualquier grosor y cualquier color.
 */

const TRAZOS: Record<string, string> = {
  // Hoja y mango.
  bisturi: 'M4 19 L11 12 M11 12 L18 5 C19 4 20 5 19 6 L13 13 Z',
  // Dos valvas enfrentadas.
  separador: 'M6 5 v9 a3 3 0 0 0 3 3 M18 5 v9 a3 3 0 0 1 -3 3',
  // Ramas cruzadas y punta.
  pinza: 'M5 4 L19 20 M19 4 L5 20',
  // Anillos y hojas.
  tijera: 'M6 20 a2 2 0 1 0 0-4 a2 2 0 0 0 0 4 M18 20 a2 2 0 1 0 0-4 a2 2 0 0 0 0 4 M7 17 L17 4 M17 17 L7 4',
  // Vástago con punta.
  punzon: 'M12 3 v13 M12 16 l-2 5 h4 z',
  // Alambre curvo.
  guia: 'M5 19 C9 19 8 12 12 12 C16 12 15 5 19 5',
  // Cabeza dentada.
  fresa: 'M12 4 v10 M8 14 h8 l-2 6 h-4 z M9 8 h6 M9 11 h6',
  // Maza.
  martillo: 'M6 6 h9 v4 h-9 z M10 10 v10',
  // Mango y punta cruciforme.
  atornillador: 'M12 3 v10 M9 13 h6 v3 h-6 z M12 16 v5',
  // Una regla con sus marcas y el gancho de la punta: el medidor de profundidad, que da su cuadro a «Medidores» (P-009).
  medidor: 'M10 3 v15 l3 3 M10 6 h3 M10 9 h2 M10 12 h3 M10 15 h2',
  // Aguja curva con hilo.
  aguja: 'M4 16 C8 8 16 8 20 6 M20 6 l-3 1 M20 6 l-1 3',
  // Una placa con sus agujeros (los puntos son trazos de largo cero con extremos redondos).
  placa: 'M3 10 h18 v4 h-18 z M7 12 h.01 M12 12 h.01 M17 12 h.01',
  // Cabeza, vástago y rosca.
  tornillo: 'M8 3 h8 M12 3 v3 M9 6 h6 M12 6 v15 M9 10 l3 1.5 M15 13 l-3 1.5 M9 16 l3 1.5',
  // Un clavo largo con dos agujeros de bloqueo.
  clavo: 'M12 3 v18 M10 7 h4 M10 17 h4 M11 4 v-.5 M13 4 v-.5',
  // Un bloque irregular de hueso.
  injerto: 'M5 9 L9 6 L16 7 L19 11 L18 17 L12 20 L6 18 Z M9 11 h.01 M14 13 h.01 M11 16 h.01',
  // Los tres que siguen dibujan una familia en su cuadro de la mesa (P-008 E6) y el catálogo no los ofrece: con el
  // genérico, «Periostio», «Perforación» y «Modelado» eran la misma raya.
  // Mango y espátula redondeada: el periostótomo y el elevador.
  elevador: 'M12 3 v10 M9 13 h6 v3 a3 3 0 0 1 -6 0 z',
  // Vástago y cuerpo con sus estrías hasta la punta: la broca.
  broca: 'M12 3 v5 M10 8 h4 l-2 13 z M10.6 11 l2.8 1.6 M11.1 14.5 l2 1.2',
  // Una placa doblada, con sus agujeros: el modelado.
  'placa-curva': 'M3 14 C7 14 9 8 14 8 H21 V11 H14 C10 11 8 17 3 17 Z M6.5 15.5 h.01 M17.5 9.5 h.01',
  // Instrumento sin dibujo propio.
  generico: 'M12 4 v16 M8 8 h8',
}

/** Si hay dibujo con ese nombre. Un nombre desconocido no falla: sale el genérico, y eso es lo que se vigila. */
export function tieneDibujo(nombre: string): boolean {
  return Object.hasOwn(TRAZOS, nombre)
}

export function IconoInstrumento({ nombre = 'generico' }: { nombre?: string | null }) {
  const trazo = TRAZOS[nombre ?? 'generico'] ?? TRAZOS.generico
  return (
    <svg
      className="instrumento-icono"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={trazo} />
    </svg>
  )
}
