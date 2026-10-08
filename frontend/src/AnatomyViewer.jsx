import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PART_GROUP_COLORS, PART_LABELS } from './anatomyLabels.js';
import { RISK_PENDING, riskColor } from './riskColor.js';

const vessels = ['LAD', 'LCX', 'RCA'];

// Framing constants. See git history for the derivation; the comments below are
// kept because the numbers are load-bearing for every canvas shape the layout
// can produce (218x460 up to 900x460).
const TARGET_HEIGHT = 1.36;
const MAX_WIDTH_FILL = 0.86;

// What the readout shows for a hovered region. Regions carrying an artery_
// material are coloured by the model estimate and are the only selectable ones.
function describePart(regionName, materialName, probabilities) {
  const label = PART_LABELS[regionName];
  if (materialName.startsWith('artery_')) {
    const vessel = materialName.slice('artery_'.length);
    if (vessels.includes(vessel)) {
      return { name: label?.[0] ?? vessel, group: 'coronary', vessel, color: riskColor(probabilities[vessel]), selectable: true };
    }
  }
  if (!label) return null;
  return { name: label[0], group: label[1], color: PART_GROUP_COLORS[label[1]], selectable: false };
}

// Bounding box over the vertices the geometry actually draws. OBJLoader emits
// non-indexed geometry, so the loose vertices the .obj declares are never seen
// by either walk; this explicit version keeps the fit correct even if the asset
// is later re-exported with an index (where Box3.setFromObject would inflate).
const _point = new THREE.Vector3();
function drawnBounds(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    if (!position) return;
    const index = object.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      _point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld);
      box.expandByPoint(_point);
    }
  });
  return box;
}

let warnedUnlabelled = false;

function HeartMesh({ probabilities, onSelect, onHover, appearance }) {
  const materials = useLoader(MTLLoader, '/models/bodyparts3d-heart.mtl');
  const source = useLoader(OBJLoader, '/models/bodyparts3d-heart.obj', loader => loader.setMaterials(materials));
  const camera = useThree(state => state.camera);
  const canvasSize = useThree(state => state.size);

  // The clone shares the cached source geometry (good: no duplication) but gets
  // its own materials so a colour update can mutate in place without touching
  // another region that happened to share a material name. Rebuilt only when the
  // canvas changes size.
  const model = useMemo(() => {
    const clone = source.clone(true);
    clone.rotation.x = -Math.PI / 2;
    clone.traverse(object => {
      if (!object.isMesh) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const owned = sourceMaterials.map(material => {
        const isArtery = (material?.name || '').startsWith('artery_');
        const created = new THREE.MeshPhysicalMaterial({
          name: material?.name || 'heart_surface',
          color: 0xffffff,
          roughness: isArtery ? 0.42 : 0.62,
          metalness: 0.0,
          clearcoat: isArtery ? 0.55 : 0.22,
          clearcoatRoughness: isArtery ? 0.3 : 0.55,
          sheen: 0.25,
          sheenColor: new THREE.Color('#ffd9d4'),
          side: THREE.FrontSide,
        });
        created.userData.owned = true;
        return created;
      });
      object.material = owned.length === 1 ? owned[0] : owned;
    });

    clone.updateMatrixWorld(true);
    const bounds = drawnBounds(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const distance = camera.position.length() || 1;
    const frameWidth =
      2 * Math.tan((camera.fov * Math.PI) / 360) * distance *
      (canvasSize.width / (canvasSize.height || 1));
    const scale = Math.min(
      TARGET_HEIGHT / (size.y || 1),
      frameWidth ? (frameWidth * MAX_WIDTH_FILL) / (size.x || 1) : Infinity,
    );
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [source, camera, canvasSize.width, canvasSize.height]);

  // Recolour in place on every estimate change: no scene rebuild, no new
  // materials, so N consecutive calculations stay cheap and can never leave a
  // stale colour behind.
  useLayoutEffect(() => {
    const unlabelled = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach(material => {
        const part = describePart(object.name, material?.name || '', probabilities);
        if (!part) unlabelled.add(object.name);
        const angiographyColor = appearance === 'angiography'
          ? material?.name?.startsWith('artery_') ? '#f4e8c9'
            : part?.group === 'coronary' ? '#f4e8c9'
              : part?.group === 'vein' ? '#587887'
              : part?.group === 'cavity' ? '#3c4b53'
                  : part?.group === 'valve' ? '#b6b9b1'
                  : part?.group === 'artery' ? '#7e8c92' : '#69767c'
          : null;
        (material || (object.material = new THREE.MeshPhysicalMaterial())).color.set(angiographyColor || part?.color || PART_GROUP_COLORS.myocardium);
      });
    });
    if (unlabelled.size && !warnedUnlabelled) {
      warnedUnlabelled = true;
      console.warn(`[AngioSight3D] ${unlabelled.size} BodyParts3D regions are missing from PART_LABELS and fall back to the myocardium colour. Regenerate the table with: python scripts/build_anatomy_labels.py`);
    }
  }, [model, probabilities.LAD, probabilities.LCX, probabilities.RCA, appearance]);

  // Release only the materials this viewer created; the geometries are shared
  // with the module-level loader cache and must not be disposed here.
  useEffect(() => () => {
    model.traverse(object => {
      if (!object.isMesh) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach(material => { if (material?.userData?.owned) material.dispose(); });
    });
  }, [model]);

  useEffect(() => () => { document.body.style.cursor = 'auto'; }, []);

  const hitMaterial = event => {
    const material = Array.isArray(event.object.material) ? event.object.material[event.face?.materialIndex ?? 0] : event.object.material;
    return material?.name ?? '';
  };

  return <primitive object={model} onClick={event => {
    const vessel = hitMaterial(event).replace('artery_', '');
    if (vessels.includes(vessel)) { event.stopPropagation(); onSelect(vessel); }
  }} onPointerOver={event => {
    const materialName = hitMaterial(event);
    const part = describePart(event.object.name, materialName, probabilities);
    document.body.style.cursor = part?.selectable ? 'pointer' : 'auto';
    onHover?.(part);
  }} onPointerOut={() => { document.body.style.cursor = 'auto'; onHover?.(null); }} />;
}

