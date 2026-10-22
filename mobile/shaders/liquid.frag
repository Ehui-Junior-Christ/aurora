#version 460 core
// Port of src/components/scenes/Liquid.tsx (same math and constants).
//   uP0.x uStir   uP0.y uRipple   uP0.z uLow   uP0.w uFreq   (uP1.x unused)
#include <common.glsl>

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float t = uTime;
  float r = length(p);
  int oct = uP0.z > 0.5 ? 3 : 5;

  float swirl = uP0.x * exp(-r * 2.2);
  float cs = cos(swirl), sn = sin(swirl);
  vec2 sp = mat2(cs, -sn, sn, cs) * p;
  float ring = uP0.y * 1.4;
  sp += normalize(p + 1e-4) * sin((r - ring) * 26.0) * exp(-abs(r - ring) * 9.0) * 0.03 * (1.0 - uP0.y);

  float s = 1.6 * uP0.w;
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
  float vein = exp(-abs(w.y - 0.5) * 26.0) * smoothstep(0.3, 0.7, f);
  col += vivid(uColorC) * vein * (0.22 + uTreble * 1.2 + uBeat * 0.4);
  col = mix(col, mix(uColorC, vec3(1.0), 0.45), smoothstep(0.8, 0.98, f) * 0.45);

  // Glossy surface from the slopes of the ink height. The web uses
  // dFdx/dFdy (per device px, ~1830 px tall); SkSL has no derivatives, so
  // the outer warp layer is differenced instead (same scale).
  float e = 0.01;
  float fx = fbm(base + vec2(e, 0.0) + (3.4 + uBass * 1.6) * w, oct);
  float fy = fbm(base + vec2(0.0, e) + (3.4 + uBass * 1.6) * w, oct);
  float k = s / 1830.0 / e;
  vec3 n = normalize(vec3(-(fx - f) * k * 90.0, -(fy - f) * k * 90.0, 1.0));
  vec3 l = normalize(vec3(-0.4, 0.6, 0.7));
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  col += (vec3(1.0) * 0.5 + uColorB * 0.5) * spec * (0.25 + uTreble * 0.8) * body;

  float vig = smoothstep(1.3, 0.2, r);
  col *= mix(0.5, 1.0, vig);
  finish(bloomApprox(max(col, 0.0), 1.0), 0.022);
}
