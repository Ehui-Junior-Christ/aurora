#version 460 core
// "Spectre": Spectrum.tsx floorFragment (same math) ray-traced on the y = 0
// plane through the orbiting camera; bars and their reflection come from the
// overlay (opaque mode), projected by the Dart driver.
//   uP0.xyz camera position   uP0.w uRadius   uP1.xyz camera target
#define HAS_OVERLAY
#include <common.glsl>

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  vec3 col = backdrop(uv);

  vec3 ro = uP0.xyz;
  vec3 fw = normalize(uP1.xyz - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.3025 * fw);
  if (rd.y < -1e-4) {
    float t = -ro.y / rd.y;
    vec3 hp = ro + rd * t;
    vec2 vPos = vec2(hp.x, -hp.z);
    float r = length(vPos);
    if (r < 4.5) {
      float a = atan(vPos.y, vPos.x);
      float rings = abs(fract(r * 3.0 - uTime * 0.15) - 0.5);
      float spokes = abs(fract(a / 6.2831853 * 64.0) - 0.5);
      float grid = (smoothstep(0.03, 0.0, rings) + smoothstep(0.04, 0.0, spokes) * 0.4) * exp(-r * 0.7);
      vec3 fc = uColorA * grid * 0.12;
      fc += mix(uColorB, uColorC, 0.5) * exp(-r * r * 3.0) * (0.12 + uBass * 0.7 + uBeat * 0.4);
      fc += uColorB * exp(-abs(r - uP0.w) * 18.0) * (0.25 + uBeat * 0.6);
      float alpha = smoothstep(4.5, 1.5, r);
      float oa = alpha * 0.85;
      col = fc * alpha * oa + col * (1.0 - oa);
    }
  }
  col = composeOverlay(col, uv, 1.0);
  col += overlayGlow(uv, 7.0) * 0.5 * uBloom;
  finish(bloomApprox(col, 1.0), 0.0);
}
