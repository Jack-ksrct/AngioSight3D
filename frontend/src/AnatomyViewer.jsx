import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PART_LABELS, PART_GROUP_COLORS } from './anatomyLabels.js';

const vessels = ['LAD', 'LCX', 'RCA'];

// Framing targets, in world units at the default camera distance. The height is
// the original fit and is what normally applies; the width clamp only bites in
// the narrow viewer, where the reserved body-map column leaves an aspect ratio
// tight enough that the sides of the heart would otherwise leave the frame.
// It cannot be 1.0: the axis-aligned box understates the perspective-projected
// silhouette by about 6% at the default view, because the front of the heart
// sits nearer the camera than the box centre. 0.86 keeps a measured 9px gap at
// every canvas shape the layout can produce (218x460 up to 900x460).
// frontend/scripts/check-heart-framing.mjs re-derives both numbers from this
// file, measures the projected silhouette at each of those canvas shapes, and
// fails if any of them would leave the frame.
const TARGET_HEIGHT = 1.36;
const MAX_WIDTH_FILL = 0.86;

// The .mtl that ships with this asset declares only four materials
// (heart_surface, artery_LAD, artery_LCX, artery_RCA), so the coronary veins
// and the great vessels have no material of their own. PART_LABELS supplies
// both the display name and the anatomy group for all 89 regions, and the group
// decides the colour. Arteries keep their material-driven colour because that is
// where the model estimate is shown.
const COLORS = {
  pending: '#617080',
  low: '#45d6b0',
  mid: '#ffb547',
  high: '#ff5267',
};

function bandColor(p) { return p == null ? COLORS.pending : p >= .7 ? COLORS.high : p >= .4 ? COLORS.mid : COLORS.low; }

// What the readout shows for a hovered region. Regions carrying an artery_
// material are coloured by the model estimate and are the only selectable ones.
function describePart(regionName, materialName, probabilities) {
  const label = PART_LABELS[regionName];
  if (materialName.startsWith('artery_')) {
    const vessel = materialName.slice('artery_'.length);
    if (vessels.includes(vessel)) {
      return { name: label?.[0] ?? vessel, group: 'coronary', vessel, color: bandColor(probabilities[vessel]), selectable: true };
    }
  }
  if (!label) return null;
  return { name: label[0], group: label[1], color: PART_GROUP_COLORS[label[1]], selectable: false };
}

// One material per (name, colour, roughness) triple instead of one per mesh:
// the heart has 87 regions and every prediction used to rebuild all of them.
const materialCache = new Map();
function sharedMaterial(hex, name, roughness) {
  const key = `${name}|${hex}|${roughness}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      name, color: hex, roughness, metalness: 0,
      // Every shell in this asset is closed and outward-facing, so back faces
      // are never visible and do not need to be drawn.
      side: THREE.FrontSide,
    });
    materialCache.set(key, material);
  }
  return material;
}

// Bounding box over the vertices the geometry actually draws.
// Box3.setFromObject() returns the identical box for this asset, because
// OBJLoader emits non-indexed geometry and so the 1,761 loose vertices the .obj
// declares are never referenced by a face and neither walk can see them. This
// explicit walk states that guarantee instead of implying one, and still holds
// if the asset is ever re-exported with an index, where setFromObject() would
// start counting those loose vertices and inflate the fit.
const _point = new THREE.Vector3();
function drawnBounds(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    if (!position) return;
    // OBJLoader emits non-indexed geometry, so fall back to every vertex.
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

function HeartMesh({ probabilities, onSelect, onHover }) {
  const materials = useLoader(MTLLoader, '/models/bodyparts3d-heart.mtl');
  const source = useLoader(OBJLoader, '/models/bodyparts3d-heart.obj', loader => loader.setMaterials(materials));
  const camera = useThree(state => state.camera);
  const canvasSize = useThree(state => state.size);

  // Geometry never changes, only colours do, so the clone and its framing are
  // built once per canvas size and the materials are swapped in place. Keying
  // on the canvas size rather than the viewport means the heart is refitted on
  // window resize but never fights the user while they zoom.
  const model = useMemo(() => {
    const clone = source.clone(true);
    // BodyParts3D uses Z-up coordinates; Three.js viewers use Y-up.
    clone.rotation.x = -Math.PI / 2;
    clone.updateMatrixWorld(true);
    const bounds = drawnBounds(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    // Width of the frustum at the model's depth, i.e. at the camera. React
    // three fiber's state.viewport cannot be used here: it is measured at a
    // *unit* distance (aspect * size.height * 2*tan(fov/2)) rather than at the
    // camera's own distance, so it overstates the frame by that distance. Using
    // it made the width clamp loose enough that MAX_WIDTH_FILL never bound, and
    // a narrow viewport clipped the heart horizontally again.
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
  }, [source, canvasSize.width, canvasSize.height]);

  useLayoutEffect(() => {
    const unlabelled = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const next = sourceMaterials.map(material => {
        const materialName = material?.name || '';
        const part = describePart(object.name, materialName, probabilities);
        if (!part) unlabelled.add(object.name);
        const isArtery = materialName.startsWith('artery_');
        return sharedMaterial(part?.color || PART_GROUP_COLORS.myocardium, materialName || 'heart_surface', isArtery ? .48 : .68);
      });
      object.material = next.length === 1 ? next[0] : next;
    });
    if (unlabelled.size && !warnedUnlabelled) {
      warnedUnlabelled = true;
      console.warn(`[AngioSight3D] ${unlabelled.size} BodyParts3D regions are missing from PART_LABELS and fall back to the myocardium colour. Regenerate the table with: python scripts/build_anatomy_labels.py`);
    }
  }, [model, probabilities.LAD, probabilities.LCX, probabilities.RCA]);

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

function Anatomy({ probabilities, onSelect, onHover }) {
  return <>
    <ambientLight intensity={1.55}/><directionalLight position={[2.5,3.5,4]} intensity={2.1}/><pointLight position={[-3,-1,2]} intensity={.65} color="#e7867b"/>
    <HeartMesh probabilities={probabilities} onSelect={onSelect} onHover={onHover}/>
    <OrbitControls enablePan={false} minDistance={1.55} maxDistance={5.5}/>
  </>;
}

export default function AnatomyViewer({ probabilities, onSelect, onHover }) {
  return <Canvas camera={{position:[0,0,2.75],fov:38}}><React.Suspense fallback={null}><Anatomy probabilities={probabilities} onSelect={onSelect} onHover={onHover}/></React.Suspense></Canvas>;
}