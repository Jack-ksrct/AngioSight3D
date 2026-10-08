// Unit checks for the continuous risk colour ramp. Run: pnpm check:risk
// Kept dependency-free so it runs in CI without a browser.
import assert from 'node:assert/strict';
import { riskColor, RISK_GRADIENT, RISK_PENDING } from '../src/riskColor.js';

const hexToRgb = hex => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

assert.equal(riskColor(null), RISK_PENDING, 'null is pending');
assert.equal(riskColor(NaN), RISK_PENDING, 'NaN is pending');

// Endpoints and midpoint land on the declared stops.
assert.equal(riskColor(0), '#2fcba8');
assert.equal(riskColor(0.5), '#f2b13c');
assert.equal(riskColor(1), '#e74c5d');

// Clamped outside [0, 1].
assert.equal(riskColor(-3), riskColor(0));
assert.equal(riskColor(4), riskColor(1));

// Continuous: no step larger than a small delta across the whole domain, which
// is exactly what the old three-band function failed (it jumped at 0.4 / 0.7).
let prev = hexToRgb(riskColor(0));
let maxStep = 0;
for (let i = 1; i <= 200; i++) {
  const rgb = hexToRgb(riskColor(i / 200));
  for (let c = 0; c < 3; c++) maxStep = Math.max(maxStep, Math.abs(rgb[c] - prev[c]));
  prev = rgb;
}
// A 0.5% sample must never move a channel by more than ~4% of full range,
// which the old three-band function failed outright (it jumped ~150 at 0.4/0.7).
assert.ok(maxStep <= 12, `ramp should be smooth, saw a step of ${maxStep}`);

// Risk must grow monotonically in red across the teal -> amber leg.
const red = t => hexToRgb(riskColor(t))[0];
assert.ok(red(0.2) < red(0.6), 'red increases with risk');

assert.ok(RISK_GRADIENT.includes(riskColor(0)) && RISK_GRADIENT.includes(riskColor(1)), 'gradient reuses the same stops');

console.log('risk-scale checks passed', { maxStep, gradient: RISK_GRADIENT });