# WebGL Works

three.js を使ったインタラクティブ作品のギャラリー。トップページ ([index.html](index.html)) から各作品ページへリンクする構成。新しい作品を追加する際は、以下の既存作品と同じフォーマットを踏襲する。

- [glass/](glass/index.html) — Glass Material（ダークテーマ）
- [soap_bubbles/](soap_bubbles/index.html) — Soap Bubbles（ライトテーマ）
- [kinetic_typography/](kinetic_typography/index.html) — Mobius Ring（ライトテーマ）
- [stream_line/](stream_line/index.html) — Stream Line（ライトテーマ）

## ページ共通フォーマット

### `<head>`
- `<meta name="robots" content="noindex, nofollow">` を必ず入れる
- Google Fonts の Poppins（preconnect + `family=Poppins:wght@...`）を読み込む
- `<title>` に作品名を設定

### 画面要素（fixed配置・共通クラス/ID）
- `.meta`（右上）: `<a class="meta" href="../index.html">COLLECTION 00X<br>YYYY</a>` — クリックでギャラリートップに戻るリンクにする（`dist/index.html` のように2階層下にある場合は `../../index.html`）。ルート絶対パス（`/index.html`）はGitHub Pagesがサブパス配信のため404になるので使わない。`text-decoration: none`、ホバーで `opacity` を下げる演出
- `.meta-left`（左下）: `WEBGL · THREE.JS<br>作品名（大文字）`
- `#fps`（右下）: `-- fps` の初期表示。500ms毎に `Math.round(frameCount * 1000 / elapsed)` で更新するJSロジックを実装する
- `#tooltip`: info-btn にマウスオーバーした時に表示するツールチップ。`position: fixed` を body 直下に置き `overflow` クリップを回避する

### パラメーターパネル（`#panel`）
- 左上 fixed 配置、`backdrop-filter: blur(14px)` の半透明カード
- 構造: `#panel > #panel-head（h3 "Parameters" + #panel-toggle-btn）+ #panel-body（.param-row, .divider, .section-label など）`
- `#panel-head` をクリックすると `#panel-body` の表示/非表示をトグルし、ボタンの表示を `−` / `+` で切り替える（[stream_line/index.html](stream_line/index.html) の実装が基準形）
- `.param-row` は `.param-label` + `.info-btn`（ツールチップ付き `i` アイコン）+ `<input type="range">` + `.param-val` の並び
- スマホ用に歯車アイコン（`#panel-toggle` ボタン、⚙）と `@media (max-width: 640px)` でのレイアウト調整を入れる場合がある

## カラーテーマ

作品の背景の明暗に合わせて、パネル・ツールチップ・ディバイダー・スライダー等の配色をライト/ダークで統一する。混在させない。

### ライトテーマ（明るい背景の作品で使用）
- 背景色: `#f0f2f5`（[stream_line](stream_line/index.html), [soap_bubbles](soap_bubbles/index.html), [kinetic_typography](kinetic_typography/index.html) で統一）
- three.js を使う場合は `scene.background` も同じ色（例: `0xf0f2f5`）に揃える。CSSの背景色だけでなく、忘れずに合わせること
- `#panel`: `background: rgba(255, 255, 255, 0.80)`, `border: 1px solid rgba(0,0,0,0.10)`, `color: rgba(0,0,0,0.55)`
- テキスト/UI色は `rgba(0, 0, 0, *)` ベース、スライダーつまみは `#000`
- `#tooltip`: 白背景 (`rgba(255,255,255,0.96)`) + 黒文字 (`rgba(0,0,0,0.78)`)

### ダークテーマ（暗い背景の作品で使用）
- [glass](glass/index.html) が基準
- `#panel`: `background: rgba(12,12,16,0.82)`, `border: 1px solid rgba(255,255,255,0.10)`, `color: rgba(255,255,255,0.55)`
- テキスト/UI色は `rgba(255,255,255, *)` ベース、スライダーつまみは `#fff`
- `#tooltip`: 黒背景 (`rgba(10,10,16,0.96)`) + 白文字 (`rgba(255,255,255,0.78)`)

## ビルド

[glass/](glass/index.html) と [soap_bubbles/](soap_bubbles/index.html) は Vite プロジェクト（`base: './'`）。トップページからは `dist/index.html` を参照しているため、ソース (`index.html` / `main.js`) を編集したら必ず `npm run build` で `dist/` を再生成する。

[kinetic_typography/](kinetic_typography/index.html) と [stream_line/](stream_line/index.html) は単一HTMLファイルで完結する静的ページ（ビルド不要、CDN経由でthree.jsを読み込み）。

## トップページへの作品追加

[index.html](index.html) の `.grid` 内にカードを追加する:
- サムネイル画像は `assets/images/0X.webp` に配置し `<img src="assets/images/0X.webp" alt="作品名">`
- `.card-num` に連番、`.card-title` に作品名
- `.card:nth-child(N)` の `animation-delay` を追加
