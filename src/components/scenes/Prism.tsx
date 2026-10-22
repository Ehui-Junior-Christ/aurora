"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { COMMON_GLSL, useFullscreenShader } from "./kit";

/**
 * Prisme: a faceted glass gem, raymarched inside a bounding sphere only.
 * Refraction samples a procedural studio environment once per colour channel
 * with a different IOR: the chromatic dispersion widens on every kick.
 */
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uEnergy;
uniform float uFreq;
uniform float uSeed;
uniform float uLow;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform mat3 uRot;
uniform float uScale;
uniform float uDispersion;
varying vec2 vUv;

${COMMON_GLSL}

float sdOct(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float map(vec3 p) {
  p = uRot * p / uScale;
  // Cuboctahedral cut + a stretched octahedron: a brilliant-like gem.
  float gem = max(sdOct(p * vec3(1.0, 0.82, 1.0), 1.0), sdBox(p, vec3(0.64, 0.8, 0.64)));
  gem = max(gem, sdOct(p * vec3(0.9, 1.0, 0.9) + vec3(0.0, 0.0, 0.0), 1.12) );
  return gem * uScale;
}
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
                   k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

// Studio environment: palette gradient + sharp softbox strips.
vec3 env(vec3 d) {
  float a = atan(d.x, d.z);
  float y = d.y;
  vec3 base = mix(vivid(uColorA), vivid(uColorB), 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.25));
  base = mix(base, vivid(uColorC), smoothstep(0.2, 0.9, y));
  vec3 col = base * (0.04 + 0.12 * smoothstep(-0.6, 0.8, y));
  float strips = pow(max(0.0, sin(a * 6.0 + y * 3.0 + uTime * 0.4)), 40.0);
  float bands = pow(max(0.0, sin(y * 9.0 - a * 1.5 + uTime * 0.3)), 90.0);
  float top = pow(max(0.0, y), 18.0);
  col += mix(vec3(1.0), base, 0.45) * strips * (1.4 + uMid * 1.6);
  col += base * bands * (0.9 + uTreble * 1.5);
  col += vec3(1.0) * top * (1.0 + uBeat);
  return col;
}

// Scene behind the gem: spectral halo, light shafts, core glow.
vec3 backdrop(vec2 p, float chan) {
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec3 col = vec3(0.012, 0.012, 0.022);
  float shafts = pow(vnoise(vec2(ang * 7.0 + uSeed * 30.0, uTime * 0.15)), 3.0);
  shafts *= exp(-r * 2.2) * (0.14 + uMid * 0.45);
  col += mix(vivid(uColorA), vivid(uColorC), 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.2)) * shafts;
  float ringR = 0.62 * uScale + uBass * 0.03;
  float disp = uDispersion * 3.0;
  vec3 ring = vec3(
    exp(-abs(r - ringR * (1.0 + disp)) * 140.0),
    exp(-abs(r - ringR) * 140.0),
    exp(-abs(r - ringR * (1.0 - disp)) * 140.0));
  col += ring * (0.1 + uBeat * 0.5 + uTreble * 0.2);
  col += vivid(uColorB) * exp(-r * 3.5) * (0.05 + uEnergy * 0.22);
  // Fine concentric light lines only the lens reveals.
  col += vec3(1.0) * pow(0.5 + 0.5 * sin(r * 70.0 - uTime * 1.5 + chan), 30.0) * exp(-r * 3.0) * 0.18 * step(0.0, chan);
  return col;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;
  float r = length(p);
  vec3 col = backdrop(p, -1.0);

  // Raymarch only rays that hit the bounding sphere.
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(p, -1.55));
  float bound = 1.3 * uScale;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - bound * bound;
  float h = b * b - c;
  if (h > 0.0) {
    float tt = -b - sqrt(h);
    float tMax = -b + sqrt(h);
    bool hit = false;
    int steps = uLow > 0.5 ? 28 : 56;
    for (int i = 0; i < 56; i++) {
      if (i >= steps) break;
      vec3 pos = ro + rd * tt;
      float d = map(pos);
      if (d < 0.0012) { hit = true; break; }
      tt += d;
      if (tt > tMax) break;
    }
    if (hit) {
      vec3 pos = ro + rd * tt;
      vec3 n = calcNormal(pos);
      float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
      vec3 refl = env(reflect(rd, n));
      float eta = 1.0 / 1.5;
      // Lens: each channel bends differently and re-reads the backdrop.
      vec3 rr = refract(rd, n, eta - uDispersion);
      vec3 rg = refract(rd, n, eta);
      vec3 rb = refract(rd, n, eta + uDispersion);
      float lens = 1.4;
      vec3 refr = vec3(
        backdrop(p + (rr.xy - rd.xy) * lens, 0.0).r,
        backdrop(p + (rg.xy - rd.xy) * lens, 0.7).g,
        backdrop(p + (rb.xy - rd.xy) * lens, 1.4).b);
      vec3 gem = refr * 1.6 + vivid(mix(uColorB, uColorC, 0.5)) * 0.025;
      gem = mix(gem, refl, clamp(0.08 + fres * 0.9, 0.0, 1.0));
      // Facet edges light up with the highs.
      float edgeF = 1.0 - smoothstep(0.0, 0.9, abs(dot(n, rd)));
      gem += vec3(1.0) * pow(edgeF, 6.0) * (0.3 + uTreble * 1.2);
      col = gem;
    }
  }

  float vig = smoothstep(1.4, 0.25, r);
  col *= mix(0.5, 1.0, vig);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy, uTime) * 0.022;
}
`;

const euler = new THREE.Euler();
const m4 = new THREE.Matrix4();

export default function Prism() {
  const spin = useRef({ x: 0.4, y: 0, z: 0.15, v: 0 });
  const extra = useMemo(
    () => ({
      uRot: { value: new THREE.Matrix3() },
      uScale: { value: 1 },
      uDispersion: { value: 0.02 },
    }),
    []
  );
  const { material } = useFullscreenShader(fragmentShader, (u, f, state) => {
    const s = spin.current;
    // A kick adds angular momentum that bleeds off.
    if (f.kick && !f.reduced) s.v += 0.9;
    s.v *= Math.exp(-f.rawDt * 2.2);
    s.y += f.dt * (0.22 + f.mid * 0.5) + f.rawDt * s.v * 0.6;
    s.x = 0.35 + Math.sin(f.time * 0.21) * 0.25;
    s.z = Math.sin(f.time * 0.13) * 0.2;
    euler.set(s.x, s.y, s.z);
    m4.makeRotationFromEuler(euler);
    extra.uRot.value.setFromMatrix4(m4).transpose();
    const aspect = state.size.width / Math.max(1, state.size.height);
    extra.uScale.value = (0.56 + f.bass * 0.08 * f.amp + f.beat * 0.03) * Math.min(1, aspect * 1.25);
    extra.uDispersion.value = 0.02 + f.beat * 0.07 + f.treble * 0.03 + f.mix * 0.08;
    u.uTime.value = f.time;
  }, extra);
  return (
    <mesh frustumCulled={false} renderOrder={-5} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
