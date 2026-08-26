import { NOISE_GLSL } from "./noise";

export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uSeed;
uniform float uNoiseFreq;
uniform float uFlowSpeed;
uniform float uAmpMul;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vNoise;

${NOISE_GLSL}

void main() {
  float t = uTime * uFlowSpeed;
  vec3 dir = normalize(position);
  float off = uSeed * 0.173;

  float n = snoise(dir * uNoiseFreq + vec3(t * 0.7, t * 0.45, t * 0.3) + off);
  n += 0.5 * snoise(dir * uNoiseFreq * 2.3 + vec3(-t * 0.9, t * 0.6, t) + off * 2.0)
       * (0.35 + uMid * 1.15);

  float ridge = 1.0 - abs(snoise(dir * uNoiseFreq * 4.2 + vec3(t * 1.5) + off));
  n += ridge * uTreble * 0.55;

  float amp = (0.14 + uBass * 0.52 + uBeat * 0.06) * uAmpMul;
  vec3 displaced = position + normal * n * amp;

  vNoise = n;
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
