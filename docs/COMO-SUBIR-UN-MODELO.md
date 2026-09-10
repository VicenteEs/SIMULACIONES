# Cómo preparar un modelo y armar un caso quirúrgico

Guía para el traumatólogo. Cubre las dos mitades del trabajo: preparar el hueso
en Blender y escribir el caso en la plataforma. No hace falta saber programar,
pero sí seguir dos convenios al pie de la letra, porque de ellos dependen todas
las medidas que la consola le enseña al residente.

---

## Los dos convenios

**Primero: el hueso se exporta reducido.** No roto. En su sitio anatómico, como
debe quedar al terminar la operación. Lo que el residente ve al abrir el caso —el
fragmento desplazado— lo produce la plataforma a partir de unos números que usted
escribe en el caso.

Se hace así para que un mismo modelo sirva para varios casos: la misma tibia con
un desplazamiento de 12 mm es un caso fácil y con 40 mm es uno difícil, y cambiar
la dificultad son seis números, no volver a Blender.

La consecuencia de saltárselo es silenciosa y por eso conviene insistir: si el
hueso se exporta ya roto, la posición correcta que la consola usa de referencia
es la rota. Los milímetros que muestre serán creíbles y estarán mal, y el
residente aprenderá a reducir hacia el sitio equivocado sin que nada dé error.

**Segundo: cada pieza es un objeto con nombre.** La consola enciende y apaga
capas —piel, músculo, hueso— y mueve un fragmento por separado. Solo puede
hacerlo si en el archivo esas cosas son objetos distintos y usted le dice cómo se
llaman.

---

## En Blender

### 1. Separe las piezas

Un objeto por pieza. Como mínimo:

| Objeto | Para qué |
|---|---|
| El hueso principal | El fragmento que **no** se mueve |
| El fragmento | El trozo que el residente reduce |
| Músculo | Capa que se puede apagar |
| Piel | Capa que se puede apagar, y sobre la que se traza la incisión |

Para partir el hueso: seleccione el corte en modo edición y **P → Selección**.
Blender crea un objeto nuevo con la parte separada. Ese es el fragmento.

Hágalo **sin mover nada**. El corte separa, no desplaza: los dos trozos siguen
encajando exactamente donde estaban. Eso es el hueso reducido.

### 2. Póngales nombre

En el esquema de la derecha, doble clic sobre cada objeto. Nombres cortos, sin
tildes ni espacios: `tibia_proximal`, `tibia_distal`, `musculo`, `piel`.

Anótelos. Los va a escribir tal cual en la plataforma, y una letra de diferencia
significa que esa pieza no se enciende ni se apaga.

### 3. Compruebe el origen y la escala

Con todo seleccionado, **Objeto → Aplicar → Todas las transformaciones**. Así
Blender hornea rotación y escala en la geometría y ninguna pieza llega con una
transformación colgando que descuadre las medidas.

### 4. Exporte

**Archivo → Exportar → glTF 2.0 (.glb/.gltf)**, formato **glTF binario (.glb)**.

En el panel de la derecha:

- **Incluir → Objetos seleccionados**: solo si seleccionó las piezas. Si no,
  déjelo apagado y exporta la escena entera.
- **Datos → Malla → Aplicar modificadores**: encendido.
- **Comprimir**: encendido si el archivo pasa de unos pocos MB.

**El archivo debe pesar menos de 8 MB.** Es el techo que acepta la plataforma. Lo
razonable está bastante por debajo: el modelo se descarga en el navegador del
residente, muchas veces en un portátil modesto y con la red del hospital. Si se
pasa, baje el número de caras con un modificador **Decimate** antes de exportar.

Si quiere ver cómo debe quedar, `medios/modelos/tibia-de-prueba.glb` es un
ejemplo mínimo con esos cuatro objetos.

---

## En la plataforma

### 1. Suba el modelo

**Contenido → Material de apoyo → Modelos 3D → + Nuevo.** Nombre y archivo.

### 2. Revise el vocabulario

Los pasos del caso apuntan a cinco catálogos que usted mantiene, en **Contenido →
Material de apoyo**:

| Catálogo | Qué guarda |
|---|---|
| Huesos AO | Tibia (diáfisis) · 42 |
| Clasificaciones AO | A2 · Simple oblicua · tipo A |
| Técnicas quirúrgicas | Clavo endomedular |
| Fases quirúrgicas | Abordaje, Reducción, Fijación, Cierre |
| Instrumental | Bisturí N°10, punzón de entrada, fresa flexible… |

Añada lo que falte **antes** de escribir el caso, así lo elige de una lista en
vez de interrumpir a mitad. Cada instrumento lleva además un icono, que es lo que
el residente ve en la bandeja.

