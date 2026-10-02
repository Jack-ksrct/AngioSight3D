# Anatomical 3D asset attribution

CardioMap includes an adapted assembly of 87 BodyParts3D 4.0 OBJ elements, combined into `frontend/public/models/bodyparts3d-heart.obj` and `bodyparts3d-heart.mtl`. The selection includes heart structures, the ascending aorta and aortic arch, the superior vena cava, the pulmonary trunk, and named coronary branches. Long inferior vena cava segments are omitted so the initial view stays focused on the heart.

- **Source:** [BodyParts3D database archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)
- **Source files:** `partof_BP3D_4.0_obj_99.zip` and `partof_element_parts.txt`, release 4.0
- **License:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **Required attribution:** “BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International”.
- **Citation:** Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Research*. 2009;37(Database issue):D782–D785. [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613).

**Changes made:** selected heart and adjacent great-vessel elements; combined component OBJ files into one mesh assembly; rotated the source's Z-up coordinate system for the web viewer; applied distinct display materials to the myocardium, coronary arteries, and coronary veins; omitted the long inferior vena cava continuation. `scripts/build_bodyparts3d_heart.py` reproduces the assembly from the official archive and element manifest.

To regenerate, download `partof_BP3D_4.0_obj_99.zip` and `partof_element_parts.txt` from the official archive, then run:

```sh
python scripts/build_bodyparts3d_heart.py --archive path/to/partof_BP3D_4.0_obj_99.zip --element-parts path/to/partof_element_parts.txt
```

The LAD, LCX, and RCA colors reflect patient-level model outputs, not lesion localization. The source dataset has no lesion coordinates, and these meshes are educational anatomical references rather than patient-specific anatomy or clinical imaging.
