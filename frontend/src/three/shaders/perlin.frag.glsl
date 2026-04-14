uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uWeight0;
uniform float uWeight1;
uniform float uWeight2;
uniform float uWeight3;
uniform float uTime;
uniform float uAlpha;

varying vec3 vObjPos;
varying vec3 vNormal;

// Compact 3D value noise (tri-linear interpolation of hashed lattice).
float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  vec3 shift = vec3(100.0, 37.0, 19.0);
  for (int i = 0; i < 4; i++) {
    sum += amp * noise3(p);
    p = p * 2.02 + shift;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 p = vObjPos * 3.2 + vec3(uTime * 0.08, uTime * 0.05, uTime * 0.06);
  float n = fbm(p);
  n = smoothstep(0.15, 0.92, n);

  vec3 cMix =
    uColor0 * uWeight0 +
    uColor1 * uWeight1 +
    uColor2 * uWeight2 +
    uColor3 * uWeight3;

  vec3 lit = cMix * (0.42 + 0.58 * n);
  float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.2);
  lit += cMix * rim * 0.35;

  gl_FragColor = vec4(lit, uAlpha);
}
