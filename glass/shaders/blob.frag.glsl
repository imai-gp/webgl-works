uniform sampler2D backgroundTex;
uniform vec2 uResolution;
uniform float uAberration;
uniform vec3 cameraPosition;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec2 screenUV = gl_FragCoord.xy / uResolution;

  vec3 n = normalize(vNormal);

  // 法線ベースの屈折オフセット（強めに）
  vec2 offset = n.xy * 0.14;

  vec2 uv = screenUV + offset;

  // 色収差：R/G/B を微妙にずらしてサンプル
  float r = texture2D(backgroundTex, uv + n.xy * uAberration * 1.5).r;
  float g = texture2D(backgroundTex, uv + n.xy * uAberration * 0.5).g;
  float b = texture2D(backgroundTex, uv - n.xy * uAberration).b;

  // フレネル（エッジを明るく）
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

  vec3 color = vec3(r, g, b);

  // エッジのホワイトハイライト
  color += fresnel * 0.7;

  // わずかな青み・シアン感でガラスらしく
  color.b += 0.06;
  color.g += 0.015;

  // 内部の薄いスモーク感（暗すぎない程度）
  color = mix(color, vec3(0.04, 0.04, 0.06), 0.08);

  float alpha = 0.82 + fresnel * 0.18;

  gl_FragColor = vec4(color, alpha);
}
