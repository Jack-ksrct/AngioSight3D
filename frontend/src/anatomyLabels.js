// BodyParts3D 4.0 region labels for the heart assembly shipped in
// public/models/bodyparts3d-heart.obj.
//
// The .obj carries no names, so these come from the official release archive:
// for each region, the deepest concept that contains it in the IS-A class
// hierarchy (isa_element_parts.txt + isa_inclusion_relation_list.txt).
// scripts/build_bodyparts3d_heart.py selects the same regions by FMA concept
// id, so the names below and the .mtl material groups agree region for region.
// Regenerate with: python scripts/build_anatomy_labels.py

// BodyParts3D region id -> [official English name, anatomy group].
export const PART_LABELS = {
  FJ2417: ['left anterior cusp of pulmonary valve', 'valve'],
  FJ2418: ['anterolateral head of lateral papillary muscle of left ventricle', 'myocardium'],
  FJ2419: ['anterior papillary muscle of right ventricle', 'myocardium'],
  FJ2420: ['anterior leaflet of mitral valve', 'valve'],
  FJ2421: ['anterior leaflet of tricuspid valve', 'valve'],
  FJ2422: ['cavity of left ventricle', 'cavity'],
  FJ2423: ['cavity of right ventricle', 'cavity'],
  FJ2424: ['cavity of right atrium', 'cavity'],
  FJ2425: ['cavity of left atrium', 'cavity'],
  FJ2426: ['left posterior cusp of aortic valve', 'valve'],
  FJ2427: ['posterior cusp of pulmonary valve', 'valve'],
  FJ2429: ['lateral papillary muscle of left ventricle', 'myocardium'],
  FJ2430: ['posterior papillary muscle of right ventricle', 'myocardium'],
  FJ2431: ['right posterior cusp of aortic valve', 'valve'],
  FJ2432: ['posterior leaflet of mitral valve', 'valve'],
  FJ2433: ['posterior leaflet of tricuspid valve', 'valve'],
  FJ2434: ['right anterior cusp of pulmonary valve', 'valve'],
  FJ2435: ['anterior cusp of aortic valve', 'valve'],
  FJ2436: ['septal leaflet of tricuspid valve', 'valve'],
  FJ2437: ['septal papillary muscle of right ventricle', 'myocardium'],
  FJ2438: ['wall of left atrium', 'myocardium'],
  FJ2439: ['wall of right atrium', 'myocardium'],
  FJ2631: ['trunk of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2632: ['first right anterior branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2633: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2634: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2635: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2636: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2637: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2638: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2639: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2640: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2641: ['third right anterior branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2642: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2643: ['conus branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2644: ['conus branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2645: ['first right anterior branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2646: ['second right anterior branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2647: ['third right anterior branch of anterior interventricular branch of left coronary artery', 'coronary'],
  FJ2648: ['diagonal branch of anterior descending branch of left coronary artery', 'coronary'],
  FJ2649: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2650: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2651: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2652: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2653: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2654: ['circumflex branch of left coronary artery', 'coronary'],
  FJ2655: ['coronary sinus', 'vein'],
  FJ2656: ['great cardiac vein', 'vein'],
  FJ2667: ['marginal branch of right coronary artery', 'coronary'],
  FJ2668: ['marginal branch of right coronary artery', 'coronary'],
  FJ2670: ['right conus artery', 'coronary'],
  FJ2671: ['first anterior ventricular branch of right coronary artery', 'coronary'],
  FJ2672: ['marginal branch of right coronary artery', 'coronary'],
  FJ2673: ['first anterior ventricular branch of right coronary artery', 'coronary'],
  FJ2674: ['marginal branch of right coronary artery', 'coronary'],
  FJ2675: ['marginal branch of right coronary artery', 'coronary'],
  FJ2676: ['right conus artery', 'coronary'],
  FJ2677: ['first anterior ventricular branch of right coronary artery', 'coronary'],
  FJ2692: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2693: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2694: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2695: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2696: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2697: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2698: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2699: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2700: ['posterior interventricular branch of right coronary artery', 'coronary'],
  FJ2714: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2715: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2716: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2717: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2718: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2719: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2720: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2721: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2722: ['first posterior ventricular branch of right coronary artery', 'coronary'],
  FJ2723: ['trunk of right coronary artery', 'coronary'],
  FJ2724: ['small cardiac vein', 'vein'],
  FJ2727: ['right marginal vein', 'vein'],
  FJ2728: ['right marginal vein', 'vein'],
  FJ2729: ['right marginal vein', 'vein'],
  FJ2731: ['small cardiac vein', 'vein'],
  FJ2737: ['trunk of left coronary artery', 'coronary'],
  FJ2966: ['pulmonary trunk', 'artery'],
  FJ3411: ['arch of aorta', 'artery'],
  FJ3413: ['ascending aorta', 'artery'],
  FJ3441: ['inferior vena cava', 'vein'],
  FJ3645: ['superior vena cava', 'vein'],
  FJ3659: ['inferior vena cava', 'vein'],
};

// Anatomy groups, in legend order. The coronary group's colour is driven by the
// model estimate, so it is deliberately absent here. Each colour is a clear
// step away from the others: the cavities sit two shades below the myocardium,
// the valves are the lightest surface, and the great arteries are a lighter blue
// than the veins so the two vessel families stay distinguishable.
export const PART_GROUP_LABELS = {
  myocardium: 'Myocardium',
  cavity: 'Chamber cavity',
  valve: 'Valve',
  artery: 'Great artery',
  vein: 'Vein',
  coronary: 'Coronary artery',
};

export const PART_GROUP_COLORS = {
  myocardium: '#bd7774',
  cavity: '#5a2b33',
  valve: '#e8d9ae',
  artery: '#a8cbe2',
  vein: '#4e91b8',
};

export const NAMED_REGION_COUNT = Object.keys(PART_LABELS).length;
export const DISTINCT_REGION_NAMES = new Set(Object.values(PART_LABELS).map(([name]) => name)).size;
