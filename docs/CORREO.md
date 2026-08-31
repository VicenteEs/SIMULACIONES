# Correo saliente

La plataforma necesita enviar correo para una sola cosa, pero importante:
**recuperar la contraseña**. Sin un servidor configurado, Payload escribe los
mensajes en la consola del servidor en lugar de enviarlos, de modo que quien
olvide su clave depende de que un administrador se la restablezca a mano.

Se configura con cinco variables en `.env`. Si `SMTP_HOST` está vacío, la
aplicación arranca igual y vuelve al comportamiento de consola: útil en
desarrollo, insuficiente en producción.

```bash
SMTP_HOST=
SMTP_PUERTO=587
SMTP_USUARIO=
SMTP_CLAVE=
SMTP_DESDE=no-responder@sudominio.cl
```

---

## Qué proveedor elegir

Son pocos correos al mes: solo restablecimientos de contraseña. Cualquier plan
gratuito sobra.

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
2. En `/admin`, cerrar sesión y pulsar **¿Olvidó su contraseña?**
3. Escribir el correo de una cuenta existente.
4. Debe llegar un mensaje con el enlace de restablecimiento.

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
