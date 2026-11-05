/**
 * Lo que el servidor hace al arrancar, antes de atender la primera petición.
 *
 * Hoy es una sola cosa: programar la pasada diaria de los plazos de
 * conservación (D-290, `src/lib/conservacionProgramada.ts`). Next llama a
 * `register` una vez por servidor y espera a que termine, así que aquí solo se
 * programa: la pasada misma corre minutos después, fuera de este camino.
 *
 * Solo en el entorno de Node: Next también la llama para el de Edge, que no
 * tiene ni base de datos ni relojes que duren. Y nunca durante `next build`:
 * la compilación levanta trabajadores que pueden pasar por aquí, con una
 * `DATABASE_URI` de relleno (ver el `Dockerfile`), y no hay nada que limpiar en
 * una base que no existe.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { programarLaConservacion } = await import('./lib/conservacionProgramada')
  programarLaConservacion()
}
