import { PREFIJO } from '@/lib/rutas'

/**
 * El `path` de las cookies que escribe la plataforma: el prefijo, no la raíz.
 *
 * Son dos, y viven y mueren en el mismo path: el testigo de sesión, que
 * escriben y borran `entrar()`, `salir()`, `fijarClaveNueva()` y
 * `crearPrimeraCuenta()` en `acciones/sesion.ts`, y la de vista previa de rol,
 * que escribe y borra `api/vista-previa/route.ts` y que `entrar()` y `salir()`
 * vuelven a borrar.
 *
 * ## Por qué un solo sitio
 *
 * El valor estuvo escrito dos veces, una en cada uno de esos dos archivos,
 * porque `sesion.ts` lleva `'use server'` —solo puede exportar funciones
 * asíncronas— y un `route.ts` solo puede exportar lo que Next reconoce. Ninguno
 * de los dos podía prestárselo al otro, y la copia dependía de que nadie tocara
 * una sin la otra. Lo que se rompe si se separan no se ve mirando ninguno de
 * los dos: un `delete` con un path distinto del que se usó al escribir **no
 * caduca nada**. La simulación de rol sobrevive a cerrar la sesión y la
 * siguiente —otra persona, en la estación compartida del hospital— empieza
 * viendo la plataforma como el rol que eligió la anterior. Y en desarrollo ni
 * se nota, porque sin prefijo las dos copias valen `/` y coinciden por
 * casualidad.
 *
 * Es un módulo aparte, y no una constante dentro de `vistaPrevia.ts` o de
 * `rutas.ts`, porque lo leen las dos cookies y no es de ninguna de ellas:
 * colgarlo de la vista previa haría creer que el testigo de sesión puede ir por
 * su lado, y es justo lo que no puede.
 * `tests/unit/pathDeLasCookies.test.ts` falla si alguien vuelve a derivar el
 * path a mano en otro archivo.
 *
 * ## Por qué el prefijo y no `/`
 *
 * En el servidor TraumaHub no tiene un origen propio: comparte esquema, dominio
 * y puerto con las otras páginas que cuelgan del mismo proxy —`/` y `/api` son
 * de otra, y también `/equipo` y `/senales`; está descrito en
 * `despliegue/paginas/LEEME.md`—. Con `path: '/'` el navegador adjuntaba el
 * testigo en **cada** petición a cualquiera de ellas, y ese testigo abre la
 * plataforma entera durante ocho horas sin pedir contraseña: vale por sí solo,
 * como quedó comprobado al aislar el fallo de 66bdc2d. Basta con que una de esas
 * páginas —proyectos distintos, con su propio despliegue— anote cabeceras en un
 * registro de acceso para que la sesión del administrador quede escrita fuera
 * de aquí. La de vista previa no abre nada —solo baja privilegios, y
 * `rolEfectivo` la valida contra el rol real—, pero es una cookie de sesión de
 * esta plataforma paseándose por sitios que no son suyos, y el motivo vale
 * igual.
 *
 * Lo que esto **no** cierra: un guion inyectado en cualquiera de esas páginas
 * sigue pudiendo llamar a `/traumahub/api/…` con `credentials: 'include'` —el
 * path casa, y el `Origin` coincide con `serverURL`, así que la comprobación
 * CSRF de Payload también pasa—. Eso solo lo cierra un nombre de servidor
 * propio para la plataforma.
 *
 * Por qué la cookie de sesión además cambió de nombre —las que las sesiones
 * antiguas dejaron en `/` siguen ganando mientras vivan—, y por qué la de vista
 * previa no, está explicado en `acciones/sesion.ts`, junto a
 * `nombreDeLaCookieDeSesion()`.
 */
export const PATH_DE_LAS_COOKIES = PREFIJO || '/'