const VIEW_PRESETS = {
  anterior: [0, 0, 2.75],
  posterior: [0, 0, -2.75],
  left: [-2.75, 0, 0],
  right: [2.75, 0, 0],
  superior: [0, 2.75, 0],
};

function Anatomy({ probabilities, onSelect, onHover, view, interactive, appearance }) {
  const controls = useRef(null);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.object.position.set(...(VIEW_PRESETS[view] || VIEW_PRESETS.anterior));
    orbit.target.set(0, 0, 0);
    orbit.update();
  }, [view]);
  return <>
    {/* A soft, slightly cool ambient fill keeps cavities readable, while the
        warm key and cool rim separate the great vessels from the myocardium. */}
    {appearance === 'angiography'
      ? <><hemisphereLight args={['#d5e1e5', '#17232a', 0.7]} /><ambientLight intensity={0.5} /><directionalLight position={[2.6, 3.4, 4.2]} intensity={2.1} color="#e8f0f2" /><directionalLight position={[-3.4, -1.2, -2.6]} intensity={0.85} color="#8ba1ad" /></>
      : <><hemisphereLight args={['#cfe9ff', '#4a2b33', 0.85]} /><ambientLight intensity={0.35} /><directionalLight position={[2.6, 3.4, 4.2]} intensity={2.3} color="#fff4ea" /><directionalLight position={[-3.4, -1.2, -2.6]} intensity={0.7} color="#7fb6ff" /><pointLight position={[-2.8, -1.5, 2.2]} intensity={0.5} color="#ff8f7d" /></>}
    <HeartMesh probabilities={probabilities} onSelect={onSelect} onHover={onHover} appearance={appearance} />
    <OrbitControls ref={controls} enabled={interactive} enablePan={false} minDistance={1.55} maxDistance={5.5} />
  </>;
}

export default function AnatomyViewer({ probabilities, onSelect, onHover, view = 'anterior', interactive = true, appearance = 'anatomy' }) {
  return <Canvas
    camera={{position:[0,0,2.75],fov:38}}
    gl={{ antialias: true, alpha: true }}
    dpr={[1, 2]}
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.05;
      gl.outputColorSpace = THREE.SRGBColorSpace;
    }}
  >
    <Anatomy probabilities={probabilities} onSelect={onSelect} onHover={onHover} view={view} interactive={interactive} appearance={appearance} />
  </Canvas>;
}
