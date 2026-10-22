// Shared header of every AURORA scene shader (ported from the web app's
// src/components/scenes/kit.ts + Visualizer.tsx). Included, not compiled alone.
//
// UNIFORM LAYOUT (setFloat indices, identical in every shader; see
// lib/visuals/scene_uniforms.dart). Every uniform is referenced by finish()
// so the compiler can never strip one and shift the indices.
//   0-1  uSize      canvas size in pixels (the offscreen render target)
//   2    uTime      scene clock (kit.ts frame.time)
//   3    uClock     raw elapsed seconds (Backdrop's own clock)
//   4    uBass      smoothed bands (attack 16/s, release 5/s), already * amp
//   5    uMid
//   6    uTreble
//   7    uEnergy    bass*.5 + mid*.35 + treble*.15
//   8    uBeat      beat pulse (BeatDetector)
//   9    uSeed      (track.seed % 997) / 997
//   10-12 uColorA   palette, LINEAR (sRGB hex converted like THREE.Color.set)
//   13-15 uColorB
//   16-18 uColorC
//   19-22 uP0       per-scene parameters (driver-specific, see each .frag)
//   23-26 uP1
//   27-30 uP2
//   31-34 uP3
//   35    uBloom    bloom intensity of the mode (Visualizer.tsx BLOOM map)
// Samplers: 0 = uOverlay (scenes defining HAS_OVERLAY), then uCover.
#include <flutter/runtime_effect.glsl>

precision highp float;

uniform vec2 uSize;
uniform float uTime;
uniform float uClock;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec4 uP0;
uniform vec4 uP1;
uniform vec4 uP2;
uniform vec4 uP3;
uniform float uBloom;
#ifdef HAS_OVERLAY
// Geometry drawn by the Dart driver (points, streaks, bars...), stored
// sRGB-encoded and premultiplied.
uniform sampler2D uOverlay;
#endif
#ifdef HAS_COVER
uniform sampler2D uCover;
#endif

out vec4 fragColor;

// three.js vUv: origin bottom-left.
vec2 sceneUv() {
  vec2 fc = FlutterFragCoord().xy;
  return vec2(fc.x / uSize.x, 1.0 - fc.y / uSize.y);
}
float sceneAspect() { return uSize.x / max(1.0, uSize.y); }

// ---- COMMON_GLSL (kit.ts) ---------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
vec3 vivid(vec3 c) {
  return c / max(max(c.r, c.g), max(c.b, 0.04));
}
float grain(vec2 fragCoord, float t) {
  return hash12(fragCoord + fract(t * 7.13) * 431.0) - 0.5;
}

// ---- colour pipeline ----------------------------------------------------
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 hi = pow(c, vec3(0.41666)) * 1.055 - vec3(0.055);
  vec3 lo = c * 12.92;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}
vec3 srgbToLinear(vec3 c) {
  vec3 hi = pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4));
  vec3 lo = c * 0.0773993808;
  return mix(hi, lo, step(c, vec3(0.04045)));
}
// three.js ACESFilmicToneMapping (exposure 1). The web app only applies it
// when bloom is off (EffectComposer forces NoToneMapping), so the default
// path below does not use it; kept for parity.
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 color) {
  mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = inM * color;
  color = RRTAndODTFit(color);
  color = outM * color;
  return clamp(color, 0.0, 1.0);
}

// postprocessing Bloom (luminanceThreshold .12, smoothing .9) on a smooth
// field: the blurred, luminance-masked image is close to the image itself.
vec3 bloomApprox(vec3 c, float gain) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c + c * smoothstep(0.12, 1.02, l) * uBloom * gain;
}

// ---- Backdrop.tsx (always rendered behind every scene), LINEAR ----------
vec3 backdrop(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float rot = uClock * 0.02;
  float c = cos(rot);
  float s = sin(rot);
  p = mat2(c, -s, s, c) * p;
  vec3 col = vec3(0.025, 0.025, 0.04);
  float g1 = length(p - vec2(-0.5, 0.35));
  float g2 = length(p - vec2(0.55, -0.42));
  float g3 = length(p - vec2(0.18, 0.12));
  col += uColorA * exp(-g1 * g1 * 5.0) * 0.42;
  col += uColorB * exp(-g2 * g2 * 6.5) * 0.30;
  col += uColorC * exp(-g3 * g3 * 8.0) * 0.22;
  float vig = smoothstep(1.5, 0.35, length(p));
  col *= mix(0.75, 1.0, vig);
  return col;
}

#ifdef HAS_OVERLAY
vec4 overlayAt(vec2 uv) {
  return texture(uOverlay, vec2(uv.x, 1.0 - uv.y));
}
// Overlay in linear light; additive layers add, opaque layers cover.
vec3 composeOverlay(vec3 bg, vec2 uv, float overMode) {
  vec4 o = overlayAt(uv);
  vec3 lin = srgbToLinear(o.rgb);
  return bg * (1.0 - o.a * overMode) + lin;
}
// Cheap bloom of thin overlay geometry: two rings of taps.
vec3 overlayGlow(vec2 uv, float radiusPx) {
  vec2 px = radiusPx / uSize;
  vec3 g = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 d = vec2(cos(a), sin(a));
    g += srgbToLinear(overlayAt(uv + d * px).rgb) * 0.6;
    g += srgbToLinear(overlayAt(uv + d * px * 2.6).rgb) * 0.4;
  }
  return g / 8.0;
}
#endif

// Final output: linear -> (bloom already applied) -> sRGB + film grain.
void finish(vec3 linear, float grainAmount) {
  vec2 fc = FlutterFragCoord().xy;
  vec3 col = linearToSrgb(max(linear, 0.0));
  col += grain(fc, uTime) * grainAmount;
  fragColor = vec4(col, 1.0);
  // Never true: keeps every uniform alive so setFloat indices never shift.
  if (uSize.x < -1.0) {
    fragColor += vec4(uTime + uClock + uBass + uMid + uTreble + uEnergy + uBeat + uSeed + uBloom)
      + vec4(uColorA + uColorB + uColorC, 0.0) + uP0 + uP1 + uP2 + uP3;
  }
}
