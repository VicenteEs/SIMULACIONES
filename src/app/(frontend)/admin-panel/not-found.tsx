import Link from 'next/link'

/**
 * El «no encontrado» del panel, para que el 404 se pinte dentro del panel.
 *
 * Sin este archivo el `notFound()` del panel subía hasta el límite de
 * `(frontend)` —o, antes de que aquel existiera, hasta la pantalla por omisión
 * de Next— y el administrador perdía la barra lateral entera: se quedaba en una
 * página suelta, con los estilos de la parte pública, sin saber si seguía dentro
 * del panel o si lo habían echado. Estando aquí, el layout de `admin-panel`
 * sigue alrededor y la salida es un enlace más de la barra.
 *
 * Lo llaman cuatro sitios de `contenido/`, y los dos motivos son distintos y
 * conviene no confundirlos en el texto: la colección de la dirección no es
 * editable (`esColeccionEditable`) o el documento ya no está
 * (`contenido/[coleccion]/[id]/page.tsx`). El primero pasa al teclear una
 * dirección o al seguir un enlace viejo; el segundo, cuando alguien borra una
 * ficha y otro tenía la pestaña abierta —que en un panel con varias personas
 * dentro es lo corriente—.
 *
 * Sin props: un `not-found.tsx` no recibe ninguna
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`),
 * así que no hay forma de decir aquí cuál de los dos motivos fue. De ahí que el
 * texto nombre los dos en vez de adivinar uno.
 */
export default function NoEncontradoEnElPanel() {
  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Aquí no hay nada</h1>
        <p className="admin-subtitle">La dirección es válida, pero no lleva a ningún sitio.</p>
      </header>

      <div className="admin-aviso admin-aviso-atencion" role="status">
        <strong>Esa ficha ya no existe, o ese módulo no se edita desde aquí.</strong>
        Si venía siguiendo un enlace, puede que otra persona haya eliminado la ficha mientras usted
        la tenía abierta. No se ha perdido nada más: el resto del panel sigue en pie.
      </div>

      <div className="admin-acciones">
        <Link className="admin-btn admin-btn-primary" href="/admin-panel/contenido">
          Ver el contenido
        </Link>
        <Link className="admin-btn admin-btn-secondary" href="/admin-panel">
          Volver al resumen
        </Link>
      </div>
    </div>
  )
}
