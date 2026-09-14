# Correo saliente

La plataforma escribe correo en estos casos:

| Correo | Cuándo sale | A quién |
| --- | --- | --- |
| Elegir contraseña nueva | Alguien lo pide en `/clave`, o un administrador pulsa **Clave** en *Usuarios y permisos* | Al titular de la cuenta |
| Bienvenida | Un administrador crea una cuenta y elige «Enviarle un correo para que elija su contraseña» | A la cuenta nueva |
| Recibimos su solicitud | Alguien pide una cuenta en `/registro` | A quien la pidió |
| Ya tiene una cuenta | Alguien pide una cuenta con un correo que ya tiene una | Al titular de ese correo |
| Nueva solicitud de cuenta | Alguien pide una cuenta en `/registro` | A los administradores activos (hasta diez) |
| Su cuenta ya está activa / no fue aprobada | Un administrador activa o rechaza una solicitud | A quien la pidió |
| Nuevo comentario | Alguien comenta una ficha | A los administradores activos (hasta diez) |
| Difusión | Un administrador la envía desde *Difusión* | A cada cuenta activa del grupo elegido, una por una |
| Correo de prueba | Un administrador lo pide desde *Sistema* | A quien lo pidió |

Todos salen con la misma plantilla (`src/correo/plantilla.ts`): el logotipo
dentro del mensaje, el texto, un botón cuando hay algo que pulsar, y al pie la
plataforma y la autoría. Cada uno lleva también su versión en texto plano, que
es lo que leen algunos lectores de pantalla y lo que miran los filtros de correo
no deseado.

---

## Configurarlo con el correo del hosting (cPanel)

Es el caso de esta instalación: los correos salen desde
`contacto@chesscore.cl`, una cuenta del hosting que se administra con cPanel.

### 1. La cuenta y sus datos de conexión

1. En cPanel, **Cuentas de correo electrónico**. Si `contacto@chesscore.cl` no
   existe, **Crear** y darle una contraseña larga.
2. En la fila de la cuenta, **Conectar dispositivos** (*Connect Devices*). En
   *Configuración manual* aparecen los datos que hacen falta. La columna que
   sirve es **Configuración SSL/TLS segura**:
   - Servidor saliente: `mail.chesscore.cl`
   - Puerto SMTP: `465`
   - Usuario: la dirección completa, `contacto@chesscore.cl`
   - Contraseña: la de la cuenta de correo (no la de cPanel)

El 2026-09-14 se comprobó desde el servidor `blanco` que `mail.chesscore.cl`
contesta en 465 y en 587, y que su certificado es válido para
`*.chesscore.cl`. Si algún día el hosting cambia de certificado y la prueba
del paso 4 dice que el certificado no corresponde, se pone en `SMTP_HOST` el
nombre del servidor que muestra *Conectar dispositivos* en lugar de
`mail.chesscore.cl`.

### 2. Que los correos no caigan en «no deseado»

Gmail y Outlook desconfían de un correo que no demuestra venir del dominio que
dice. Eso se demuestra con tres registros del DNS, y en cPanel se revisan en
**Entregabilidad del correo electrónico** (*Email Deliverability*):

- **SPF** y **DKIM** tienen que decir «Válido». Si alguno dice «Problemas»,
  **Administrar** → **Instalar el registro sugerido**.
- **DMARC**: tiene que haber **un solo** registro TXT en `_dmarc.chesscore.cl`.

Estado comprobado el 2026-09-14: SPF está (`v=spf1 +a +mx +ip4:201.148.104.29
~all`) y DKIM está (`default._domainkey`). **DMARC está duplicado**: hay dos
registros TXT en `_dmarc.chesscore.cl`,

```
v=DMARC1; p=none; rua=mailto:contacto@chesscore.cl
v=DMARC1; p=none;
```

y con dos, quien recibe el correo los descarta los dos (RFC 7489, §6.6.3): es
como no tener ninguno. Se arregla en cPanel → **Editor de zona**
(*Zone Editor*) → `chesscore.cl` → **Administrar**, buscando `_dmarc` y
**eliminando el segundo** (`v=DMARC1; p=none;`, el que no lleva `rua`). Los DNS
del dominio son los del hosting (`dns1.freehost.cl`), así que ese editor es el
que manda.

