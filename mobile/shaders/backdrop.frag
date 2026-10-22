#version 460 core
// Backdrop.tsx + the overlay geometry of the point / instanced scenes
// (Particules, Galaxie, Ondes, Tunnel, Mosaïque, Constellation).
//   uP0.x  overlay mode: 0 = additive, 1 = opaque (premultiplied over)
//   uP0.y  glow radius in pixels      uP0.z  glow gain
#define HAS_OVERLAY
#include <common.glsl>

void main() {
  vec2 uv = sceneUv();
  vec3 col = backdrop(uv);
  col = composeOverlay(col, uv, uP0.x);
  if (uP0.z > 0.0) col += overlayGlow(uv, uP0.y) * uP0.z * uBloom;
  col = bloomApprox(col, 1.0);
  finish(col, 0.0);
}
