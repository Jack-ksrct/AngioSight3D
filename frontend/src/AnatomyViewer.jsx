import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PART_GROUP_COLORS, PART_LABELS } from './anatomyLabels.js';
import { RISK_PENDING, riskColor } from './riskColor.js';

const vessels = ['LAD', 'LCX', 'RCA'];
// The Sketchfab coronary asset exports these four red coronary-vessel chunks
// with generic Object_* names. They are visually separate from the myocardium
// but do not carry LAD/LCX/RCA metadata, so use one aggregate estimate color.
const CORONARY_VESSEL_MESHES = new Set(['Object_17', 'Object_18', 'Object_19', 'Object_20']);

// Framing constants. See git history for the derivation; the comments below are
// kept because the numbers are load-bearing for every canvas shape the layout
// can produce (218x460 up to 900x460).
const TARGET_HEIGHT = 1.36;
const MAX_WIDTH_FILL = 0.86;

class GzipGLTFLoader extends GLTFLoader {
  load(url, onLoad, onProgress, onError) {
    const manager = this.manager;
    manager.itemStart(url);
    let bufferUrl;
    const manifestUrl = new URL(url, window.location.href);
    Promise.all([fetch(manifestUrl), fetch(new URL('scene.bin.gz', manifestUrl))])
      .then(async ([manifestResponse, bufferResponse]) => {
        if (!manifestResponse.ok || !bufferResponse.ok) throw new Error('Could not load the local coronary heart model.');
        const manifest = await manifestResponse.json();
        let binary = await bufferResponse.arrayBuffer();
        if (!bufferResponse.headers.get('content-encoding')?.toLowerCase().includes('gzip')) {
          if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the local heart model.');
          binary = await new Response(new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        bufferUrl = URL.createObjectURL(new Blob([binary], { type: 'application/octet-stream' }));
        manifest.buffers[0].uri = bufferUrl;
        this.parse(JSON.stringify(manifest), '', gltf => {
          URL.revokeObjectURL(bufferUrl);
          onLoad(gltf);
          manager.itemEnd(url);
        }, error => {
          URL.revokeObjectURL(bufferUrl);
          manager.itemError(url);
          manager.itemEnd(url);
          if (onError) onError(error);
        });
      })
      .catch(error => {
        if (bufferUrl) URL.revokeObjectURL(bufferUrl);
        manager.itemError(url);
        manager.itemEnd(url);
        if (onError) onError(error);
        else console.error(error);
      });
  }
}

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

function HeartMesh({ probabilities, onSelect, onHover }) {
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
          color: material?.color ?? 0xffffff,
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
        const targetMaterial = material || (object.material = new THREE.MeshPhysicalMaterial());
        targetMaterial.color.set(part?.color || PART_GROUP_COLORS.myocardium);
        targetMaterial.emissive.set('#000000');
        targetMaterial.emissiveIntensity = 0;
      });
    });
    if (unlabelled.size && !warnedUnlabelled) {
      warnedUnlabelled = true;
      console.warn(`[AngioSight3D] ${unlabelled.size} BodyParts3D regions are missing from PART_LABELS and fall back to the myocardium colour. Regenerate the table with: python scripts/build_anatomy_labels.py`);
    }
  }, [model, probabilities.LAD, probabilities.LCX, probabilities.RCA]);

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

