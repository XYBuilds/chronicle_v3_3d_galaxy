uniform vec3 uColors[8];
uniform float uAlpha;

uniform float uThresh[7];
uniform float uCutCount;

varying float vNoise;
varying vec3 vWorldPos;
varying float vLevel;

void main() {
  float n = vNoise;

  float bandIdx = 0.0;
  bandIdx += step(0.5, uCutCount) * step(uThresh[0], n);
  bandIdx += step(1.5, uCutCount) * step(uThresh[1], n);
  bandIdx += step(2.5, uCutCount) * step(uThresh[2], n);
  bandIdx += step(3.5, uCutCount) * step(uThresh[3], n);
  bandIdx += step(4.5, uCutCount) * step(uThresh[4], n);
  bandIdx += step(5.5, uCutCount) * step(uThresh[5], n);
  bandIdx += step(6.5, uCutCount) * step(uThresh[6], n);

  vec3 col =
    uColors[0] * (1.0 - step(1.0, bandIdx)) +
    uColors[1] * step(1.0, bandIdx) * (1.0 - step(2.0, bandIdx)) +
    uColors[2] * step(2.0, bandIdx) * (1.0 - step(3.0, bandIdx)) +
    uColors[3] * step(3.0, bandIdx) * (1.0 - step(4.0, bandIdx)) +
    uColors[4] * step(4.0, bandIdx) * (1.0 - step(5.0, bandIdx)) +
    uColors[5] * step(5.0, bandIdx) * (1.0 - step(6.0, bandIdx)) +
    uColors[6] * step(6.0, bandIdx) * (1.0 - step(7.0, bandIdx)) +
    uColors[7] * step(7.0, bandIdx) * (1.0 - step(8.0, bandIdx));

  gl_FragColor = vec4(col, uAlpha);
}
