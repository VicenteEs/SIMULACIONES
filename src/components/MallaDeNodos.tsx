/**
 * Malla de nodos del fondo de la portada.
 *
 * Es el mismo gesto del logotipo —el hueso dibujado como una red de puntos y
 * aristas— traído al fondo de la página. No ilustra nada clínico y por eso no
 * compite con el contenido: es textura de marca, se queda detrás y se marca
 * como decorativa para que ningún lector de pantalla la anuncie.
 *
 * Las coordenadas están escritas a mano y no generadas al azar: una red
 * aleatoria en cada carga se nota, y lo que se nota en un fondo distrae.
 */

const NODOS: [number, number, number][] = [
  // x, y, radio
  [60, 40, 2.5],
  [180, 25, 1.8],
  [300, 70, 3],
  [120, 120, 2],
  [255, 150, 2.2],
  [40, 200, 1.8],
  [170, 215, 2.8],
  [330, 195, 2],
  [90, 300, 2.4],
  [230, 285, 1.8],
  [350, 320, 2.6],
  [140, 380, 2],
  [285, 400, 2.2],
  [55, 430, 1.8],
  [200, 470, 2.5],
  [345, 465, 1.9],
]

const ARISTAS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [3, 1],
  [2, 4],
  [3, 4],
  [3, 5],
  [4, 7],
  [5, 6],
  [6, 4],
  [6, 7],
  [5, 8],
  [6, 9],
  [7, 10],
  [8, 9],
  [9, 10],
  [8, 11],
  [9, 12],
  [10, 12],
  [11, 13],
  [11, 14],
  [12, 14],
  [12, 15],
  [14, 15],
]

export function MallaDeNodos({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 390 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="0.7" opacity="0.5">
        {ARISTAS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={NODOS[a][0]}
            y1={NODOS[a][1]}
            x2={NODOS[b][0]}
            y2={NODOS[b][1]}
          />
        ))}
      </g>
      <g fill="currentColor">
        {NODOS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={0.35 + (i % 3) * 0.2} />
        ))}
      </g>
    </svg>
  )
}
