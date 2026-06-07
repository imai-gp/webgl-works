#define PI 3.14159265358979

varying vec3 vNormal;
varying vec3 vWorldPos;
uniform float uTime;
uniform sampler2D uBgTex;
uniform sampler2D uEnvTex;
uniform vec2 uResolution;
uniform float uRefraction;
uniform float uNoiseAmount;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(
    abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
    0.0, 1.0
  );
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float cosA   = max(dot(n, viewDir), 0.0);
  float fresnel = pow(1.0 - cosA, 5.0);

  vec2 screenUV = gl_FragCoord.xy / uResolution;

  // unseen.co 方式の屈折法線
  vec2 refractNml = n.xy * (1.0 - n.z * 1.33) * uRefraction;

  // RGB 色収差付き 8 サンプルブラー屈折
  vec3 refractCol = vec3(0.0);
  vec3 cOff = vec3(0.97, 1.0, 1.03);
  for (int i = 0; i < 8; i++) {
    float slide = float(i) / 8.0 * uNoiseAmount + rand(screenUV + float(i) * 0.01) * (uNoiseAmount * 0.1);
    refractCol.r += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.r), 0.001, 0.999)).r;
    refractCol.g += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.g), 0.001, 0.999)).g;
    refractCol.b += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.b), 0.001, 0.999)).b;
  }
  refractCol /= 8.0;

  // 環境マップ反射
  vec3 reflDir  = reflect(-viewDir, n);
  float envU    = atan(reflDir.z, reflDir.x) / (2.0 * PI) + 0.5;
  float envV    = asin(clamp(reflDir.y, -1.0, 1.0)) / PI + 0.5;
  vec3 envColor = texture2D(uEnvTex, vec2(envU, envV)).rgb;

  // 薄膜干渉（虹色）
  float thinFilm  = sin(fresnel * 6.0 + uTime * 0.35) * 0.5 + 0.5;
  float hue       = 0.55 + thinFilm * 0.30;
  vec3 iridescent = hsl2rgb(hue, 0.88, 0.60);
  vec3 irisEnv    = mix(iridescent, envColor * 1.1, 0.25);

  // 合成
  vec3 color  = mix(refractCol, irisEnv, fresnel * 0.85);
  float alpha = smoothstep(0.0, 0.06, cosA);

  gl_FragColor = vec4(color, alpha);
}