### 3. Las variables, en el `.env` del servidor

En `blanco`, el archivo es `C:\Users\vicen\simulaciones\.env`. Hay que abrirlo
con un editor como administrador y dejar estas líneas así:

```bash
SMTP_HOST=mail.chesscore.cl
SMTP_PUERTO=465
SMTP_USUARIO=contacto@chesscore.cl
SMTP_CLAVE=la-contraseña-de-la-cuenta-de-correo
SMTP_DESDE=contacto@chesscore.cl
SMTP_NOMBRE=TraumaHub
```

- **`SMTP_DESDE` tiene que ser la misma cuenta que `SMTP_USUARIO`.** Exim, el
  servidor de correo de cPanel, rechaza o marca como suplantación un remitente
  distinto de la cuenta con la que se entra. Si se deja vacío, la plataforma
  usa `SMTP_USUARIO`.
- **`SMTP_NOMBRE`** es lo que se lee en la bandeja de entrada antes del asunto.
  Vacío, sale «TraumaHub».
- **Si la contraseña lleva `$`, se escribe `\$`.** Next.js lee el `.env`
  interpretando `$ALGO` como otra variable, y una contraseña con `$` llega
  cortada sin ningún aviso: el síntoma es un «usuario o contraseña rechazados»
  con la contraseña correcta.
- `NEXT_PUBLIC_SERVER_URL` ya está puesta en `blanco`
  (`https://traumahub.tailc2094f.ts.net/simulaciones`). Es la dirección con la
  que se arman los enlaces de los correos: si está mal, el correo llega y el
  botón lleva a otro sitio.

### 4. Reiniciar y probar

```powershell
Restart-Service traumahub
```

Después, en el panel:

1. **Sistema** → la fila **Correo saliente** tiene que decir «ok» con el saludo
   del servidor (`mail.chesscore.cl:465 · 220 …`). Eso prueba que hay un servidor
   escuchando; no prueba la contraseña.
2. En esa misma fila, **Enviarme un correo de prueba**. Esto sí prueba la
   contraseña y el remitente, porque manda un correo de verdad a la cuenta con
   la que se está. Si falla, el panel explica el motivo (contraseña rechazada,
   sin conexión, certificado, remitente).
3. Abrir el correo recibido y mirar que **no esté en «no deseado»**. Si está
   ahí, volver al paso 2.
4. Cerrar sesión, ir a `/clave`, pedir un enlace con la propia dirección, y
   **seguir el enlace hasta el final**. Es lo que descubre una dirección pública
   mal puesta.

---

## Solicitudes de cuenta

Desde D-119 una persona puede pedir su cuenta en `/registro` (enlazado desde la
pantalla de entrada y la portada). La cuenta se crea **desactivada** y marcada
como solicitud, y no puede entrar hasta que un administrador la revise en
*Usuarios y permisos* → **Solicitudes por revisar**: ahí se ve lo que escribió,
se elige el rol y se **activa** o se **rechaza** (rechazar borra la cuenta). En
los dos casos le llega un correo. La barra del panel muestra cuántas esperan.

La creación a mano sigue igual, con una opción más: en vez de ponerle una
contraseña y entregársela, se le puede mandar un correo de bienvenida para que
la elija él. Ese enlace dura 72 horas; si caduca, la persona usa «¿Olvidó su
contraseña?» con el mismo correo.

Qué no hace, para no darlo por más de lo que es: **no comprueba la identidad**
de quien pide la cuenta. Cualquiera puede escribir un nombre y una institución.
Por eso la activación es de un administrador, y el correo de aviso se lo
recuerda.

---

## Difusión

*Difusión*, en el panel del administrador, manda un mismo mensaje a todas las
cuentas activas o a un rol. Tiene vista previa con la plantilla real y un botón
para mandarse una prueba antes de enviarlo a todos.

