# Decodificador de Draco

Estos tres archivos vienen tal cual de `three/examples/jsm/libs/draco/gltf/`
(three 0.185) y se sirven desde aquí a propósito.

**Por qué están versionados y no se copian al construir.** Un paso de copia que
falle deja el sitio sin decodificador, y eso no se nota al construir: se nota
cuando un residente abre un caso y ve un lienzo vacío. Pesan 750 KB y no se
descargan salvo que el modelo venga comprimido.

**Por qué no se usa el decodificador de un CDN.** El de `gstatic.com` funciona,
pero ata la plataforma a que el hospital deje salir a ese dominio, y el fallo
—otra vez— sería un lienzo vacío sin mensaje.

Al subir de versión de three conviene volver a copiarlos:

    cp node_modules/three/examples/jsm/libs/draco/gltf/* public/draco/
