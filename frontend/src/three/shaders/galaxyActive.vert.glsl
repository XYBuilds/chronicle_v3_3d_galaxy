#include "./oklab.glsl"

uniform float uPixelRatio;
uniform float uZCurrent;
uniform float uZVisWindow;
uniform float uSizeScale;
uniform float uActiveSizeMul;
uniform float uBgSizeMul;
uniform float uLMin;
uniform float uLMax;
uniform float uHighRatingT;
uniform float uHighTierTRangeScale;
uniform float uLightnessRatingExponent;
uniform float uChroma;
uniform float uHuntGamma;
uniform int uHuntApplyMask;
uniform int uHoveredInstanceId;
uniform int uFocusedInstanceId;
uniform float uFocusCameraBlend;
uniform int uFocusTargetInstanceId;
uniform float uFocusNonTargetActiveAlpha;
uniform sampler2D uSelectionMask;
uniform int uSelectionMode;
uniform int uSelectionAtlasWidth;
uniform int uSelectionAtlasHeight;

attribute float hue;
attribute float voteNorm;
attribute float aSize;

varying vec3 vColor;
varying float vFocusAlphaMult;

void main() {
  float aZ = instanceMatrix[3][2];
  float zHi = uZCurrent + uZVisWindow;
  float W = uZVisWindow * 0.2;

  float inFocus;
  if (uSelectionMode >= 1) {
    float aw = float(max(uSelectionAtlasWidth, 1));
    float ah = float(max(uSelectionAtlasHeight, 1));
    float idF = float(gl_InstanceID);
    float ax = mod(idF, aw);
    float ay = floor(idF / aw);
    vec2 selUv = vec2((ax + 0.5) / aw, (ay + 0.5) / ah);
    inFocus = texture2D(uSelectionMask, selUv).r;
  } else {
    inFocus =
      smoothstep(uZCurrent - W, uZCurrent, aZ) *
      (1.0 - smoothstep(zHi, zHi + W, aZ));
  }

  bool isFocused = (uFocusedInstanceId >= 0) && (gl_InstanceID == uFocusedInstanceId);
  float sActive = inFocus * uSizeScale * uActiveSizeMul * aSize;
  if (isFocused) {
    sActive = 0.0;
  }

  if (sActive < 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vFocusAlphaMult = 1.0;
    return;
  }

  vec3 scaled = position * sActive;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float t = clamp(voteNorm, 0.0, 1.0);
  float tCompressed = t < uHighRatingT
    ? t
    : uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale;
  float tPow = pow(tCompressed, uLightnessRatingExponent);
  float L_base = mix(uLMin, uLMax, tPow);
  float C_base_after_hunt = (uHuntApplyMask & 2) != 0
    ? applyHuntChroma(L_base, uLMax, uChroma, uHuntGamma)
    : uChroma;
  float a = C_base_after_hunt * cos(hue);
  float labB = C_base_after_hunt * sin(hue);
  vColor = linear_to_srgb(oklab_to_linear_srgb(vec3(L_base, a, labB)));

  bool isFocusTarget =
    (uFocusTargetInstanceId >= 0) && (gl_InstanceID == uFocusTargetInstanceId);
  float blend = clamp(uFocusCameraBlend, 0.0, 1.0);
  float dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, blend);
  bool isHovered = (uHoveredInstanceId >= 0) && (gl_InstanceID == uHoveredInstanceId);
  bool hoverAlphaOverride = (uSelectionMode == 2) && isHovered;
  vFocusAlphaMult = (isFocusTarget || hoverAlphaOverride) ? 1.0 : dimAlpha;
}
