#version 460 core
// Port of src/components/scenes/Nebula.tsx, alpha-blended over Backdrop.
// Driver: raw bands, uTime += d, uSeed = seed % 991 (not normalised).
#include <common.glsl>
#include <noise.glsl>

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p);
    p *= 2.05;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float t = uTime * 0.06;

  vec2 q = vec2(fbm3(vec3(p * 1.5, t + uSeed * 0.01)),
                fbm3(vec3(p * 1.5 + 4.7, t * 1.2 + uSeed * 0.013)));
  float cloud = fbm3(vec3(p * 2.2 + q * 1.4, t * 1.5 + uSeed * 0.017));
  float density = smoothstep(-0.25, 0.75, cloud);

  vec3 col = mix(uColorA, uColorB, q.x * 0.5 + 0.5) * density * (0.35 + uBass * 0.95);
  col += uColorC * smoothstep(0.35, 0.85, cloud) * (0.5 + uTreble * 1.6);
  col += vec3(1.0) * pow(smoothstep(0.55, 1.0, cloud), 3.0) * 0.5;

  float alpha = clamp(density * 0.9 + 0.08, 0.0, 1.0);
  vec3 outc = col * alpha + backdrop(uv) * (1.0 - alpha);
  finish(bloomApprox(outc, 1.0), 0.0);
}
