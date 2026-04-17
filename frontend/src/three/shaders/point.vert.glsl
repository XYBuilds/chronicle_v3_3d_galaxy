uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uZCurrent;
uniform float uZVisWindow;
/** Screen-space minimum diameter (CSS px) for window-exterior background stars (layer A). */
uniform float uBgPointSizePx;

attribute float size;
attribute vec3 color;
attribute float emissive;

varying vec3 vColor;
varying float vEmissive;
/** 1.0 = focus slab [uZCurrent, uZCurrent + uZVisWindow], 0.0 = background (layer A). */
varying float vInFocus;

void main() {
  vColor = color;
  vEmissive = emissive;

  float z = position.z;
  float zHi = uZCurrent + uZVisWindow;
  float inFocus = step(uZCurrent, z) * step(z, zHi);
  vInFocus = inFocus;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(0.001, -mvPosition.z);
  float pxFocus = size * uPixelRatio * (500.0 / dist) * uSizeScale;
  float pxBg = uBgPointSizePx * uPixelRatio * (320.0 / dist);
  gl_PointSize = mix(pxBg, pxFocus, inFocus);
}
