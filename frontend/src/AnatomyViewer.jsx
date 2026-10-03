import React, { useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const vessels = ['LAD', 'LCX', 'RCA'];
// BodyParts3D coronary venous elements currently included in the heart assembly.
const coronaryVeins = new Set(['FJ2655', 'FJ2656', 'FJ2724', 'FJ2727', 'FJ2728', 'FJ2729', 'FJ2731']);
function color(p) { return p == null ? '#617080' : p >= .7 ? '#ff5267' : p >= .4 ? '#ffb547' : '#45d6b0'; }

function HeartMesh({ probabilities, onSelect }) {
  const materials = useLoader(MTLLoader, '/models/bodyparts3d-heart.mtl');
  materials.preload();
  const source = useLoader(OBJLoader, '/models/bodyparts3d-heart.obj', loader => loader.setMaterials(materials));
  const model = useMemo(() => {
    const clone = source.clone(true);
    // BodyParts3D uses Z-up coordinates; Three.js viewers use Y-up.
    clone.rotation.x = -Math.PI / 2;
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.36 / size.y;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    clone.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.material = materials.map(material => new THREE.MeshStandardMaterial({
        name: material.name,
        color: material.name?.startsWith('artery_') ? color(probabilities[material.name.replace('artery_', '')])
          : material.name === 'coronary_vein' || coronaryVeins.has(object.name) ? '#4e91b8'
            : '#bd7774',
        roughness: material.name?.startsWith('artery_') || material.name === 'coronary_vein' || coronaryVeins.has(object.name) ? .48 : .68,
        metalness: 0,
        side: THREE.DoubleSide,
      }));
      if (object.material.length === 1) object.material = object.material[0];
    });
    return clone;
  }, [source, probabilities.LAD, probabilities.LCX, probabilities.RCA]);

  React.useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  return <primitive
    object={model}
    onClick={event => {
      const material = Array.isArray(event.object.material) ? event.object.material[event.face?.materialIndex ?? 0] : event.object.material;
      const vessel = material?.name?.replace('artery_', '');
      if (vessels.includes(vessel)) { event.stopPropagation(); onSelect(vessel); }
    }}
    onPointerOver={event => {
      const material = Array.isArray(event.object.material) ? event.object.material[event.face?.materialIndex ?? 0] : event.object.material;
      if (material?.name?.startsWith('artery_')) {
        document.body.style.cursor = 'pointer';
      }
    }}
    onPointerOut={() => {
      document.body.style.cursor = 'auto';
    }}
  />;
}

function Anatomy({ probabilities, onSelect }) {
  return <>
    <ambientLight intensity={1.55}/><directionalLight position={[2.5,3.5,4]} intensity={2.1}/><pointLight position={[-3,-1,2]} intensity={.65} color="#e7867b"/>
    <HeartMesh probabilities={probabilities} onSelect={onSelect}/>
    <OrbitControls enablePan={false} minDistance={1.55} maxDistance={5.5}/>
  </>;
}

export default function AnatomyViewer({ probabilities, onSelect }) {
  return <Canvas camera={{position:[0,0,2.75],fov:38}} gl={{ antialias: true, alpha: true }}><React.Suspense fallback={null}><Anatomy probabilities={probabilities} onSelect={onSelect}/></React.Suspense></Canvas>;
}
