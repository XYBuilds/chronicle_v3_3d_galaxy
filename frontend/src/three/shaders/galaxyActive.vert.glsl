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
uniform float uFocusActiveDimBlend;
uniform int uFocusTargetInstanceId;
uniform float uFocusNonTargetActiveAlpha;
uniform float uFocusHoveredActiveAlpha;
uniform sampler2D uSelectionMask;
uniform int uSelectionMode;
uniform int uSelectionAtlasWidth;
uniform int uSelectionAtlasHeight;
uniform float uNearCullWorldZ;
uniform vec3 uCameraWorldPos;
uniform float uCoverMode;
uniform float uCoverTodayInstanceId;
uniform float uCoverActiveSizeBoost;

/**
 * P26.1 — packed instance attribute. vec4 (16-byte stride) for Apple Metal / ANGLE-Metal
 * alignment friendliness (defensive; not the cause of any current symptom). .w unused.
 */
attribute vec4 aHueVoteSize;

varying vec3 vColor;
varying float vFocusAlphaMult;

void main() {
  float hue = aHueVoteSize.x;
  float voteNorm = aHueVoteSize.y;
  float aSize = aHueVoteSize.z;
  float aZ = instanceMatrix[3][2];
  bool exemptNearCull =
    ((uFocusedInstanceId >= 0) && (gl_InstanceID == uFocusedInstanceId))
    || (uCoverMode > 0.5 && float(gl_InstanceID) == uCoverTodayInstanceId);
  if (!exemptNearCull && abs(uCameraWorldPos.z - aZ) < uNearCullWorldZ) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vFocusAlphaMult = 1.0;
    return;
  }
  if (uCoverMode > 0.5 && float(gl_InstanceID) != uCoverTodayInstanceId) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vFocusAlphaMult = 1.0;
    return;
  }
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
  if (uCoverMode > 0.5 && float(gl_InstanceID) == uCoverTodayInstanceId) {
    sActive *= uCoverActiveSizeBoost;
  }
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
  /**
   * P26.1 — clamp linear sRGB to [0,1] before gamma encode. OKLab hue families outside the
   * displayable sRGB gamut produce negative linear channels; pow(negative, 1/2.4) is undefined
   * in GLSL ES 3.0 and on macOS/ANGLE-Metal returns NaN that leaks through mix(), breaking
   * active star hues on Mac while Windows/D3D11 silently returns 0. Mirrors perlin.frag.glsl.
   */
  vec3 lin = clamp(oklab_to_linear_srgb(vec3(L_base, a, labB)), 0.0, 1.0);
  vColor = linear_to_srgb(lin);

  bool isFocusTarget =
    (uFocusTargetInstanceId >= 0) && (gl_InstanceID == uFocusTargetInstanceId);
  float dimBlend = clamp(uFocusActiveDimBlend, 0.0, 1.0);
  float dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, dimBlend);
  bool isHovered = (uHoveredInstanceId >= 0) && (gl_InstanceID == uHoveredInstanceId);
  bool hoverAlphaBoost = (uSelectionMode == 2) && isHovered && !isFocusTarget;
  float hoverShown = max(dimAlpha, clamp(uFocusHoveredActiveAlpha, 0.0, 1.0));
  vFocusAlphaMult = isFocusTarget ? 1.0 : (hoverAlphaBoost ? hoverShown : dimAlpha);
}
