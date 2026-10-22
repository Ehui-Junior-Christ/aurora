#version 460 core
// Port of src/components/scenes/Metaballs.tsx, alpha-blended over Backdrop.
// The driver feeds this scene like the web: raw bands, its own clock
// (uTime += d * (0.5 + bass * 0.6)) and uSeed = seed % 997 (not normalised).
#include <common.glsl>

vec2 center(float i) {
  float a = 0.25 + fract(sin(i * 12.9898 + uSeed) * 43758.5453) * 0.35;
  float b = 0.2 + fract(sin(i * 78.233 + uSeed) * 43758.5453) * 0.3;
  float ph = i * 17.13 + uSeed * 0.017;
  return vec2(sin(uTime * a + ph) * 0.72, cos(uTime * b + ph * 1.3) * 0.62);
}

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float field = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = center(fi) * (1.0 + uMid * 0.35);
    float r = 0.11 + 0.05 * sin(fi * 2.7 + uTime * 0.4) + uBass * 0.09 + uBeat * 0.05;
    float d2 = dot(p - c, p - c);
    field += (r * r) / max(d2, 1e-5);
  }

  float body = smoothstep(1.05, 2.4, field);
  float edge = smoothstep(0.45, 1.05, field) * (1.0 - body);
  float swirl = sin(field * 2.4 - uTime * 0.8) * 0.5 + 0.5;

  vec3 col = mix(uColorA, uColorB, swirl) * body * (0.55 + uBass * 1.1 + uBeat * 0.45);
  col += uColorC * edge * (0.9 + uTreble * 2.2);
  col += vec3(1.0) * pow(edge, 3.0) * 0.25;

  float alpha = clamp(body * 0.92 + edge * 0.55 + 0.05, 0.0, 1.0);
  vec3 outc = col * alpha + backdrop(uv) * (1.0 - alpha);
  finish(bloomApprox(outc, 1.0), 0.0);
}
