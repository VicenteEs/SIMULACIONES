# Correo saliente

La plataforma envía correo para dos cosas, y solo una es crítica:

- **Elegir contraseña nueva.** Quien olvida su clave pide un enlace desde
  `/clave`. Sin servidor de correo, ese enlace no sale de la aplicación y hay
  que entregarlo a mano desde el panel.
- **Avisar de un comentario nuevo.** El gancho de
  `src/collections/Comentarios.ts` escribe a los administradores activos —hasta
  diez— cuando alguien comenta una ficha. Es solo un aviso: los comentarios se
  ven igual en el panel, en *Comentarios*.

Se configura con cinco variables en `.env`. La que decide es `SMTP_HOST`: si
está vacío, la aplicación arranca igual y no envía nada.

```bash
SMTP_HOST=
SMTP_PUERTO=587
SMTP_USUARIO=
SMTP_CLAVE=
SMTP_DESDE=no-responder@sudominio.cl
```

Las lee `src/payload.config.ts`. `SMTP_PUERTO` vale 587 si se deja vacío y
`SMTP_DESDE` cae en `no-responder@localhost`, que casi ningún servidor acepta:
conviene ponerlo siempre. El nombre del remitente es fijo, «Plataforma de
traumatología».

---

## El enlace para elegir contraseña nueva

Lo arma `correoDeClaveNueva`, en `src/collections/Usuarios.ts`, enganchada en
`auth.forgotPassword.generateEmailHTML`. Apunta a `NEXT_PUBLIC_SERVER_URL` +
`/clave/<testigo>`.

No es el correo que trae Payload, y hay motivo. El suyo manda a `serverURL` +
`/admin/reset/<testigo>`, y las dos mitades están mal en esta plataforma:

- **`serverURL` es solo el origen**, sin el `/traumahub`. Tiene que serlo:
  Payload lo mete en su lista de CSRF y lo compara con la cabecera `Origin`,
  que nunca lleva ruta. Con el prefijo puesto, descarta la cookie de sesión en
  toda acción (observación O-018 de `BITACORA.md`, y el comentario de
  `origenDe` en `src/lib/rutas.ts`).
- **`/admin` es la interfaz de Payload**, que se retiró (D-038). El panel es
  propio y vive en `/admin-panel`.

En el servidor compartido eso daba un enlace colgado de la raíz del dominio, es
decir **a otra página**, con el testigo de restablecimiento dentro.

`NEXT_PUBLIC_SERVER_URL` sí lleva el prefijo, así que la dirección sale entera
y apunta a la pantalla propia. Es la misma que entrega el panel cuando un
administrador genera el enlace a mano. Si esa variable está mal, el enlace está
mal: es lo primero que hay que mirar.

La ruta antigua no queda rota: `/admin/...` redirige a `/admin-panel`, y
`/admin/login` a `/entrar`. Es para que un marcador viejo llegue a alguna parte
en lugar de a un 404 sin explicación. Un `/admin/reset/<testigo>` de antes del
cambio acaba también en `/admin-panel` y pierde el testigo por el camino, pero
da igual: caducan en una hora, así que ninguno de los enviados entonces sigue
vivo.

### Cuánto dura el enlace

**Una hora**, y sirve **una sola vez**. Es la caducidad por omisión de Payload
—una hora en la operación `forgotPassword`— y aquí no se cambia. Además:

- Al usarlo, el testigo se marca como gastado. El segundo intento falla.
- Pedir otro enlace anula el anterior: cada petición reemplaza el testigo
  guardado en la cuenta.

Por eso es lo primero que hay que preguntar cuando alguien dice que el enlace
no le funciona. La pantalla responde «El enlace caducó o ya se usó. Pida uno
nuevo.» sin decir cuál de las dos cosas pasó, porque Payload tampoco lo
distingue: para él, el testigo o sirve o no sirve. La respuesta es la misma en
los dos casos, pedir otro.

---

## Sin servidor de correo

Es el estado de una instalación recién hecha: `scripts/instalar-servidor.sh`
escribe el `.env` con `SMTP_HOST` vacío. Conviene saber qué pasa exactamente.

- Payload se queda con su adaptador de consola, que **no escribe el mensaje**.
  Solo anota destinatario y asunto: «Email attempted without being
  configured». No hay ningún enlace que rescatar del registro.
