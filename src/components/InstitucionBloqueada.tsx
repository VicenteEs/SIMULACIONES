import { Lock } from 'lucide-react'

/**
 * Lo que se ve en el subdominio de una institución bloqueada (D-371, D-403): su
 * plazo terminó y nadie la extendió.
 *
 * Lo pinta la plantilla en lugar de la página pedida, como
 * `InstitucionQueNoExiste`, y por lo mismo: en ella no vale ninguna cuenta, y
 * `/entrar` solo serviría para leer un error después de escribir la contraseña.
 *
 * Dice que no se perdió nada, porque es lo primero que teme quien la ve, y a
 * quién acudir: no a TraumaHub, con quien no habla un alumno, sino a quien
 * administra la plataforma en su institución, que es quien firmó el plazo. El
 * borrado a los doce meses no se menciona aquí: se le avisa a quien puede
 * evitarlo, por correo, y no a quien solo puede asustarse.
 */
export function InstitucionBloqueada({ nombre, central }: { nombre: string; central: string }) {
  return (
    <main>
      <div className="estado">
        <span className="estado-icono" aria-hidden="true">
          <Lock size={34} strokeWidth={1.6} />
        </span>
        <h1>El plazo de {nombre} en TraumaHub terminó</h1>
        <p>
          Mientras no se extienda, nadie puede entrar ni pedir una cuenta aquí. Las cuentas y lo que guardaron siguen
          como estaban: vuelven en cuanto el plazo se renueve. Pregunte a quien administra la plataforma en su
          institución.
        </p>
        {central ? (
          <div className="fila-botones">
            <a className="boton" href={central}>
              Ir a TraumaHub
            </a>
          </div>
        ) : null}
      </div>
    </main>
  )
}
