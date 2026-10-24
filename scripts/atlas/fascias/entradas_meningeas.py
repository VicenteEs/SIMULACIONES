"""
Qué piezas del atlas entran en cada meninge (P-006, E8): el cerebro, el cráneo, la columna.

Aparte de `meningea.py` porque lo leen también las vistas de Blender (`vista_en_blender.py`), y Blender no trae
`scipy`, que `meningea.py` sí necesita. Aquí solo hay nombres y filtros.
"""

import re

NOMBRES_DEL_CRANEO = (
    'Ethmoid', 'Frontal bone', 'Left parietal bone', 'Right parietal bone', 'Left temporal bone',
    'Right temporal bone', 'Occipital bone', 'Sphenoid bone',
)

_NO_ES_CEREBRO = re.compile(r'nerve|ganglion|artery|vein|eye|retina|lens|cornea|sclera|iris|ciliar|vitreous|chamber', re.I)



def piezas_del_cerebro(atlas):
    """Todo lo nervioso del interior del cráneo, sin los nervios craneales ni los vasos: lo que la piamadre envuelve."""
    return [
        p for p in atlas.piezas
        if not p.get('generada') and p['sistema'] in ('nervous', 'cardiac')
        and p['caja'][0][1] > 1.53 and p['caja'][1][1] < 1.75
        and not _NO_ES_CEREBRO.search(p['nombre'])
        and p['nombre'] not in ('Central canal of spinal cord', 'Tentorium cerebelli')
        and abs(p['caja'][1][0] - p['caja'][0][0]) < 0.14
    ]


def piezas_del_craneo(atlas):
    return [p for p in atlas.piezas if not p.get('generada') and p['nombre'] in NOMBRES_DEL_CRANEO]


_VERTEBRA = re.compile(r'^(?!Intervertebral).*(cervical|thoracic|lumbar) vertebra$|^Atlas$|^Axis$|^Sacrum$')


def piezas_de_la_columna(atlas):
    piezas = [p for p in atlas.piezas if not p.get('generada') and p['sistema'] == 'skeletal' and _VERTEBRA.search(p['nombre'])]
    return sorted(piezas, key=lambda p: -(p['caja'][0][1] + p['caja'][1][1]))
