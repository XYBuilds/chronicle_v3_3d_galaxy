// Shared OKLab → sRGB helpers (P8.1 / P8.4). Included by mesh + point vertex shaders.

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

/**
 * Hunt-style chroma scaling: C drops with L to mimic perceptual desaturation
 * under low lightness. Returns C_new in same units as C_base.
 *
 * - L_actual: current sample lightness (e.g. P17.1 L_distance for idle)
 * - L_ref:    reference lightness — typically uLMax (top-rated star)
 * - C_base:   reference chroma at full lightness (e.g. uChroma)
 * - gamma:    exponent (1.0 = linear; 0.5 = gentler; 1.5+ = aggressive)
 */
float applyHuntChroma(float L_actual, float L_ref, float C_base, float gamma) {
  float t = clamp(L_actual / max(L_ref, 1e-4), 0.0, 1.0);
  return C_base * pow(t, gamma);
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
