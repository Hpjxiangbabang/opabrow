<p align="center">
  <img src="./floatpane-icon.png" width="96" alt="FloatPane アイコン" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center"><strong>透明フローティングブラウザ。見たいページをそばに置き、デスクトップを明け渡さない。</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <strong>日本語</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MPL--2.0-3B82F6?style=flat-square" alt="MPL-2.0" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111827?style=flat-square" alt="対応プラットフォーム" />
  <img src="https://img.shields.io/badge/runtime-Electron%2043-47848F?style=flat-square&logo=electron" alt="Electron 43" />
  <img src="https://img.shields.io/badge/version-1.1.6-2EA44F?style=flat-square" alt="v1.1.6" />
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow">ソース</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">リリース</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">ランディングページ</a> ·
  <a href="CHANGELOG.md">変更履歴</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane の画面プレビュー" />
</p>

> FloatPane はオープンソースの派生版です。[ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow) → フォーク [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) → そのフォーク上でのソースレベル改修とリブランド、という経緯を持ちます。詳細は[謝辞と由来](#謝辞と由来)を参照してください。

## FloatPane とは

多くのブラウザは作業領域全体を占有します。FloatPane は「1 ページ」だけを画面の端に常駐させます。参考資料、ダッシュボード、プレイリスト、動画ページを眺めながら、別のアプリケーションで作業を続けられます。フレームレスの透明ウィンドウはタイトルバーを既定で隠し、ポインタが上端に触れたときだけ表示します。タイトルバーは独立した 32px の領域を持つため、コントロールが表示されてもページを覆ったりレイアウトをずらしたりしません。

| | |
| --- | --- |
| **浮かせて使う設計** | フレームレス透明ウィンドウ、ホバーで現れるコントロール、透明度調整、任意の最前面表示とトレイのみモード |
| **ローカル優先** | 履歴・ブックマーク・パスワード・タブ・設定はすべてこの端末内。アカウント、テレメトリ、クラウド同期はありません |
| **プライバシー制御** | ライト / ダーク / システム追従の明示的なテーマ、任意の画面キャプチャ防止、単一のデータディレクトリ |

現在のバージョンは **v1.1.5**（2026-11-10）。開発と実機検証は **Windows x64** に集中しており、macOS と Linux にはビルドターゲットがありますが、同程度の検証は行えていません。

## 主な機能

### ウィンドウと外観

- **透明オーバーレイ**：フレームレスウィンドウ、ホバーで表示される 32px のタイトルバー。webview は常にその下から始まります。
- **透明度コントロール**：幅が十分な場合はスライダー、幅 760px 以下では「丸角三角ステッパー＋パーセント表示」へ自動切替。矢印は `currentColor` を使うインライン SVG で、外部画像なしにテーマへ追従します。
- **最前面表示**：既定では完全に操作可能です。任意で「カーソルがウィンドウ外に出たら自動透過」を有効にすると、ウィンドウ内では通常どおり操作でき、外ではクリックとスクロールが背面のアプリへ渡ります（メインプロセスによるカーソル位置ポーリング、約 40ms）。
- **トレイのみモード**：タスクバーから隠し、最小化と閉じるを「隠す」に変更。トレイアイコンまたはメニューから復帰し、トレイメニューの「終了」が本当の終了です。
- **明示的なテーマ**：ライト / ダーク / システム追従、**既定はライト**。UI は CSS 変数、Web コンテンツは CDP `Emulation.setEmulatedMedia` 経由で切り替え、選択は保持されます。

### ブラウジング

- コンパクトなアドレスバー（ローカル履歴から最大 5 件の候補、ドラッグで幅調整）、戻る / 進む / 再読み込み / ホーム、任意のページのホーム設定。
- **メニュー式タブ**：常設のタブバーは設けず、「タブ」メニューに開いているタブ一覧（切替可）と新規 / 閉じるを配置。再起動時に復元します（上限 20）。
- ページ内検索、コマンドパネル、モバイル User-Agent モード、右クリックメニュー、ダウンロード進捗、セッション復元（最後のページ、位置とサイズ、透明度、最前面表示、モバイルモード）。
- ローカル履歴（100 件）、Chrome / Safari / HTML からのブックマーク取り込み、Bilibili 動画ページの自動ウェブ全画面（無効化可）。
- 更新チェックはデータディレクトリの `update-source.json` を読みます。再ビルドなしで GitHub / GitLab の更新元を切り替えられ、既定は本フォークを指します。

### 画面キャプチャ防止

「表示」/ トレイメニューのスイッチで `BrowserWindow.setContentProtection` を有効化します（Windows は `WDA_EXCLUDEFROMCAPTURE`、macOS は `NSWindowSharingNone`）。v1.1.4 以降、Windows で防止が有効なときはネイティブのトレイメニューを外し、アプリ自身が所有し同様に保護された `BrowserWindow` でメニューを描画します（`src/main/protectedTrayMenu.ts`）。これによりメニュー自体もキャプチャ除外の対象になります。v1.1.3 の「メニューデータのマスキング」方式は取り消されました。macOS はネイティブメニューのままです。

### データの扱い

- `src/main/dataPaths.ts` が `userData`、セッションデータ、キャッシュ、一時ファイル、クラッシュダンプ、ログを単一ディレクトリへ集約します。既定は `<appData>/FloatPane-data/`、環境変数 `FLOATPANE_DATA_DIR` で上書き可能です。v1.1.2 以降はインストール先に依存しないため、アップグレードで設定が失われません。旧ポータブル構成のデータは一度だけ移行されます。
- 「表示」/ トレイ → **データ管理** から、ディレクトリを開く、キャッシュと Cookie を削除、を実行できます。Windows のアンインストーラは `.floatpane-data` マーカーを確認した場合だけディレクトリを削除し、ユーザーが明示指定したディレクトリには触れません。
- パスワードは Electron `safeStorage` 経由で OS のキーストアにより暗号化されます。取り込みは利用者が自ら選んだ Chrome 書き出し CSV に限られ、入力も一致する HTTPS オリジンで**手動で指示したときだけ**です。自動入力もアップロードも行いません。
- ダウンロードファイルは OS の Downloads フォルダーに残り、アンインストールでも削除されません。

## キーボードショートカット

ショートカットは `CmdOrCtrl` を使用します。Windows / Linux は **Ctrl**、macOS は **⌘** です。

| ショートカット | 操作 |
| --- | --- |
| `Ctrl/⌘+L` | アドレスバーにフォーカス |
| `Ctrl/⌘+F` · `Ctrl/⌘+G` · `Ctrl/⌘+Shift+G` | ページ内検索 · 次へ · 前へ |
| `Ctrl/⌘+[` · `Ctrl/⌘+]` · `Ctrl/⌘+R` | 戻る · 進む · 再読み込み |
| `Ctrl/⌘+Shift+H` | ホームを開く |
| `Ctrl/⌘+D` | 現在のページをブックマークに追加 / 削除 |
| `Ctrl/⌘+Shift+Y` · `Ctrl/⌘+Shift+J` | 履歴を表示 · ダウンロードを表示 |
| `Ctrl/⌘+Shift+P` | 保存済みパスワードで現在のページを入力 |
| `Ctrl/⌘+T` · `Ctrl/⌘+=` · `Ctrl/⌘+-` | 最前面表示の切替 · 透明度を上げる / 下げる |
| `Ctrl/⌘+K` · `Ctrl/⌘+Shift+Space` | コマンドパネル · ウィンドウの表示 / 非表示 |
| `Ctrl/⌘+Shift+T` · `Ctrl/⌘+Shift+W` | 新しいタブ · 現在のタブを閉じる |
| `Ctrl/⌘+W` | ウィンドウを閉じる（トレイのみモードでは隠す） |

## 入手とインストール

インストーラーは [GitHub Releases](https://github.com/Hpjxiangbabang/opabrow/releases) で配布します。公開には意図的にゲートを設けており、release ワークフローは検証済みタグを指定した手動 `workflow_dispatch` でしか動きません。**タグを push しても Release は作られません**。該当バージョンの成果物がない場合は、後述の手順でソースからビルドしてください。すべてのバイナリは本リポジトリの対応タグでソースを取得できます（MPL-2.0 §3.2(a)）。

| プラットフォーム | 成果物 | 備考 |
| --- | --- | --- |
| Windows x64 | `FloatPane-Setup-<version>-x64.exe`（NSIS） | 複数ステップのウィザードでインストール先を選択可能。一部バージョンではレジストリを書かないポータブル ZIP も提供 |
| macOS arm64 / x64 | `.dmg` | 未署名・未公証。初回起動時に Gatekeeper の手動許可が必要 |
| Linux x64 | `.AppImage` | 任意の場所に配置可能、インストーラー不要 |

**すべてのバイナリは未署名です。** Windows の SmartScreen / スマート アプリ制御、macOS の Gatekeeper が警告またはブロックする場合があります。インストーラー由来の切り分けにはポータブル ZIP を利用できます。警告を根本的に解消するには有効な Authenticode 証明書または Developer ID が必要です。インストーラーが対象とするのは Windows x64 のみで、ARM64 Windows は含みません。

## ソースからビルドする

必要環境：Node.js 22 以降、pnpm 12.18.0（`packageManager` で固定、corepack 経由で有効化）、Electron 43。

```bash
git clone https://github.com/Hpjxiangbabang/opabrow.git
cd opabrow
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

```bash
pnpm typecheck                 # メインプロセス + レンダラーの TypeScript 検査
pnpm test                     # Vitest：4 モジュール / 18 ケース
pnpm build                    # out/main, out/preload, out/renderer を出力
pnpm package:win:x64          # または package:mac:arm64 / package:mac:x64 / package:linux:x64
```

構成：Electron 43 + React 19 + TypeScript 5 + electron-vite 5 / Vite 7 + electron-builder 26 + Vitest 4 + pnpm。メインプロセスがウィンドウ、メニュー、トレイ、IPC、ローカル保存を担い、preload が `contextBridge` で `window.opabrow` を公開し、レンダラーがタイトルバーとアドレスバーを担当します。実行時依存は `csv-parse`、`lucide-react`、`parse5` の 3 つのみ。サーバー、アカウント体系、ライセンス検証、テレメトリはありません。

## 既知の制限

- **キャプチャ防止はベストエフォートです。** 対応プラットフォームではソフトウェアによるスクリーンショット / 録画 / 画面共有からウィンドウを除外できますが、物理的なカメラ撮影、キャプチャカード、高権限のツールは防げません。Linux の対応は限定的です。トレイアイコンは OS シェルが描画するため保護対象外です。Windows の自作メニューはネイティブの外観・キーボードナビゲーション・アクセシビリティを失い、GUI での手動検証も必要です。
- **プラグイン機構はありません。** 拡張 API、SDK、設定駆動の拡張ポイントは存在せず、カスタマイズにはソース改修と再ビルドが必要です。`src/main/index.ts` と `src/renderer/src/App.tsx` は巨大な単一ファイルで、上流の変更を取り込むコストが高くなっています。
- **バイナリは未署名**です（「入手とインストール」を参照）。
- **自動テストの範囲は限定的です。** 単体テストは 4 つのロジックモジュール（18 ケース）のみで、UI やメインプロセスの E2E テストはありません。メニューとインストーラーの挙動は [TESTING.md](TESTING.md) に記録があり、手動検証が必要です。NSIS のマルチユーザーインストール問題（T-15）は原因を特定済みで、**修正せず既知問題として残す決定**です。インストールモードを切り替えると選択済みのパスが引き継がれず、「戻る」でウィザードが終了する場合があります。インストール構成は v1.1.5 のままです。
- **検出回避は対象外です。** サードパーティ製会議ソフトの検出をすり抜ける機能は、明示的に開発を停止しています。
- 検証は Windows 中心です。macOS / Linux 向け成果物はビルド設定上存在しますが、同等の実機検証は行っていません。

## プロジェクト文書

| ファイル | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 上流ベースラインから v1.1.5 までの変更履歴 |
| [TESTING.md](TESTING.md) | 実機テストの指摘、調査、受け入れ手順、既知問題 |
| [TODO.md](TODO.md) | 今後の課題 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Pull Request を送る前の確認事項 |
| [SECURITY.md](SECURITY.md) | 脆弱性の非公開報告手順 |
| [NOTICE.md](NOTICE.md) | 上流の帰属表示と改修一覧 |
| [LICENSE](LICENSE) | MPL-2.0 全文 |
| [site/](site/) | 日 / 英 / 中の三言語ランディングページ |

## 謝辞と由来

FloatPane は**独自のコードベースではありません**。ソースレベルの派生版であり、フォークの経緯は次のとおりです。

| 段階 | リポジトリ | 詳細 |
| --- | --- | --- |
| **上流プロジェクト** | [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow)（Clayton Petrosian 氏） | MPL-2.0 で公開。ベースラインはコミット `4bab39e`（上流 v1.0.0）。 |
| **本フォーク** | [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) | メンテナーが 2026-11-06 に上流から fork した、変更ゼロのスナップショット。GitHub 上の fork 関係を維持しているため、リポジトリ URL には今も `opabrow` が残っています。 |
| **本製品** | **FloatPane**（本リポジトリ `main` ブランチ） | v1.1.0 以降、このフォーク上でソースレベルの改修を実施。名称、`appId`（`com.floatpane.app`）、アイコン、画作は独自のものに置き換えています。 |

**改名の理由**：MPL-2.0 §2.3 は貢献者の商標、サービスマーク、ロゴの権利を付与しません。そのため派生版は上流のブランドを引き継がず、独自の名称と美術資源を使用しています。

**本フォークで追加した内容**（2026-11-06 以降、v1.1.0 → v1.1.5）：リブランドと上流ハードコードリンクの整理、pnpm バージョン固定、NSIS のインストール先選択、明示的テーマ、画面キャプチャ防止（Windows の保護付き自作トレイメニューを含む）、統一されアップグレードに強いデータディレクトリ、トレイのみモード、本格的なマルチタブ、設定保存の修正、レスポンシブな透明度コントロール、手動リリースゲート。バージョンごとの一覧は [CHANGELOG.md](CHANGELOG.md) と [NOTICE.md](NOTICE.md) にあります。

**ライセンス順守**：[LICENSE](LICENSE) 全文と上流の著作権表示を保持し、改修した MPL 対象ファイルは MPL-2.0 のままです（§3.1）。表示の削除も行っていません（§3.4）。配布する各バイナリのソースは、本リポジトリの対応タグから取得できます（§3.2(a)）。改修前のオリジナルソースは上流リポジトリに残っています。

**謝辞**：opabrow を MPL-2.0 で公開してくださった Clayton Petrosian 氏と上流の貢献者の皆様に感謝します。この派生版はその公開なくして存在しません。あわせて Electron、React、TypeScript、Vite、electron-vite、electron-builder、Vitest、pnpm、`csv-parse`、`lucide-react`、`parse5` のメンテナーの皆様にも感謝します。

## ライセンス

[Mozilla Public License 2.0](LICENSE) のもとで公開しています。上流の帰属表示と改修一覧は [NOTICE.md](NOTICE.md) を参照してください。FloatPane の名称とアイコンは上流プロジェクトのブランドから独立しています。
