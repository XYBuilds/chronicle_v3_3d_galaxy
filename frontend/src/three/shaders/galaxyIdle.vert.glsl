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

attribute float hue;
attribute float voteNorm;
attribute float aSize;

varying vec3 vColor;

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
  float sIdle = (1.0 - inFocus) * uSizeScale * uBgSizeMul * aSize;
  if (isFocused) {
    sIdle = 0.0;
  }

  if (sIdle < 1e-6) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

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
  vColor = linear_to_srgb(oklab_to_linear_srgb(vec3(L, a, labB)));
}