- La recuperación de contraseña ni siquiera lo intenta.
  `pedirEnlaceDeClave`, en `src/app/(frontend)/acciones/sesion.ts`, desactiva
  el envío cuando falta `SMTP_HOST`. No sale correo y no queda nada anotado.
- Los avisos de comentario tampoco se mandan: el gancho comprueba `SMTP_HOST`
  antes de escribir a nadie.

Lo que sí funciona es entregar el enlace a mano: en el panel, *Usuarios y
permisos* → botón **Clave**. Genera el enlace de un solo uso y lo muestra en
pantalla para pasarlo por el canal que corresponda. La pantalla `/clave` ya se
lo dice a quien no reciba el correo.

Ese botón es solo de administrador, así que no sirve justo en el caso peor: que
quien se quedó fuera sea el único que hay. Para eso está el guion, que emite el
mismo enlace desde la consola del servidor y no necesita sesión ninguna:

```bash
npx tsx scripts/restablecer-clave.ts correo@ejemplo.cl
```

El panel lo dice en *Sistema*, en la comprobación «Correo saliente». Sin SMTP
queda marcada «Revisar»; con SMTP muestra el servidor y el puerto que está
usando, que es la forma rápida de ver si el contenedor tomó las variables
nuevas.

---

## Qué proveedor elegir

Son pocos correos al mes: restablecimientos de contraseña y algún aviso de
comentario. Cualquier plan gratuito sobra.

### Resend · lo más simple

Registro en `resend.com`, gratis hasta 3.000 correos al mes. Exige verificar un
dominio propio, así que sirve cuando exista uno.

```bash
SMTP_HOST=smtp.resend.com
SMTP_PUERTO=587
SMTP_USUARIO=resend
SMTP_CLAVE=re_xxxxxxxxxxxx     # la clave de API que entrega el panel
SMTP_DESDE=no-responder@sudominio.cl
```

### Brevo · sin dominio propio

Gratis hasta 300 correos al día y permite enviar desde una dirección verificada
sin tener dominio, lo que lo hace la opción práctica **mientras no haya uno**.
En el panel: *SMTP & API → SMTP*.

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PUERTO=587
SMTP_USUARIO=xxxxx@smtp-brevo.com
SMTP_CLAVE=xxxxxxxxxxxx
SMTP_DESDE=el-correo-verificado@gmail.com
```

### Gmail · solo para probar

Funciona, pero exige verificación en dos pasos activada y una **contraseña de
aplicación** —la contraseña normal de la cuenta no sirve—, y Google limita el
envío. Sirve para comprobar que el circuito funciona, no para producción.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PUERTO=587
SMTP_USUARIO=sucuenta@gmail.com
SMTP_CLAVE=abcd efgh ijkl mnop   # contraseña de aplicación, no la del correo
SMTP_DESDE=sucuenta@gmail.com
```

Se genera en `myaccount.google.com/apppasswords`.

---

## Comprobarlo

1. Reiniciar la aplicación para que tome las variables nuevas.
2. En `/entrar`, pulsar **Olvidé mi contraseña**.
3. Escribir el correo de una cuenta existente.
4. Debe llegar un mensaje con el enlace de restablecimiento.

La pantalla responde lo mismo exista o no la cuenta, a propósito: decir «ese
correo no está registrado» permitiría averiguar quién tiene acceso probando
direcciones. Así que el paso 4 es el único que confirma algo.

Conviene abrir el enlace y llegar hasta el final, no solo verlo llegar. Es lo
que descubre una dirección pública mal puesta: el correo sale, pero el enlace
lleva a otro sitio.

Si no llega, mirar el registro del servidor: los fallos de autenticación contra
el servidor de correo aparecen ahí con su motivo.

```bash
docker compose -f docker-compose.tailscale.yml logs -f app | grep -i mail
```

---

## Dos advertencias

**El puerto decide el cifrado.** El 465 exige TLS desde el saludo inicial; el
587 lo negocia después. La configuración de la plataforma deduce esto del número
de puerto, así que basta con poner el correcto y no hace falta tocar nada más.

**La clave del servidor de correo es un secreto.** Vive en `.env`, que está
ignorado por git. No debe acabar en el repositorio ni en una captura de
pantalla.
