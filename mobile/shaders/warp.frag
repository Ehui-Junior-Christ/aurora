#version 460 core
// Port of src/components/scenes/Warp.tsx: backgroundFragment (same math),
// the instanced star streaks are projected by the Dart driver into the
// additive overlay (same attributes, speed, stretch and fade formulas).
//   uP0.x uSpeed
#define HAS_OVERLAY
#include <common.glsl>

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = vec3(0.008, 0.008, 0.018);
  float z = 0.35 / max(r, 0.02) + uTime * (0.4 + uP0.x * 0.08);
  float haze = fbm(vec2(a * 3.0 + uSeed * 20.0, z), 3);
  haze = smoothstep(0.35, 0.9, haze) * smoothstep(0.05, 0.5, r) * exp(-r * 1.2);
  col += mix(uColorA, uColorC, 0.5 + 0.5 * sin(a + uTime * 0.2)) * haze * (0.25 + uMid * 0.8);
  col += mix(uColorB, vec3(1.0), 0.35) * exp(-r * (9.0 - uBeat * 4.0)) * (0.35 + uBass * 0.8 + uBeat * 1.2);
  col *= 1.0 - smoothstep(0.6, 1.3, r) * 0.5;
  col = composeOverlay(col, uv, 0.0);
  col += overlayGlow(uv, uP0.y) * uP0.z * uBloom;
  finish(bloomApprox(max(col, 0.0), 1.0), 0.022);
}