### 3. Escriba el caso

**Contenido → Cirugías → + Nueva.**

**Identificación.** Nombre, resumen, y el hueso, la clasificación y la técnica de
los catálogos. El código AO de la esquina del lienzo se compone solo con el
número del hueso y el de la clasificación: 42 y A2 dan `42-A2`. Solo escriba el
campo Código si su fractura no sigue esa suma.

**El modelo.** Elija el que subió. Dos campos más lo acompañan:

- **Milímetros por unidad**: cuánto mide en milímetros una unidad de Blender.
  Si modeló en metros —lo normal—, es `1000`. Este número decide si la consola
  dice 12 mm o 12 metros.
- **Eje largo**: por qué eje corre el hueso. Casi siempre `Y`. Separa la
  diástasis, que es el hueco a lo largo, del desplazamiento, que es lo que se va
  de lado.

**Las piezas.** Una fila por objeto de Blender: el nombre exacto y su papel.

| Papel | Qué hace la consola con él |
|---|---|
| Piel | Capa apagable. Es donde se traza la incisión |
| Músculo | Capa apagable |
| Hueso | Capa apagable. La parte que no se mueve |
| Fragmento | **El trozo que el residente reduce.** Solo uno |
| Implante | Clavo, placa o tornillo |

**El desplazamiento inicial.** Aquí es donde se rompe el hueso, sin Blender. Seis
números: cuánto se va el fragmento en cada eje, en milímetros, y cuánto gira en
cada eje, en grados. El caso de prueba usa 12,5 mm de lado, 18 mm de separación y
9,8° de angulación, que es una fractura desplazada de aspecto realista.

### 4. Escriba los pasos

Un paso es un gesto que el residente ejecuta y la consola evalúa. Cada uno lleva
título, fase, descripción, el instrumento correcto y los puntos que vale.

Lo que decide todo lo demás es **el objetivo**, que es lo que se le mide:

| Objetivo | Qué tiene que hacer el residente | Qué escribe usted |
|---|---|---|
| Instrumento | Elegir el instrumento correcto | Nada más |
| Trazo | Dibujar una incisión sobre el modelo | Largo mínimo y máximo, en mm |
| Reducción | Poner el fragmento en su sitio | Tolerancia de desplazamiento, de diástasis y de angulación |
| Fuerza | Graduar la fuerza | Rango útil, en newtons |

Los tres mensajes del final de cada paso son la enseñanza del módulo, y conviene
escribirlos con cuidado:

- **Éxito**: qué se consiguió. Se lee al acertar.
- **Insuficiente**: qué falta. Es un reintento, no cuesta nada.
- **Excesivo**: qué se dañó. Cuenta como **complicación** y queda registrada.

Esa última distinción es la razón de ser del simulador. Pasarse fresando no es
«casi bien»: es necrosis térmica que se ve a los tres meses. Escriba ahí lo que
le diría a un residente en pabellón.

**Muestra.** Qué piezas se ven durante ese paso. En el paso de la incisión, la
piel; en los de reducción, los dos fragmentos. Deje que el residente vea lo que
vería de verdad en ese momento de la operación.

**Riesgo.** Una o dos líneas sobre qué puede salir mal. Se muestra junto al paso.

### 5. Publique

Botón **Publicar**. Mientras esté en borrador, el residente no lo ve.

---

## Un ejemplo completo

`scripts/caso-de-prueba.ts` arma una fractura de diáfisis tibial 42-A2 tratada
con clavo endomedular, en siete pasos y 150 puntos, con los cinco catálogos y el
modelo. Se ejecuta así:

```bash
npx tsx scripts/caso-de-prueba.ts
```

Se puede lanzar las veces que haga falta: no duplica los catálogos ni pisa lo que
usted haya cambiado a mano. Sirve para ver un caso bien escrito por dentro antes
de escribir el primero.

---

## Cuando algo no cuadra

| Lo que ve | Qué suele ser |
|---|---|
| El modelo se abre vacío o diminuto | «Milímetros por unidad» está mal. Con `1` en un modelo hecho en metros, el hueso mide un milímetro |
| Una capa no se apaga | El nombre de la pieza no coincide con el objeto de Blender. Distingue mayúsculas |
| Nada se mueve en modo Mover | Ninguna pieza tiene el papel **fragmento** |
| El fragmento no se ve al empezar | El desplazamiento inicial es enorme y lo sacó del encuadre. Pruebe con decenas de milímetros, no cientos |
| Las medidas no bajan al arrastrar | Lo que queda está en profundidad. Mire el desglose por ejes bajo el número y gire la cámara con Orbitar |
| El archivo no sube | Pasa de 8 MB. Reduzca caras con Decimate y exporte comprimido |
