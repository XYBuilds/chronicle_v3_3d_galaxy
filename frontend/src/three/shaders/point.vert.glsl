uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uZCurrent;
uniform float uZVisWindow;
uniform float uFocusSizeMul;
uniform float uBgSizeMul;
uniform float uLMin;
uniform float uLMax;
uniform float uChroma;

attribute float size;
attribute float hue;
attribute float voteNorm;

varying vec3 vColor;

vec3 srgb_to_linear(vec3 rgb) {
  vec3 low = rgb / 12.92;
  vec3 high = pow((rgb + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), rgb));
}

vec3 linear_to_srgb(vec3 rgb) {
  vec3 low = rgb * 12.92;
  vec3 high = 1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), rgb));
}

vec3 oklab_to_linear_srgb(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    dot(vec3(l, m, s), vec3(+4.0767416621, -3.3077115913, +0.2309699292)),
    dot(vec3(l, m, s), vec3(-1.2684380046, +2.6097574011, -0.3413193965)),
    dot(vec3(l, m, s), vec3(-0.0041960863, -0.7034186147, +1.7076147010))
  );
}

void main() {
  float z = position.z;
  float zHi = uZCurrent + uZVisWindow;
  float inFocus = step(uZCurrent, z) * step(z, zHi);

  float L = mix(uLMin, uLMax, clamp(voteNorm, 0.0, 1.0));
  float a = uChroma * cos(hue);
  float labB = uChroma * sin(hue);
  vColor = linear_to_srgb(oklab_to_linear_srgb(vec3(L, a, labB)));

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(0.001, -mvPosition.z);
  gl_PointSize =
    size * uPixelRatio * (500.0 / dist) * uSizeScale * mix(uBgSizeMul, uFocusSizeMul, inFocus);
}
