# Atribución del atlas anatómico

La geometría anatómica de esta plataforma procede de **BodyParts3D**, y su
licencia obliga a citarla allí donde se muestre. Este archivo es la fuente de
ese crédito; la página de créditos de la plataforma lo reproduce.

## Crédito exigido

> BodyParts3D, © The Database Center for Life Science licensed under
> CC Attribution 4.0 International

- Licencia: https://creativecommons.org/licenses/by/4.0/
- Términos del origen: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Conjunto de datos: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Publicación: Mitsuhashi et al. (2009), *BodyParts3D: 3D structure database for
  anatomical concepts*. https://doi.org/10.1093/nar/gkn613

Los comentarios de los archivos OBJ originales mencionan una licencia anterior,
CC BY-SA 2.1 Japón. La página oficial vigente la sustituye por CC BY 4.0, que no
obliga a compartir igual.

## Cambios realizados

CC BY 4.0 exige indicar si se modificó el material. Se modificó así:

- ejes y unidades convertidos de milímetros y Z arriba a metros y Y arriba;
- geometría simplificada con meshoptimizer, con un límite de error relativo del
  0,2 % por estructura; las 2.234 mallas de origen se conservan todas;
- normales cuantizadas a entero de 16 bits con signo;
- geometría empaquetada en 15 archivos binarios comprimidos;
- añadida una clasificación por **región anatómica** que el material original no
  traía: se toma de los conceptos FMA del propio atlas cuando existen y, para
  las estructuras que atraviesan regiones —vasos y nervios—, se deduce de la
  posición de su caja envolvente;
- traducidos al español los nombres de los sistemas y de las regiones. Los
  nombres de las estructuras se conservan en su forma original.

La preparación intermedia procede de https://github.com/ashemag/human-atlas
(código bajo licencia MIT), que documenta las tres primeras adaptaciones.

## Límites de este material

- Es **anatomía de referencia de un varón adulto**. No representa la variación
  anatómica ni la anatomía femenina.
- Es material **docente**. No sirve para diagnóstico ni para planificación
  quirúrgica sobre un paciente concreto.

---
Preparación `bp3d-4.0-84768b56` · 2.288.268 triángulos
