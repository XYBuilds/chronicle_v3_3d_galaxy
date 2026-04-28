#include "./oklab.glsl"

uniform float uPixelRatio;
uniform float uZCurrent;
uniform float uZVisWindow;
uniform float uSizeScale;
uniform float uBgSizeMul;
uniform float uLMin;
uniform float uLMax;
uniform float uHighRatingT;
uniform float uHighTierTRangeScale;
uniform float uLightnessRatingExponent;
uniform float uDistanceFalloffK;
uniform float uChroma;
uniform int uFocusedInstanceId;

attribute float hue;
attribute float voteNorm;
attribute float aSize;

varying vec3 vColor;
varying float vInFocus;
varying float vDistFalloff;

void main() {
  float aZ = instanceMatrix[3][2];
  float zHi = uZCurrent + uZVisWindow;
  float W = uZVisWindow * 0.2;
  float inFocus =
    smoothstep(uZCurrent - W, uZCurrent, aZ) *
    (1.0 - smoothstep(zHi, zHi + W, aZ));

  bool isFocused = (uFocusedInstanceId >= 0) && (gl_InstanceID == uFocusedInstanceId);
  float sIdle = (1.0 - inFocus) * uSizeScale * uBgSizeMul * aSize;
  if (isFocused) {
    sIdle = 0.0;
  }

  if (sIdle < 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vInFocus = inFocus;
    vDistFalloff = 1.0;
    return;
  }

  vec3 scaled = position * sIdle;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);
  float d2 = dot(mvPosition.xyz, mvPosition.xyz);
  vDistFalloff = 1.0 / (1.0 + uDistanceFalloffK * d2);
  gl_Position = projectionMatrix * mvPosition;

  float t = clamp(voteNorm, 0.0, 1.0);
  float tCompressed = t < uHighRatingT
    ? t
    : uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale;
  float tPow = pow(tCompressed, uLightnessRatingExponent);
  float L = mix(uLMin, uLMax, tPow);
  float a = uChroma * cos(hue);
  float labB = uChroma * sin(hue);
  vColor = linear_to_srgb(oklab_to_linear_srgb(vec3(L, a, labB)));
  vInFocus = inFocus;
}
