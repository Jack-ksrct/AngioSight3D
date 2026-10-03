import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

const MODEL_URLS = {
  Male: '/models/body-reference/human-male.glb',
  Female: '/models/body-reference/human-female.glb',
};

const skin = new THREE.MeshStandardMaterial({ color: '#7ca5ad', roughness: 0.72, transparent: true, opacity: 0.86 });
const joint = new THREE.MeshStandardMaterial({ color: '#93b8bd', roughness: 0.76, transparent: true, opacity: 0.82 });
const heartMaterial = new THREE.MeshBasicMaterial({ color: '#ff6f79', toneMapped: false });
const neutralTorsoGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0.055, -0.19),
  new THREE.Vector2(0.105, -0.16),
  new THREE.Vector2(0.12, -0.08),
  new THREE.Vector2(0.105, 0.015),
  new THREE.Vector2(0.12, 0.12),
  new THREE.Vector2(0.15, 0.205),
  new THREE.Vector2(0.12, 0.255),
  new THREE.Vector2(0.055, 0.27),
], 32);

function Segment({ from, to, radius = 0.035, material = skin }) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={quaternion} material={material}>
    <cylinderGeometry args={[radius * 0.78, radius, length, 12]}/>
  </mesh>;
}

function NeutralPerson() {
  const shoulder = 0.16;
  const hip = 0.135;
  const leftShoulder = [-shoulder, 0.24, 0];
  const rightShoulder = [shoulder, 0.24, 0];
  const leftElbow = [-shoulder - 0.055, 0.045, 0.015];
  const rightElbow = [shoulder + 0.055, 0.045, 0.015];
  const leftHand = [-shoulder - 0.07, -0.15, 0.025];
  const rightHand = [shoulder + 0.07, -0.15, 0.025];
  const leftHip = [-hip, -0.17, 0];
  const rightHip = [hip, -0.17, 0];
  const leftKnee = [-hip - 0.005, -0.43, 0.005];
  const rightKnee = [hip + 0.005, -0.43, 0.005];
  const leftAnkle = [-hip - 0.025, -0.68, 0.025];
  const rightAnkle = [hip + 0.025, -0.68, 0.025];

  return <group position={[0, -0.01, 0]}>
    <mesh geometry={neutralTorsoGeometry} scale={[1, 1, 0.76]} material={skin}/>
    <mesh position={[0, 0.335, 0]} material={joint}><sphereGeometry args={[0.09, 18, 16]}/></mesh>
    <mesh position={[0, 0.245, 0]} material={skin}><cylinderGeometry args={[0.045, 0.045, 0.08, 12]}/></mesh>

    <Segment from={leftShoulder} to={leftElbow} radius={0.037}/>
    <Segment from={leftElbow} to={leftHand} radius={0.03}/>
    <Segment from={rightShoulder} to={rightElbow} radius={0.037}/>
    <Segment from={rightElbow} to={rightHand} radius={0.03}/>
    <Segment from={leftHip} to={leftKnee} radius={0.052}/>
    <Segment from={leftKnee} to={leftAnkle} radius={0.037}/>
    <Segment from={rightHip} to={rightKnee} radius={0.052}/>
    <Segment from={rightKnee} to={rightAnkle} radius={0.037}/>
    {[leftShoulder, rightShoulder, leftElbow, rightElbow, leftHand, rightHand, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle].map((p, i) => (
      <mesh key={i} position={p} material={joint}><sphereGeometry args={[i < 2 ? 0.04 : i < 6 ? 0.027 : 0.032, 10, 8]}/></mesh>
    ))}
    <HeartMarker position={[0.035, 0.105, 0.085]}/>
  </group>;
}

function HeartMarker({ position }) {
  const ref = useRef();
  const reduceMotion = useRef(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useFrame(({ clock }) => {
    if (!ref.current || reduceMotion.current) return;
    const beat = Math.pow(Math.max(0, Math.sin(clock.elapsedTime * 3.1)), 5);
    ref.current.scale.setScalar(1 + beat * 0.36);
  });
  return <group ref={ref} position={position}>
    <mesh material={heartMaterial}><sphereGeometry args={[0.035, 16, 12]}/></mesh>
    <mesh position={[0, 0, -0.01]}><sphereGeometry args={[0.075, 16, 12]}/><meshBasicMaterial color="#ff6f79" transparent opacity={0.13} depthWrite={false}/></mesh>
  </group>;
}

function ReferenceModel({ sex }) {
  const { scene } = useGLTF(MODEL_URLS[sex]);
  const { model, heartPosition } = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.34 / size.y;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    clone.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const isFaceDetail = /eyebrow|eye/i.test(object.name);
      object.material = new THREE.MeshStandardMaterial({
        color: isFaceDetail ? '#34424b' : '#a1adb0',
        roughness: isFaceDetail ? 0.94 : 0.78,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    });
    // Place the reference marker from each asset's measured bounds rather than
    // using one fixed coordinate for both body meshes. It sits in the upper
    // chest (about 76% of standing height from the feet), slightly toward the
    // figure's left, and in front of the torso surface.
    const normalizedWidth = size.x * scale;
    const normalizedDepth = size.z * scale;
    const normalizedHeight = size.y * scale;
    const position = [
      normalizedWidth * 0.035,
      -normalizedHeight / 2 + normalizedHeight * 0.76,
      normalizedDepth * 0.28,
    ];
    return { model: clone, heartPosition: position };
  }, [scene]);

  return <group>
    <primitive object={model}/>
    {/* The marker is a visual orientation cue, not a patient-specific finding. */}
    <HeartMarker position={heartPosition}/>
  </group>;
}

useGLTF.preload(MODEL_URLS.Male);
useGLTF.preload(MODEL_URLS.Female);

export default function BodyFigure({ sex }) {
  const label = sex === 'Male' ? 'Male reference figure' : sex === 'Female' ? 'Female reference figure' : 'Neutral reference figure';
  const title = sex === 'Male' ? 'Male body' : sex === 'Female' ? 'Female body' : 'Body map';
  return <div className="body-reference" role="group" aria-label={`${label}; pulsing marker indicates approximate heart position; drag to rotate`}>
    <span className="body-reference-title">{title}</span>
    <Canvas camera={{ position: [0, 0, 3], zoom: 2.35 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={2.1}/>
      <directionalLight position={[1.5, 2.3, 3]} intensity={2.2}/>
      {sex === 'Male' || sex === 'Female' ? <ReferenceModel sex={sex}/> : <NeutralPerson/>}
      <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={0.12} minPolarAngle={0.25} maxPolarAngle={Math.PI - 0.25}/>
    </Canvas>
    <span className="body-reference-key"><i/>Heart position</span>
    <span className="body-reference-note">illustrative</span>
  </div>;
}