function ExternalHeartMesh({ asset, interactive, probabilities }) {
  const isCoronary = asset === 'coronary';
  const path = isCoronary
    ? '/models/cardiac_anatomy_coronary_arteries_of_the_heart/scene.gltf'
    : '/models/realistic-human-heart/source/Heart.fbx';
  const source = useLoader(isCoronary ? GzipGLTFLoader : FBXLoader, path, loader => {
    if (!isCoronary) loader.setResourcePath('/models/realistic-human-heart/source/');
  });
  const camera = useThree(state => state.camera);
  const canvasSize = useThree(state => state.size);
  const model = useMemo(() => {
    const clone = (isCoronary ? source.scene : source).clone(true);
    if (isCoronary) {
      clone.rotation.z = 0.16936; // Roll the local mesh 9.7° so its long axis sits upright.
    }
    clone.traverse(object => {
      if (!object.isMesh) return;
      if (isCoronary) {
        object.geometry = object.geometry.clone();
        const isEstimateVessel = CORONARY_VESSEL_MESHES.has(object.name);
        const vertexColor = object.geometry.getAttribute('color');
        if (vertexColor && vertexColor.itemSize >= 3) {
          for (let index = 0; index < vertexColor.count; index++) {
            if (isEstimateVessel) {
              vertexColor.setXYZ(index, 1, 1, 1);
              continue;
            }
            const red = vertexColor.getX(index);
            const blue = vertexColor.getZ(index);
            // Warm pale/pink tissue slightly while preserving the blue vessels.
            if (blue <= red * 1.08) {
              vertexColor.setY(index, vertexColor.getY(index) * 0.96);
              vertexColor.setZ(index, blue * 0.89);
            }
          }
          vertexColor.needsUpdate = true;
        }
        object.userData.estimateVessel = isEstimateVessel;
      }
      const original = Array.isArray(object.material) ? object.material : [object.material];
      const copied = original.map(material => {
        const copiedMaterial = material?.clone() || new THREE.MeshStandardMaterial();
        if (!isCoronary) copiedMaterial.color?.set('#ffffff');
        copiedMaterial.roughness = isCoronary ? 0.66 : 0.74;
        copiedMaterial.metalness = 0;
        copiedMaterial.side = THREE.DoubleSide;
        copiedMaterial.userData.owned = true;
        copiedMaterial.userData.estimateVessel = isCoronary && CORONARY_VESSEL_MESHES.has(object.name);
        if (copiedMaterial.userData.estimateVessel) {
          // The source glTF has COLOR_0 on every mesh, which Three.js multiplies
          // by material.color. Its baked red vertex colors otherwise overpower
          // the estimate palette and make changed estimates look nearly red.
          copiedMaterial.vertexColors = false;
          copiedMaterial.color?.set('#cf413d');
        }
        return copiedMaterial;
      });
      object.material = copied.length === 1 ? copied[0] : copied;
    });

    clone.updateMatrixWorld(true);
    const bounds = drawnBounds(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const distance = camera.position.length() || 1;
    const frameWidth = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance *
      (canvasSize.width / (canvasSize.height || 1));
    const scale = Math.min(
      TARGET_HEIGHT / (size.y || 1),
      frameWidth ? (frameWidth * MAX_WIDTH_FILL) / (size.x || 1) : Infinity,
    );
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [source, camera, canvasSize.width, canvasSize.height, isCoronary]);

  useLayoutEffect(() => {
    if (!isCoronary) return;
    const values = vessels.map(vessel => probabilities?.[vessel]).filter(value => Number.isFinite(value));
    const color = values.length ? riskColor(values.reduce((sum, value) => sum + value, 0) / values.length) : '#cf413d';
    model.traverse(object => {
      if (!object.isMesh || !object.userData.estimateVessel) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.color?.set(color));
    });
  }, [isCoronary, model, probabilities]);

  useEffect(() => () => {
    model.traverse(object => {
      if (!object.isMesh) return;
      if (isCoronary) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { if (material?.userData?.owned) material.dispose(); });
    });
  }, [model, isCoronary]);

  useEffect(() => {
    if (!interactive) return undefined;
    const canvas = document.querySelector('.viewer-canvas-shell canvas');
    if (!canvas) return undefined;
    const onMove = event => { canvas.style.cursor = event.buttons ? 'grabbing' : 'grab'; };
    const onLeave = () => { canvas.style.cursor = 'auto'; };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.style.cursor = 'auto';
    };
  }, [interactive]);

  return <primitive object={model} />;
}

