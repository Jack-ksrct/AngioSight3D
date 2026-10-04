/**
 * Checks that the heart always fits the canvas the layout gives it.
 *
 * The framing constants and the camera live in src/AnatomyViewer.jsx and are
 * parsed from there rather than duplicated, so this fails as soon as the viewer
 * changes in a way that affects framing.
 *
 * Two things are asserted:
 *
 *  1. drawnBounds() returns the same box as Box3.setFromObject(). They agree
 *     today because OBJLoader emits non-indexed geometry, so the loose vertices
 *     the .obj declares are unreferenced and neither walk sees them. If the
 *     asset is ever re-exported with an index this stops holding, and the report
 *     says so instead of quietly inflating the fit.
 *
 *  2. The projected silhouette stays inside the frame at every canvas shape the
 *     layout can produce. The axis-aligned box understates the silhouette by a
 *     few percent because the front of the heart sits nearer the camera than the
 *     box centre, so this measures the projection rather than trusting the box.
 *     Every projected point is also checked to sit inside the depth range, since
 *     a point behind the near plane would project to a meaningless coordinate and
 *     silently flatter the fit.
 *
 *  3. The viewer still measures the frame the same way this script does. The
 *     silhouette maths below cannot detect a viewer that asks react-three-fiber
 *     for the frame width, because R3F reports state.viewport at a *unit*
 *     distance from the camera rather than at the camera itself. That made the
 *     width clamp loose enough that MAX_WIDTH_FILL never bound, which left the
 *     heart clipped at narrow viewports even though every number here passed.
 *
 * Run with: pnpm run check:framing
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const root = new URL('../', import.meta.url);
const read = relative => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8');

// Keeps a source file's code and throws away comments and string bodies, so a
// pattern can be matched against code without matching prose about it.
function blankCommentsAndStrings(source) {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const pair = source.slice(i, i + 2);
    if (pair === '//') {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end - 1;
      out += ' ';
    } else if (pair === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 1;
      out += ' ';
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      out += quote;
      for (i += 1; i < source.length; i += 1) {
        if (source[i] === '\\') { i += 1; continue; }
        if (source[i] === quote) break;
      }
      out += quote;
    } else {
      out += source[i];
    }
  }
  return out;
}

// ---- constants, parsed from the viewer so the two cannot drift ------------
const viewerSource = read('src/AnatomyViewer.jsx');
function constant(name) {
  const match = viewerSource.match(new RegExp(`const ${name} = ([\\d.]+);`));
  if (!match) throw new Error(`could not find ${name} in src/AnatomyViewer.jsx`);
  return Number(match[1]);
}
const TARGET_HEIGHT = constant('TARGET_HEIGHT');
const MAX_WIDTH_FILL = constant('MAX_WIDTH_FILL');

const cameraMatch = viewerSource.match(/camera=\{\{position:\[([^\]]+)\],fov:([\d.]+)\}\}/);
if (!cameraMatch) throw new Error('could not find the camera in src/AnatomyViewer.jsx');
const cameraPosition = cameraMatch[1].split(',').map(Number);
const fov = Number(cameraMatch[2]);

// The viewer fits the heart inside the width of the frustum at the camera's own
// distance. It must not ask R3F for that width: state.viewport is expressed at a
// unit distance (aspect * size.height * 2*tan(fov/2)), so it overstates the frame
// by the camera distance and silently disables the width clamp. Comments and
// string bodies are blanked first so that documenting the trap cannot trip it.
const viewerCode = blankCommentsAndStrings(viewerSource);
if (/\.viewport\b/.test(viewerCode)) {
  throw new Error('src/AnatomyViewer.jsx reads viewport from useThree, but R3F reports it at a '
    + 'unit distance rather than at the camera. Compute the frame width from camera.fov, '
    + 'camera.position.length() and the canvas aspect instead.');
}
const cameraDistance = Math.hypot(...cameraPosition);

// Mirrors drawnBounds() in src/AnatomyViewer.jsx.
const scratch = new THREE.Vector3();
function drawnBounds(target) {
  const box = new THREE.Box3();
  target.updateMatrixWorld(true);
  target.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    if (!position) return;
    const index = object.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      scratch.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld);
      box.expandByPoint(scratch);
    }
  });
  return box;
}

// ---- build the model the way the viewer does ------------------------------
const materials = new MTLLoader().parse(read('public/models/bodyparts3d-heart.mtl'));
const model = new OBJLoader().setMaterials(materials).parse(read('public/models/bodyparts3d-heart.obj'));
model.rotation.x = -Math.PI / 2;                       // BodyParts3D is Z-up

const bounds = drawnBounds(model);
const fromObject = new THREE.Box3().setFromObject(model);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());

const sameBox = ['x', 'y', 'z'].every(axis =>
  Math.abs(bounds.min[axis] - fromObject.min[axis]) < 1e-9 &&
  Math.abs(bounds.max[axis] - fromObject.max[axis]) < 1e-9);

let meshes = 0;
let vertices = 0;
let indexed = 0;
model.traverse(object => {
  if (!object.isMesh) return;
  meshes += 1;
  if (object.geometry.index) indexed += 1;
  vertices += object.geometry.attributes.position.count;
});

console.log(`mesh count            ${meshes}`);
console.log(`drawn vertices        ${vertices}`);
console.log(`indexed meshes        ${indexed}${indexed ? '   setFromObject can now see loose vertices' : ''}`);
console.log(`drawn bounds          ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
console.log(`drawnBounds === setFromObject   ${sameBox ? 'yes' : 'NO'}`);
console.log(`TARGET_HEIGHT ${TARGET_HEIGHT}   MAX_WIDTH_FILL ${MAX_WIDTH_FILL}\n`);

// ---- measure the projected silhouette at each canvas shape ----------------
// The .viewer column is narrow, so the canvas reaches these shapes across the
// responsive breakpoints. Widths below 218 are outside what the layout can
// produce and are only here as a safety margin.
const shapes = [
  [120, 200], [218, 460], [241, 460], [269, 460], [297, 419], [297, 460],
  [300, 330], [420, 280], [510, 420], [640, 460], [900, 460], [1200, 900],
  // Measured in the running app: 216x419 is what a .viewer narrowed to its
  // narrowest column produces, and it is the shape the width clamp exists for.
  [140, 419], [216, 419], [349, 419],
];
const MIN_GAP_PX = 2;

console.log('canvas     fill x   fill y   left  right    top  bottom   limited by');
let failed = false;
const heightLimited = TARGET_HEIGHT / (size.y || 1);

for (const [width, height] of shapes) {
  const aspect = width / height;
  // The frame the heart has to fit inside: the frustum at the camera's distance,
  // which is what src/AnatomyViewer.jsx computes from the camera and the canvas.
  const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * cameraDistance;
  const viewWidth = viewHeight * aspect;
  const scale = Math.min(heightLimited, (viewWidth * MAX_WIDTH_FILL) / (size.x || 1));

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
  camera.position.set(...cameraPosition);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const point = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  model.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).project(camera);
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    }
  });

  // A point outside the depth range is behind the near plane or past the far
  // plane, so its x/y would not be what the GPU rasterises.
  const inDepth = minZ >= -1 && maxZ <= 1;

  // NDC is -1..1 across the canvas, so a gap is (1 - extent) / 2 of the size.
  // The silhouette is reported per edge because the heart is not symmetric
  // inside its own bounding box, so an averaged gap would hide one tight edge.
  const gapLeft = (minX + 1) / 2 * width;
  const gapRight = (1 - maxX) / 2 * width;
  const gapTop = (minY + 1) / 2 * height;
  const gapBottom = (1 - maxY) / 2 * height;
  const gaps = [gapLeft, gapRight, gapTop, gapBottom];
  const tightest = Math.min(...gaps);
  const limitedBy = scale === heightLimited ? 'height' : 'width';
  const inside = maxX <= 1 && maxY <= 1 && minX >= -1 && minY >= -1;
  const ok = inside && inDepth && tightest >= MIN_GAP_PX;
  if (!ok) failed = true;
  console.log(
    `${`${width}x${height}`.padEnd(10)}`
    + `${((maxX - minX) * 50).toFixed(1).padStart(6)}% ${((maxY - minY) * 50).toFixed(1).padStart(6)}%`
    + ` ${gapLeft.toFixed(1).padStart(7)} ${gapRight.toFixed(1).padStart(7)} ${gapTop.toFixed(1).padStart(7)} ${gapBottom.toFixed(1).padStart(7)}`
    + `   ${limitedBy.padEnd(8)} ${ok ? 'ok' : !inDepth ? 'BEHIND THE CAMERA' : 'OUT OF FRAME'}`,
  );
}

if (!sameBox) {
  console.log('\nWARNING: drawnBounds() and setFromObject() disagree, so the .obj is probably');
  console.log('         indexed now. Check the fit in the viewer before trusting the numbers above.');
}
console.log(`\nminimum gap required: ${MIN_GAP_PX}px on each axis`);
if (failed) {
  console.error('FAIL: the heart would leave the canvas at one or more canvas shapes.');
  process.exit(1);
}
console.log('PASS: the heart stays inside the frame at every canvas shape.');