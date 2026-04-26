uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uAlpha;

/** P8.3 — quantile thresholds from CPU (t1<t2<t3<=t4); t4 is max noise for span-based soft width. */
uniform float uThresh1;
uniform float uThresh2;
uniform float uThresh3;
uniform float uThresh4;

varying vec3 vObjPos;
varying vec3 vNormal;
varying float vNoise;

void main() {
  float n = vNoise;
  float span = max(1e-5, uThresh4 - uThresh1);
  float w = max(0.001, span * 0.028);

  float s0 = 1.0 - smoothstep(uThresh1 - w, uThresh1 + w, n);
  float s1 =
    smoothstep(uThresh1 - w, uThresh1 + w, n) *
    (1.0 - smoothstep(uThresh2 - w, uThresh2 + w, n));
  float s2 =
    smoothstep(uThresh2 - w, uThresh2 + w, n) *
    (1.0 - smoothstep(uThresh3 - w, uThresh3 + w, n));
  float s3 = smoothstep(uThresh3 - w, uThresh3 + w, n);

  vec3 col = uColor0 * s0 + uColor1 * s1 + uColor2 * s2 + uColor3 * s3;
  float wsum = s0 + s1 + s2 + s3;
  col /= max(wsum, 1e-4);

  float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.2);
  col += col * rim * 0.36;

  gl_FragColor = vec4(col, uAlpha);
}
