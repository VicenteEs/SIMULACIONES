/**
 * ¿Viene esta petición de la propia plataforma?
 *
 * Una acción de servidor trae esta comprobación puesta por Next; un manejador
 * de ruta, no. Sin ella, la cookie de sesión —acotada al prefijo, pero
 * compartida con las otras páginas del mismo dominio— dejaría que un guion de
 * cualquiera de esas páginas llamara a la ruta con la sesión del traumatólogo.
 *
 * Es la misma regla que escribió para sí la ruta de subidas
 * (`src/app/(frontend)/api/subidas/[coleccion]/route.ts`, `vieneDeAqui`), con
 * el porqué entero allí: se compara el anfitrión y no el origen, porque detrás
 * del proxy los esquemas no coinciden nunca; vale `x-forwarded-host` o `host`,
 * porque cada tramo de la cadena pone uno distinto; y sin `Origin` pasa, como
 * en Next. Se saca aquí para que la ruta de presencia no la copie una tercera
 * vez; la de subidas puede pasar a usar esta cuando se toque.
 */
export function vieneDeAqui(peticion: Request): boolean {
  const origen = peticion.headers.get('origin')
  if (!origen) return true

  let anfitrionDelOrigen: string
  try {
    anfitrionDelOrigen = new URL(origen).host
  } catch {
    return false
  }

  const cabeceraReenviada = peticion.headers.get('x-forwarded-host')
  const reenviado = cabeceraReenviada ? cabeceraReenviada.split(',')[0].trim() : null
  const propio = peticion.headers.get('host')
  return (
    (reenviado !== null && anfitrionDelOrigen === reenviado) ||
    (propio !== null && anfitrionDelOrigen === propio.trim())
  )
}