**Va despacio a propósito.** El hosting limita cuántos correos salen por hora,
y esa cuota es la misma con la que sale la recuperación de contraseña: una
difusión que la agote deja sin enlace a quien olvidó su clave esa hora. La
plataforma espacia los envíos según `DIFUSION_CORREOS_POR_HORA` (200 si no se
pone, es decir, uno cada 18 segundos). El límite real lo sabe el hosting; en
cPanel no siempre se ve, y conviene preguntarlo y poner aquí algo por debajo.

Cada persona recibe su propio correo, con su nombre, y nunca ve las direcciones
de las demás. Si el servicio se reinicia a la mitad, la difusión queda
**interrumpida** con su cola guardada, y **Reanudar** sigue desde donde quedó
sin escribirle dos veces a nadie.

---

## Sin servidor de correo

Es el estado de una instalación recién hecha: `SMTP_HOST` vacío. Conviene saber
qué pasa exactamente.

- No sale ningún correo y no queda nada anotado: es el estado normal, no un
  fallo.
- La recuperación de contraseña se entrega a mano: en *Usuarios y permisos* el
  botón **Clave** genera el enlace de un solo uso y lo muestra en pantalla.
- Una cuenta creada a mano solo puede llevar contraseña puesta por el
  administrador; la opción de invitación por correo aparece desactivada.
- Las solicitudes de `/registro` siguen llegando al panel, pero ni quien la
  pidió ni los administradores reciben aviso: hay que mirar la barra del panel.
- *Difusión* muestra la vista previa y no deja enviar.

Si quien se quedó fuera es el único administrador, el botón **Clave** no le
sirve. Para eso está el guion, que emite el mismo enlace desde la consola del
servidor sin sesión:

```bash
npx tsx scripts/restablecer-clave.ts correo@ejemplo.cl
```

---

## El enlace para elegir contraseña nueva

Lo arma `enlaceDeClave`, en `src/collections/Usuarios.ts`: `NEXT_PUBLIC_SERVER_URL`
+ `/clave/<testigo>`. No es el enlace que trae Payload, y hay motivo. El suyo
manda a `serverURL` + `/admin/reset/<testigo>`, y las dos mitades están mal en
esta plataforma:

- **`serverURL` es solo el origen**, sin el prefijo. Tiene que serlo: Payload lo
  mete en su lista de CSRF y lo compara con la cabecera `Origin`, que nunca
  lleva ruta (observación O-018 de `BITACORA.md`).
- **`/admin` es la interfaz de Payload**, que se retiró (D-038).

Por eso la pantalla `/clave` y el panel piden el testigo a Payload con
`disableEmail` y mandan el correo ellos, con la plantilla.

**Dura una hora y sirve una sola vez** (la de bienvenida, 72 horas). Pedir otro
anula el anterior. La pantalla responde «El enlace caducó o ya se usó. Pida uno
nuevo.» sin distinguir cuál de las dos cosas pasó, porque Payload tampoco lo
distingue.

La pantalla `/clave` responde lo mismo exista o no la cuenta, y `/registro`
también: decir «ese correo no está registrado» o «ya existe» convertiría
cualquiera de las dos en un comprobador de quién tiene acceso. La verdad se le
dice al titular en su buzón.

---

## Otros proveedores

Si algún día no se quiere usar el hosting, cualquier servidor SMTP sirve con
las mismas variables. Dos que funcionan bien con pocos correos:

- **Resend** (`smtp.resend.com`, puerto 587, usuario `resend`, la clave de API
  como contraseña). Exige verificar el dominio.
- **Brevo** (`smtp-relay.brevo.com`, puerto 587). Permite enviar desde una
  dirección verificada sin dominio propio.

Gmail con contraseña de aplicación sirve para probar el circuito, no para
producción: limita el envío.

---

## Si no llega

- **Sistema → Enviarme un correo de prueba** da el motivo en español.
- El registro del servicio tiene el detalle. En `blanco`:

  ```powershell
  Get-Content C:\Users\vicen\simulaciones\registros\servidor.log -Tail 50 | Select-String correo
  ```

  Los fallos de envío salen con «No se pudo enviar el correo: …».
- **La contraseña del correo es un secreto.** Vive en `.env`, que no se versiona.
  No debe acabar en el repositorio, en una captura ni en un mensaje.
