#include "./oklab.glsl"

uniform float uHue[8];
uniform float uPerlinL;
uniform float uPerlinChroma;
uniform float uLMax;
uniform float uHuntGamma;
uniform int uHuntApplyMask;
uniform float uAlpha;

uniform float uThresh[7];
uniform float uCutCount;

uniform vec3 uMeshWorldPos;
uniform vec3 uLightDir;
uniform float uEmissionIntensity;
uniform float uKeyLightIntensity;
/** 1 = Lambert shading; 0 = flat base color (no lighting). */
uniform float uLightingEnabled;
uniform float uFlatShadingMix;

varying float vNoise;
varying vec3 vWorldPos;
varying float vLevel;
varying vec3 vGeomNormalWorld;

vec3 hueToOkLinear(float hue, float L, float C) {
  float a = C * cos(hue);
  float b = C * sin(hue);
  // Keep band colors in linear RGB. Out-of-gamut negative channels are unsafe
  // for the single final gamma conversion, but positive HDR values stay intact.
  return max(oklab_to_linear_srgb(vec3(L, a, b)), vec3(0.0));
}

void main() {
  float n = vNoise;

  float C_perlin = (uHuntApplyMask & 4) != 0
    ? applyHuntChroma(uPerlinL, uLMax, uPerlinChroma, uHuntGamma)
    : uPerlinChroma;

  float bandIdx = 0.0;
  bandIdx += step(0.5, uCutCount) * step(uThresh[0], n);
  bandIdx += step(1.5, uCutCount) * step(uThresh[1], n);
  bandIdx += step(2.5, uCutCount) * step(uThresh[2], n);
  bandIdx += step(3.5, uCutCount) * step(uThresh[3], n);
  bandIdx += step(4.5, uCutCount) * step(uThresh[4], n);
  bandIdx += step(5.5, uCutCount) * step(uThresh[5], n);
  bandIdx += step(6.5, uCutCount) * step(uThresh[6], n);

  vec3 col0 = hueToOkLinear(uHue[0], uPerlinL, C_perlin);
  vec3 col1 = hueToOkLinear(uHue[1], uPerlinL, C_perlin);
  vec3 col2 = hueToOkLinear(uHue[2], uPerlinL, C_perlin);
  vec3 col3 = hueToOkLinear(uHue[3], uPerlinL, C_perlin);
  vec3 col4 = hueToOkLinear(uHue[4], uPerlinL, C_perlin);
  vec3 col5 = hueToOkLinear(uHue[5], uPerlinL, C_perlin);
  vec3 col6 = hueToOkLinear(uHue[6], uPerlinL, C_perlin);
  vec3 col7 = hueToOkLinear(uHue[7], uPerlinL, C_perlin);

  vec3 baseLinear =
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

  vec3 emissiveLinear = baseLinear * uEmissionIntensity;
  vec3 keyLitLinear = baseLinear * uKeyLightIntensity * lambert;
  vec3 litLinear = emissiveLinear + keyLitLinear;
  vec3 finalLinear = mix(baseLinear, litLinear, step(0.5, uLightingEnabled));

  // One shared output boundary keeps flat diagnostic and lit HDR paths linear
  // until gamma encoding. Do not clamp positive values before selective Bloom.
  gl_FragColor = vec4(linear_to_srgb(max(finalLinear, vec3(0.0))), uAlpha);
}
