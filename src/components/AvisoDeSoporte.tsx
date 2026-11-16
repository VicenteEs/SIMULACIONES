/**
 * La franja del administrador de TraumaHub que entró a una institución como
 * soporte: el fantasma (D-371, D-404).
 *
 * Dentro trabaja como el administrador de la institución y ve lo mismo que él,
 * así que sin esta franja nada le diría dónde está: la página es igual a la de
 * TraumaHub con otras fichas. Dice también lo que no se ve, que lo que haga
 * queda en el registro de TraumaHub y no en el de la institución, porque es lo
 * que cambia respecto de trabajar en la central.
 *
 * El enlace de vuelta lleva a la dirección de TraumaHub, que es otro anfitrión:
 * allí la sesión es otra, y como entrar cierra las demás (D-388), hay que
 * volver a entrar.
 */
export function AvisoDeSoporte({ institucion, central }: { institucion: string; central: string }) {
  return (
    <div className="aviso-de-soporte" role="status">
      Está en <strong>{institucion}</strong> como soporte de TraumaHub. Ve y administra lo mismo que su administrador,
      y lo que haga queda en el registro de TraumaHub, no en el de la institución. <a href={central}>Volver a TraumaHub</a>
    </div>
  )
}
