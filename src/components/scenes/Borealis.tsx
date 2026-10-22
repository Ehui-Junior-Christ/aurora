"use client";

import { useMemo, useRef } from "react";
import { COMMON_GLSL, useFullscreenShader } from "./kit";

/**
 * Aurore boréale: perspective light curtains seen from a lake shore. The ray
 * crosses stacked altitude slices of a cheap folded triangle noise (40 slices,
 * 22 in low quality), coloured from the cover palette; below the horizon the
 * lake reflects them. Bass lifts and brightens the curtains, mids speed up
 * their folding, highs make them shimmer, kicks flash the sky.
 */
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uFreq;
uniform float uSeed;
uniform float uLow;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uFlow;
varying vec2 vUv;

${COMMON_GLSL}

mat2 mm2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
const mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);
float tri(float x) { return clamp(abs(fract(x) - 0.5), 0.01, 0.49); }
vec2 tri2(vec2 p) { return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x))); }

float triNoise2d(vec2 p, float spd) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  p *= mm2(p.x * 0.06);
  vec2 bp = p;
  for (int i = 0; i < 5; i++) {
    vec2 dg = tri2(bp * 1.85) * 0.75;
    dg *= mm2(uFlow * spd);
    p -= dg / z2;
    bp *= 1.3;
    z2 *= 0.45;
    z *= 0.42;
    p *= 1.21 + (rz - 1.0) * 0.02;
    rz += tri(p.x + tri(p.y)) * z;
    p *= -m2;
  }
  return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

vec3 auroraTint(float k) {
  vec3 a = vivid(uColorB);
  vec3 b = vivid(uColorA);
  vec3 c = vivid(uColorC);
  return k < 0.5 ? mix(a, b, k * 2.0) : mix(b, c, k * 2.0 - 1.0);
}

vec3 aurora(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0);
  vec3 avg = vec3(0.0);
  float steps = uLow > 0.5 ? 22.0 : 40.0;
  float stride = 40.0 / steps;
  float jitter = hash12(gl_FragCoord.xy + fract(uTime) * 91.0);
  for (int j = 0; j < 40; j++) {
    float fj = float(j);
    if (fj >= steps) break;
    float i = fj * stride;
    float of = 0.006 * jitter * smoothstep(0.0, 15.0, i);
    float alt = 0.8 - uBass * 0.12 + pow(i, 1.4) * 0.002;
    float pt = (alt - ro.y) / (rd.y * 2.0 + 0.4) - of;
    vec3 bpos = ro + pt * rd;
    vec2 p = bpos.zx * uFreq + uSeed * 40.0;
    // Drop the noise floor so the sky between ribbons stays dark.
    float rzt = max(triNoise2d(p, 0.06) - 0.035, 0.0);
    vec3 c2 = auroraTint(i / 40.0) * rzt;
    avg = mix(avg, c2, 0.5);
    col += avg * exp2(-i * 0.065 - 2.5) * smoothstep(0.0, 5.0, i) * stride;
  }
  col *= clamp(rd.y * 15.0 + 0.4, 0.0, 1.0);
  float shimmer = 1.0 + uTreble * 0.9 * (vnoise(vec2(rd.x * 60.0, uTime * 7.0)) - 0.4);
  return col * 1.8 * (0.6 + uBass * 0.55 + uBeat * 0.35) * shimmer;
}

vec3 stars(vec3 rd) {
  vec2 g = vec2(atan(rd.x, rd.z), rd.y) * 90.0;
  vec2 id = floor(g);
  float h = hash12(id + uSeed * 31.0);
  if (h < 0.955) return vec3(0.0);
  vec2 f = fract(g) - 0.5;
  float d = length(f);
  float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 6.0) + h * 50.0);
  return vec3(0.9, 0.93, 1.0) * smoothstep(0.12, 0.0, d) * tw * (1.0 + uTreble);
}

vec3 sky(vec3 rd) {
  vec3 col = mix(vec3(0.004, 0.005, 0.014), vivid(uColorA) * 0.025 + vec3(0.006, 0.008, 0.02), smoothstep(0.35, 0.0, rd.y));
  col += stars(rd) * smoothstep(0.0, 0.25, rd.y);
  col += aurora(vec3(0.0, 0.0, -6.7), rd);
  return col;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  // Horizon sits low: look slightly upward.
  vec3 rd = normalize(vec3(p.x, p.y + 0.3, 1.3));
  rd.xz *= mm2(sin(uTime * 0.03) * 0.15);
  vec3 col;
  if (rd.y > 0.0) {
    col = sky(rd);
  } else {
    // Lake: fresnel-weighted reflection with gentle ripples.
    vec3 rr = rd;
    rr.y = abs(rr.y);
    rr.x += (vnoise(vec2(p.x * 30.0, p.y * 90.0 + uTime * 0.8)) - 0.5) * 0.02 * (1.0 + uBass * 2.0);
    float fres = 0.35 + 0.65 * pow(1.0 - abs(rd.y), 5.0);
    col = sky(normalize(rr)) * fres * 0.6 + vec3(0.002, 0.003, 0.008);
  }
  // Far shore silhouette on the horizon.
  float ridge = -0.288 + (fbm(vec2(p.x * 3.0 + uSeed * 9.0, 3.1), 3) - 0.5) * 0.08;
  float land = smoothstep(ridge + 0.002, ridge - 0.002, p.y) * smoothstep(-0.32, -0.302, p.y);
  col = mix(col, vec3(0.003, 0.004, 0.009), land);

  float vig = smoothstep(1.4, 0.3, length(p * vec2(0.8, 1.1)));
  col *= mix(0.6, 1.0, vig);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy, uTime) * 0.02;
}
`;

export default function Borealis() {
  const flow = useRef(0);
  const extra = useMemo(() => ({ uFlow: { value: 0 } }), []);
  const { material } = useFullscreenShader(
    fragmentShader,
    (_u, f) => {
      // The mids speed up the folding of the curtains.
      flow.current += f.dt * (0.6 + f.mid * f.amp * 2.2 + f.mix * 2.5);
      extra.uFlow.value = flow.current;
    },
    extra
  );
  return (
    <mesh frustumCulled={false} renderOrder={-5} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
