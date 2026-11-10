<p align="center">
  <img src="./floatpane-icon.png" width="88" alt="FloatPane" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center">透明フローティングブラウザ。見たいページをそばに置き、デスクトップを明け渡さない。</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">ダウンロード</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow">ソース</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">サイト</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane の画面プレビュー" />
</p>

多くのブラウザは画面全体を占有します。FloatPane は参考資料やダッシュボード、動画など 1 ページだけをデスクトップの端に残し、別のアプリでの作業を邪魔しません。フレームレスの透明ウィンドウで、タイトルバーはポインタが上端に触れたときだけ現れます。

## 機能

- フレームレス透明ウィンドウ、ホバーで表示されるタイトルバー
- 透明度調整：幅が広い場合はスライダー、狭い場合はステッパーへ自動切替
- 最前面表示、カーソルが外に出たときの自動透過、トレイのみモード
- ライト / ダーク / システム追従テーマ。UI と Web ページの両方に適用
- 画面キャプチャ防止。Windows ではトレイメニューも保護対象
- メニュー式タブ。再起動時に復元し、常設タブバーはなし
- アドレスバーとローカル履歴の候補、ページ内検索、ダウンロード、セッション復元
- ブックマークは Chrome / Safari / HTML から取り込み可能。パスワードは Chrome CSV から取り込み、ローカルで暗号化し、手動操作時だけ入力
- モバイル User-Agent モード、Bilibili 動画ページの自動ウェブ全画面
- データはすべて端末内。アカウント、クラウド同期、テレメトリなし

## ダウンロード

[Releases](https://github.com/Hpjxiangbabang/opabrow/releases) から Windows x64、macOS（arm64 / x64）、Linux x64 向けインストーラーを取得できます。Windows 版はインストール先を選択でき、ポータブル ZIP もあります。バイナリは未署名のため、初回起動時に OS の確認が必要な場合があります。

## ショートカット

`CmdOrCtrl` は Windows / Linux では Ctrl、macOS では ⌘ です。

| ショートカット | 操作 |
| --- | --- |
| `Ctrl/⌘+L` | アドレスバーにフォーカス |
| `Ctrl/⌘+F` · `G` · `Shift+G` | 検索 · 次へ · 前へ |
| `Ctrl/⌘+[` · `]` · `R` | 戻る · 進む · 再読み込み |
| `Ctrl/⌘+Shift+H` | ホームを開く |
| `Ctrl/⌘+D` | 現在のページをブックマーク |
| `Ctrl/⌘+Shift+Y` · `Shift+J` | 履歴 · ダウンロード |
| `Ctrl/⌘+Shift+P` | 保存済みパスワードを入力 |
| `Ctrl/⌘+T` | 最前面表示を切替 |
| `Ctrl/⌘+=` · `-` | 透明度を調整 |
| `Ctrl/⌘+K` | コマンドパネル |
| `Ctrl/⌘+Shift+Space` | ウィンドウの表示 / 非表示 |
| `Ctrl/⌘+Shift+T` · `Shift+W` | 新しいタブ · タブを閉じる |
| `Ctrl/⌘+W` | ウィンドウを閉じる |

## 開発

Node.js 22+ と pnpm 12.18.0（corepack 経由）が必要です。

```bash
pnpm install
pnpm dev
pnpm typecheck && pnpm test && pnpm build
pnpm package:win:x64
```

他プラットフォームは `package:mac:arm64`、`package:mac:x64`、`package:linux:x64` を使用します。

## 謝辞

ベースは [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow)、作者 Clayton Petrosian 氏。

## ライセンス

[MPL-2.0](LICENSE)。
