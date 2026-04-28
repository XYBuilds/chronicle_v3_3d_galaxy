#include "./oklab.glsl"

uniform float uHue[8];
uniform float uPerlinL;
uniform float uPerlinChroma;
uniform float uAlpha;

uniform float uThresh[7];
uniform float uCutCount;

uniform vec3 uMeshWorldPos;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uFlatShadingMix;

varying float vNoise;
varying vec3 vWorldPos;
varying float vLevel;
varying vec3 vGeomNormalWorld;

vec3 hueToOkSrgb(float hue, float L, float C) {
  float a = C * cos(hue);
  float b = C * sin(hue);
  // Low vote_average can drive L low while C stays high; some hue families then
  // leave the displayable sRGB gamut. Clamp before gamma encoding so negative
  // linear channels do not enter pow() and produce undefined/NaN colors.
  vec3 lin = clamp(oklab_to_linear_srgb(vec3(L, a, b)), 0.0, 1.0);
  return linear_to_srgb(lin);
}

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

  vec3 col0 = hueToOkSrgb(uHue[0], uPerlinL, uPerlinChroma);
  vec3 col1 = hueToOkSrgb(uHue[1], uPerlinL, uPerlinChroma);
  vec3 col2 = hueToOkSrgb(uHue[2], uPerlinL, uPerlinChroma);
  vec3 col3 = hueToOkSrgb(uHue[3], uPerlinL, uPerlinChroma);
  vec3 col4 = hueToOkSrgb(uHue[4], uPerlinL, uPerlinChroma);
  vec3 col5 = hueToOkSrgb(uHue[5], uPerlinL, uPerlinChroma);
  vec3 col6 = hueToOkSrgb(uHue[6], uPerlinL, uPerlinChroma);
  vec3 col7 = hueToOkSrgb(uHue[7], uPerlinL, uPerlinChroma);

  vec3 baseCol =
    col0 * (1.0 - step(1.0, bandIdx)) +
    col1 * step(1.0, bandIdx) * (1.0 - step(2.0, bandIdx)) +
    col2 * step(2.0, bandIdx) * (1.0 - step(3.0, bandIdx)) +
    col3 * step(3.0, bandIdx) * (1.0 - step(4.0, bandIdx)) +
    col4 * step(4.0, bandIdx) * (1.0 - step(5.0, bandIdx)) +
    col5 * step(5.0, bandIdx) * (1.0 - step(6.0, bandIdx)) +
    col6 * step(6.0, bandIdx) * (1.0 - step(7.0, bandIdx)) +
    col7 * step(7.0, bandIdx) * (1.0 - step(8.0, bandIdx));

  vec3 nDeriv = cross(dFdx(vWorldPos), dFdy(vWorldPos));
  nDeriv = normalize(nDeriv);
  if (dot(nDeriv, vGeomNormalWorld) < 0.0) {
    nDeriv = -nDeriv;
  }

  vec3 N = normalize(mix(normalize(vGeomNormalWorld), nDeriv, uFlatShadingMix));

  float lambert = max(dot(N, normalize(uLightDir)), 0.0);
  vec3 lit = baseCol * (uAmbient + uDiffuse * lambert);

  gl_FragColor = vec4(lit, uAlpha);
}
