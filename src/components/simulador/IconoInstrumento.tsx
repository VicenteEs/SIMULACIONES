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
  // Aguja curva con hilo.
  aguja: 'M4 16 C8 8 16 8 20 6 M20 6 l-3 1 M20 6 l-1 3',
  // Instrumento sin dibujo propio.
  generico: 'M12 4 v16 M8 8 h8',
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
