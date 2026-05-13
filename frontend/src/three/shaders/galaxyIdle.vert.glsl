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
uniform float uZCamDistance;
uniform float uDistanceLightnessFloor;
uniform float uChroma;
uniform float uHuntGamma;
uniform int uHuntApplyMask;
uniform int uFocusedInstanceId;
uniform float uFocusDimChroma;
uniform float uFocusDimL;
uniform int uFocusDimMode;
uniform sampler2D uSelectionMask;
uniform int uSelectionMode;
uniform int uSelectionAtlasWidth;
uniform int uSelectionAtlasHeight;
uniform vec3 uCameraWorldPos;
/** P26.3 — idle near-distance alpha (uIdleNearFadeEnabled > 0.5 enables branch). */
uniform float uIdleNearFadeEnabled;
uniform float uIdleNearFadeStartDist;
uniform float uIdleNearFadeWidth;
uniform float uIdleNearFadeMinAlpha;
/** P27 — mode 1: aZ > zHi dim; -1: aZ < uZCurrent dim; 0: off. outsideAlpha in (0,1]. */
uniform float uIdleZFadeMode;
uniform float uIdleZFadeOutsideAlpha;
/** 1 = apply P26.3 near + P27.4 Z idle fades; 0 = focus session (selecting/selected/deselecting), fades off. */
uniform float uIdleMacroFadesActive;
uniform float uCoverMode;
uniform float uCoverTodayInstanceId;
uniform float uCoverActiveSizeBoost;

/**
 * P26.1 — packed instance attribute. vec4 (16-byte stride) for Apple Metal / ANGLE-Metal
 * alignment friendliness (defensive; not the cause of any current symptom). .w unused.
 */
attribute vec4 aHueVoteSize;

varying vec3 vColor;
varying float vNearFadeAlpha;

void main() {
  float hue = aHueVoteSize.x;
  float voteNorm = aHueVoteSize.y;
  float aSize = aHueVoteSize.z;
  float aX = instanceMatrix[3][0];
  float aY = instanceMatrix[3][1];
  float aZ = instanceMatrix[3][2];
  vec3 starWorld = vec3(aX, aY, aZ);
  bool exemptIdleNearFade =
    ((uFocusedInstanceId >= 0) && (gl_InstanceID == uFocusedInstanceId))
    || (uCoverMode > 0.5 && float(gl_InstanceID) == uCoverTodayInstanceId);
  if (uCoverMode > 0.5 && float(gl_InstanceID) != uCoverTodayInstanceId) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vNearFadeAlpha = 1.0;
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
  float sIdle = (1.0 - inFocus) * uSizeScale * uBgSizeMul * aSize;
  if (uCoverMode > 0.5 && float(gl_InstanceID) == uCoverTodayInstanceId) {
    sIdle *= uCoverActiveSizeBoost;
  }
  if (isFocused) {
    sIdle = 0.0;
  }

  if (sIdle < 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vNearFadeAlpha = 1.0;
    return;
  }

  float nearFadeAlpha = 1.0;
  if (uIdleMacroFadesActive > 0.5) {
    if (uIdleNearFadeEnabled > 0.5 && !exemptIdleNearFade) {
      float distCam = distance(uCameraWorldPos, starWorld);
      float wFade = max(uIdleNearFadeWidth, 1e-6);
      float tFade = smoothstep(
        uIdleNearFadeStartDist,
        uIdleNearFadeStartDist + wFade,
        distCam
      );
      nearFadeAlpha = mix(uIdleNearFadeMinAlpha, 1.0, tFade);
    }
    if (abs(uIdleZFadeMode) > 0.5 && !exemptIdleNearFade) {
      float zA = clamp(uIdleZFadeOutsideAlpha, 0.0, 1.0);
      if (uIdleZFadeMode > 0.5 && aZ > zHi) {
        nearFadeAlpha *= zA;
      } else if (uIdleZFadeMode < -0.5 && aZ < uZCurrent) {
        nearFadeAlpha *= zA;
      }
    }
  }
  vNearFadeAlpha = nearFadeAlpha;

  vec3 scaled = position * sIdle;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float t = clamp(voteNorm, 0.0, 1.0);
  float tCompressed = t < uHighRatingT
    ? t
    : uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale;
  float tPow = pow(tCompressed, uLightnessRatingExponent);
  float L_star = mix(uLMin, uLMax, tPow);

  float d0 = max(uZCamDistance, 1e-3);
  float camPlaneZ = uZCurrent - uZCamDistance;
  float d = max(abs(aZ - camPlaneZ), 1e-3);
  float distanceMul = clamp(pow(d0 / d, 2.0 / 3.0), uDistanceLightnessFloor, 1.0);
  float L_distance = L_star * distanceMul;

  float C_base_after_hunt = (uHuntApplyMask & 1) != 0
    ? applyHuntChroma(L_distance, uLMax, uChroma, uHuntGamma)
    : uChroma;
  bool modeAllowsDim = (uFocusDimMode == 0) || (uFocusDimMode == 1);
  bool dimEligible = modeAllowsDim && (uFocusedInstanceId >= 0) && !isFocused;
  float dimMix = dimEligible ? 1.0 : 0.0;
  float L = mix(L_distance, L_distance * uFocusDimL, dimMix);
  float C = mix(C_base_after_hunt, C_base_after_hunt * uFocusDimChroma, dimMix);
  float a = C * cos(hue);
  float labB = C * sin(hue);
  /**
   * P26.1 — clamp linear sRGB to [0,1] before gamma encode. OKLab hue families outside the
   * displayable sRGB gamut produce negative linear channels; pow(negative, 1/2.4) is undefined
   * in GLSL ES 3.0 and on macOS/ANGLE-Metal returns NaN that leaks through mix(), breaking
   * idle star hues on Mac while Windows/D3D11 silently returns 0. Mirrors perlin.frag.glsl.
   */
  vec3 lin = clamp(oklab_to_linear_srgb(vec3(L, a, labB)), 0.0, 1.0);
  vColor = linear_to_srgb(lin);
}
