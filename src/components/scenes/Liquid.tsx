"use client";

import { useMemo, useRef } from "react";
import { COMMON_GLSL, useFullscreenShader } from "./kit";

/**
 * Liquide: marbled ink from two levels of domain-warped fbm. The bass stirs a
 * vortex in the middle, every kick sends a ripple through the ink, and the
 * surface catches a specular sheen from screen-space derivatives.
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
uniform float uStir;
uniform float uRipple;
varying vec2 vUv;

${COMMON_GLSL}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;
  float r = length(p);
  int oct = uLow > 0.5 ? 3 : 5;

  // Bass vortex: rotation that falls off from the centre.
  float swirl = uStir * exp(-r * 2.2);
  float cs = cos(swirl), sn = sin(swirl);
  vec2 sp = mat2(cs, -sn, sn, cs) * p;
  // Kick ripple: a ring travelling outward.
  float ring = uRipple * 1.4;
  sp += normalize(p + 1e-4) * sin((r - ring) * 26.0) * exp(-abs(r - ring) * 9.0) * 0.03 * (1.0 - uRipple);

  float s = 1.6 * uFreq;
  vec2 base = sp * s + uSeed * 20.0;
  vec2 q = vec2(fbm(base + vec2(0.0, t * 0.06), oct),
                fbm(base + vec2(5.2, 1.3) - t * 0.05, oct));
  vec2 w = vec2(fbm(base + 3.6 * q + vec2(1.7, 9.2) + t * 0.11, oct),
                fbm(base + 3.6 * q + vec2(8.3, 2.8) - t * 0.09, oct));
  float f = fbm(base + (3.4 + uBass * 1.6) * w, oct);

  vec3 deep = vec3(0.012, 0.012, 0.024) + uColorA * 0.06;
  vec3 ink = mix(uColorA, uColorB, smoothstep(0.2, 0.8, q.x));
  float body = smoothstep(0.4, 0.88, f);
  vec3 col = mix(deep, ink * (0.32 + uMid * 0.7), body);
  // Veins where the second warp folds.
  float vein = exp(-abs(w.y - 0.5) * 26.0) * smoothstep(0.3, 0.7, f);
  col += vivid(uColorC) * vein * (0.22 + uTreble * 1.2 + uBeat * 0.4);
  col = mix(col, mix(uColorC, vec3(1.0), 0.45), smoothstep(0.8, 0.98, f) * 0.45);

  // Glossy surface from screen-space slopes of the ink height.
  vec3 n = normalize(vec3(-dFdx(f) * 90.0, -dFdy(f) * 90.0, 1.0));
  vec3 l = normalize(vec3(-0.4, 0.6, 0.7));
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  col += (vec3(1.0) * 0.5 + uColorB * 0.5) * spec * (0.25 + uTreble * 0.8) * body;

  float vig = smoothstep(1.3, 0.2, r);
  col *= mix(0.5, 1.0, vig);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy, uTime) * 0.022;
}
`;

export default function Liquid() {
  const state = useRef({ stir: 0, ripple: 1 });
  const extra = useMemo(() => ({ uStir: { value: 0 }, uRipple: { value: 1 } }), []);
  const { material } = useFullscreenShader(
    fragmentShader,
    (_u, f) => {
      const s = state.current;
      // The vortex angle integrates the bass: sustained lows keep stirring.
      s.stir += f.dt * (0.05 + f.bass * f.amp * 1.4 + f.mix * 1.2);
      if (f.kick && !f.reduced) s.ripple = 0;
      s.ripple = Math.min(1, s.ripple + f.rawDt * 0.9);
      extra.uStir.value = Math.sin(s.stir * 0.35) * 2.4;
      extra.uRipple.value = s.ripple;
    },
    extra
  );
  return (
    <mesh frustumCulled={false} renderOrder={-5} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
