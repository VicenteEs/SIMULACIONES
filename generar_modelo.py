import os
import sys
import monai
from monai.data.synthetic import create_test_image_3d
import numpy as np
from skimage.measure import marching_cubes
import trimesh

print("Generando imagen sintetica de RM usando MONAI...", flush=True)
im, seg = create_test_image_3d(64, 64, 64, num_seg_classes=1, rad_max=15, rad_min=5, noise_max=0.1, num_objs=2)

print("Extrayendo la superficie del objeto segmentado...", flush=True)
verts, faces, normals, values = marching_cubes(seg, level=0.5)

print("Exportando malla a formato GLB...", flush=True)
mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals)
mesh.export("prueba_rm_monai.glb")

print("Listo! Archivo guardado como 'prueba_rm_monai.glb'.", flush=True)
