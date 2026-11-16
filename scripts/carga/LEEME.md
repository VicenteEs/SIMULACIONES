# La prueba de carga

Los guiones de la prueba de D-392, para repetirla igual. Se corre en el servidor
que se quiere medir, y se le pide directo a Next, sin pasar por Cloudflare: 300
conexiones desde una sola IP parecerían un ataque, y lo que se mide es el
servidor.

- `carga.mjs`, el generador: de 50 a 300 personas (`ETAPAS`), 7 de cada 10 con
  la cuenta de prueba y 3 sin cuenta. Escribe `informe.json` y se corta solo si
  la salud falla tres veces seguidas o más de un cuarto de las peticiones de
  20 s fallan;
- `abrir-sesion.sh` y `abrir-sesion.ts`, que abren la sesión de la cuenta con la
  API local de Payload y buscan lo que hay publicado para pedir;
- `muestras.sh`, que cada 5 s anota la CPU y la memoria de la aplicación, de la
  base y del generador, la carga del sistema y las conexiones a PostgreSQL.

Todo lo que la prueba lee y escribe va en `~/carga`, fuera del repositorio: la
cuenta, la sesión, lo que hay para pedir y los resultados.

## Pasos

1. El dueño crea una cuenta lector de prueba, entra una vez para aceptar el
   aviso, y escribe en el servidor `~/carga/cuenta` con el correo en la primera
   línea y la clave en la segunda, con permisos 600. La clave no pasa por el
   chat ni por ningún registro.
2. La imagen de guiones, desde el clon del repositorio:

   ```bash
   docker build --target builder --build-arg BASE_PATH= -t traumahub-guiones .
   ```

3. La sesión:

   ```bash
   scripts/carga/abrir-sesion.sh
   ```

4. Las muestras, en segundo plano, y el generador, con un núcleo y 1 GB para no
   quitarle a la aplicación:

   ```bash
   cp scripts/carga/carga.mjs ~/carga/ && (scripts/carga/muestras.sh &) && docker run --rm --name carga --network container:traumahub-app --cpus 1 --memory 1g --user "$(id -u):$(id -g)" -v "$HOME/carga:/carga" --entrypoint node traumahub:local /carga/carga.mjs | tee ~/carga/salida.txt
   ```

5. Al terminar, borrar la cuenta y la sesión, y la cuenta también en el panel:

   ```bash
   shred -u ~/carga/cuenta ~/carga/sesion
   ```

## Qué tener en cuenta

- Con una sesión por cuenta (D-388), todas las personas simuladas comparten la
  misma: entrar 300 veces se echaría a sí misma.
- Un lector solo ve lo publicado. Si las fichas están en borrador, la biblioteca
  sale vacía, más liviana que la de verdad, y ni las fichas ni el PDF se miden.
- Desde D-393 la aplicación corre en varios procesos que comparten el puerto
  3000; el generador no tiene que saberlo.
