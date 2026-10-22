#version 460 core
// Port of src/components/scenes/Prism.tsx (same math and constants).
//   uRot (mat3, columns) = uP0.xyz | uP0.w uP1.xy | uP1.zw uP2.x
//   uP2.y uScale   uP2.z uDispersion   uP2.w uLow
// Raymarch capped at 48 steps (web: 56) for mobile GPUs.
#include <common.glsl>

mat3 rotM() { return mat3(uP0.xyz, vec3(uP0.w, uP1.xy), vec3(uP1.zw, uP2.x)); }

float sdOct(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float map(vec3 p, mat3 R) {
  float sc = uP2.y;
  p = R * p / sc;
  float gem = max(sdOct(p * vec3(1.0, 0.82, 1.0), 1.0), sdBox(p, vec3(0.64, 0.8, 0.64)));
  gem = max(gem, sdOct(p * vec3(0.9, 1.0, 0.9), 1.12));
  return gem * sc;
}
vec3 calcNormal(vec3 p, mat3 R) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * h, R) + k.yyx * map(p + k.yyx * h, R) +
                   k.yxy * map(p + k.yxy * h, R) + k.xxx * map(p + k.xxx * h, R));
}

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

vec3 prismBack(vec2 p, float chan) {
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec3 col = vec3(0.012, 0.012, 0.022);
  float shafts = pow(vnoise(vec2(ang * 7.0 + uSeed * 30.0, uTime * 0.15)), 3.0);
  shafts *= exp(-r * 2.2) * (0.14 + uMid * 0.45);
  col += mix(vivid(uColorA), vivid(uColorC), 0.5 + 0.5 * sin(ang * 2.0 + uTime * 0.2)) * shafts;
  float ringR = 0.62 * uP2.y + uBass * 0.03;
  float disp = uP2.z * 3.0;
  vec3 ring = vec3(
    exp(-abs(r - ringR * (1.0 + disp)) * 140.0),
    exp(-abs(r - ringR) * 140.0),
    exp(-abs(r - ringR * (1.0 - disp)) * 140.0));
  col += ring * (0.1 + uBeat * 0.5 + uTreble * 0.2);
  // Bloom of the thin ring (cheap stand-in for the blur pass).
  vec3 ringGlow = vec3(
    exp(-abs(r - ringR * (1.0 + disp)) * 22.0),
    exp(-abs(r - ringR) * 22.0),
    exp(-abs(r - ringR * (1.0 - disp)) * 22.0));
  col += ringGlow * (0.1 + uBeat * 0.5 + uTreble * 0.2) * 0.12 * uBloom;
  col += vivid(uColorB) * exp(-r * 3.5) * (0.05 + uEnergy * 0.22);
  col += vec3(1.0) * pow(0.5 + 0.5 * sin(r * 70.0 - uTime * 1.5 + chan), 30.0) * exp(-r * 3.0) * 0.18 * step(0.0, chan);
  return col;
}

void main() {
  vec2 uv = sceneUv();
  vec2 p = (uv - 0.5) * vec2(sceneAspect(), 1.0);
  float r = length(p);
  vec3 col = prismBack(p, -1.0);
  mat3 R = rotM();

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(p, -1.55));
  float bound = 1.3 * uP2.y;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - bound * bound;
  float h = b * b - c;
  if (h > 0.0) {
    float tt = -b - sqrt(h);
    float tMax = -b + sqrt(h);
    float hit = 0.0;
    float done = 0.0;
    float steps = uP2.w > 0.5 ? 28.0 : 48.0;
    // No break: GLES backends get a bounded loop (a flag ends the march).
    for (int i = 0; i < 48; i++) {
      if (done < 0.5) {
        vec3 pos = ro + rd * tt;
        float d = map(pos, R);
        if (d < 0.0012) {
          hit = 1.0;
          done = 1.0;
        } else {
          tt += d;
          if (tt > tMax || float(i) >= steps) done = 1.0;
        }
      }
    }
    if (hit > 0.5) {
      vec3 pos = ro + rd * tt;
      vec3 n = calcNormal(pos, R);
      float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
      vec3 refl = env(reflect(rd, n));
      float eta = 1.0 / 1.5;
      vec3 rr = refract(rd, n, eta - uP2.z);
      vec3 rg = refract(rd, n, eta);
      vec3 rb = refract(rd, n, eta + uP2.z);
      float lens = 1.4;
      vec3 refr = vec3(
        prismBack(p + (rr.xy - rd.xy) * lens, 0.0).r,
        prismBack(p + (rg.xy - rd.xy) * lens, 0.7).g,
        prismBack(p + (rb.xy - rd.xy) * lens, 1.4).b);
      vec3 gem = refr * 1.6 + vivid(mix(uColorB, uColorC, 0.5)) * 0.025;
      gem = mix(gem, refl, clamp(0.08 + fres * 0.9, 0.0, 1.0));
      float edgeF = 1.0 - smoothstep(0.0, 0.9, abs(dot(n, rd)));
      gem += vec3(1.0) * pow(edgeF, 6.0) * (0.3 + uTreble * 1.2);
      col = gem;
    }
  }

  float vig = smoothstep(1.4, 0.25, r);
  col *= mix(0.5, 1.0, vig);
  finish(bloomApprox(max(col, 0.0), 1.0), 0.022);
}