// The home reference labels live in the same 3D scene as the heart. Their
// anchor points therefore track the model as OrbitControls moves around it.
const REALISTIC_CALLOUTS = [
  { name: 'Superior vena cava', side: 'left', label: [-0.35, 0.46, 0.13], edge: [-0.35, 0.46, 0.13], point: [-0.27, 0.43, 0.11] },
  { name: 'Aorta', side: 'right', label: [0.30, 0.53, 0.10], edge: [0.30, 0.53, 0.10], point: [0.19, 0.48, 0.10] },
  { name: 'Pulmonary trunk', side: 'right', label: [0.34, 0.19, 0.12], edge: [0.34, 0.19, 0.12], point: [0.25, 0.17, 0.12] },
  { name: 'Coronary arteries', side: 'left', label: [-0.35, -0.08, 0.22], edge: [-0.35, -0.08, 0.22], point: [-0.27, -0.10, 0.21] },
  { name: 'Myocardium', side: 'right', label: [0.34, -0.39, 0.11], edge: [0.34, -0.39, 0.11], point: [0.25, -0.37, 0.11] },
];

function RealisticHeartCallouts() {
  return REALISTIC_CALLOUTS.map(({ name, side, label, edge, point }) => <group key={name}>
    <Line points={[edge, point]} color="#c6e3e1" lineWidth={1.15} depthTest={false} />
    <Html position={label} center={false} occlude={false}>
      <span className={`heart-3d-label ${side}`}>{name}</span>
    </Html>
  </group>);
}

const VIEW_PRESETS = {
  anterior: [0, 0, 2.75],
  posterior: [0, 0, -2.75],
  left: [-2.75, 0, 0],
  right: [2.75, 0, 0],
  superior: [0, 2.75, 0],
};

function Anatomy({ probabilities, onSelect, onHover, view, interactive, asset }) {
  const controls = useRef(null);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const preset = VIEW_PRESETS[view] || VIEW_PRESETS.anterior;
    orbit.object.position.set(...preset);
    orbit.target.set(0, 0, 0);
    orbit.update();
  }, [view]);
  return <>
    {/* A soft, slightly cool ambient fill keeps cavities readable, while the
        warm key and cool rim separate the great vessels from the myocardium. */}
    <hemisphereLight args={['#cfe9ff', '#4a2b33', 0.85]} /><ambientLight intensity={0.35} /><directionalLight position={[2.6, 3.4, 4.2]} intensity={2.3} color="#fff4ea" /><directionalLight position={[-3.4, -1.2, -2.6]} intensity={0.7} color="#7fb6ff" /><pointLight position={[-2.8, -1.5, 2.2]} intensity={0.5} color="#ff8f7d" />
    {asset === 'bodyparts'
      ? <HeartMesh probabilities={probabilities} onSelect={onSelect} onHover={onHover} />
      : <ExternalHeartMesh asset={asset} interactive={interactive} probabilities={probabilities} />}
    {asset === 'realistic' && <RealisticHeartCallouts />}
    <OrbitControls ref={controls} enabled={interactive} enablePan={false} minDistance={1.55} maxDistance={5.5} />
  </>;
}

export default function AnatomyViewer({ probabilities, onSelect, onHover, view = 'anterior', interactive = true, asset = 'bodyparts' }) {
  return <Canvas
    camera={{position:[0,0,2.75],fov:38}}
    gl={{ antialias: true, alpha: true }}
    dpr={[1, 2]}
    fallback={<div className="viewer-webgl-fallback">3D viewing is unavailable in this browser.</div>}
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.05;
      gl.outputColorSpace = THREE.SRGBColorSpace;
    }}
  >
    <Anatomy probabilities={probabilities} onSelect={onSelect} onHover={onHover} view={view} interactive={interactive} asset={asset} />
  </Canvas>;
}
