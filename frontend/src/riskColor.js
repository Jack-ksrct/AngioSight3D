// Single source of truth for the risk colour ramp, shared by the 3D heart and
// the HTML legend so the two can never disagree.
//
// The ramp is continuous: a 0.62 estimate no longer snaps to the same swatch as
// 0.99. Interpolation happens in linear-light space and the result is returned
// as an sRGB hex string (what CSS and THREE.Color.set both expect).
export const RISK_PENDING = '#617080';

const STOPS = [
  { t: 0.0, rgb: [0x2f, 0xcb, 0xa8] }, // teal  — low
  { t: 0.5, rgb: [0xf2, 0xb1, 0x3c] }, // amber — intermediate
  { t: 1.0, rgb: [0xe7, 0x4c, 0x5d] }, // red   — high
];

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

const LINEAR_STOPS = STOPS.map(({ t, rgb }) => ({ t, rgb: rgb.map(srgbToLinear) }));

function toHex(rgb) {
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Map a probability in [0,1] to a continuous hex colour. */
export function riskColor(probability) {
  if (probability == null || Number.isNaN(probability)) return RISK_PENDING;
  const t = Math.min(1, Math.max(0, probability));
  let lo = LINEAR_STOPS[0];
  let hi = LINEAR_STOPS[LINEAR_STOPS.length - 1];
  for (let i = 0; i < LINEAR_STOPS.length - 1; i++) {
    if (t >= LINEAR_STOPS[i].t && t <= LINEAR_STOPS[i + 1].t) {
      lo = LINEAR_STOPS[i];
      hi = LINEAR_STOPS[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const f = (t - lo.t) / span;
  const rgb = lo.rgb.map((c, i) => linearToSrgb(c + (hi.rgb[i] - c) * f));
  return toHex(rgb);
}

/** CSS gradient built from the same ramp, for the HTML legend. */
export const RISK_GRADIENT = `linear-gradient(90deg, ${riskColor(0)} 0%, ${riskColor(0.5)} 50%, ${riskColor(1)} 100%)`;

/** Discrete swatches for static legends (three reference points). */
export const RISK_LEGEND = [
  { label: 'Low', color: riskColor(0.1) },
  { label: 'Intermediate', color: riskColor(0.5) },
  { label: 'High', color: riskColor(0.9) },
];