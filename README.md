# The Future Was Small — v0.1.4

古い映像機器の制約を創作的に再構築する、端末内完結の動画・写真加工アプリ。
外部ライブラリ不要。WebGL 1 / GLSL ES 1.00、HTML、CSS、JavaScriptで実装。
実機の電子回路・液晶・記録媒体を厳密に再現するエミュレーターではありません。

## 現在の開発・公開ルール

- 正式な開発元は `main` のルート。現行アプリは v0.1.4。過去の修正ブランチは公開対象にしない。
- 公開先: https://petandb-bot.github.io/the-future-was/
- Pages: Settings → Pages → Deploy from a branch → main → / (root)。
- 静的サイトのためビルド工程は不要。 `.nojekyll` で Jekyll 処理をスキップする。
- `version.json` は公開されたファイルのバージョン確認用。画面表示と一致させる。
- 開発中はオフラインキャッシュを無効化。録画データを保存してから再読み込みする。
- v0.2 の未マージ変更は安定化完了まで保留し、今後の統合用に保持する。

### 公開ページが旧バージョンの場合

1. Actions の pages build and deployment を確認。最新の main を対象とする実行が成功しているか確認する。
2. 実行が古いコミットのまま Queued なら、Pages の公開元を確認し、必要に応じて古い実行をキャンセルして、管理者のブラウザから main に変更をコミットする。
3. 公開後、シークレット/プライベートウィンドウで URL を開いて左上のバージョンを確認する。通常ブラウザのみ古い場合は、このサイトの Service Worker と Cache Storage を削除する。
4. 既存の公開 URL を維持する。別ブランチや別リポジトリからは公開しない。

## 起動

- ローカル確認: main の Code → Download ZIP で取得したソースを展開し、下記のローカルHTTPサーバーで起動する。分割ファイル構成のため index.html 単体を配布しない。
- ローカルHTTP: ZIPを展開し、そのフォルダで `python3 -m http.server 8000`（Windowsでは `py -m http.server 8000`）を実行し、PCのブラウザで http://localhost:8000/ を開く。Pythonが必要です。
- iPhone: ZIP内の全ファイルをGitHub PagesなどHTTPSの静的ホスティングに配置し、SafariでURLを開く。共有メニュー → ホーム画面に追加。PCのローカルHTTP IPアドレスではカメラが許可されないことがあります。App Storeアプリではありません。
- GitHub Pages: リポジトリのルートにフォルダ内のファイルを配置し、Settings → Pages → Deploy from a branch → main / (root)。公開URLをSafariで開く。

## 操作

Camera: カメラを開始。Flipで前後切替。Import: 写真・動画を読み込む。Demo: 内蔵の動く街並み。機器ボタンまたはプレビュー上の左右スワイプで機器選択。
Exposure / Contrast / Character / Memoryを調整。Advancedでディザ等に関わるCharacter、信号劣化、画素テクスチャ、内部fps、解像度、色、出力サイズ、Seedなどを調整。
SLOWSCANのみ走査周期とLiving scan / Transmissionが選択できます。初期は暗い画面から順番に更新されます。
RandomizeはSeedと機器別パラメータを更新。Save/Load presetはJSONを入出力。入力映像やフレーム時刻が異なる場合、同じSeedでも完全に同一の映像にはなりません。

Recordで開始、Stopで終了。Last takeから最後の出力を表示、DownloadまたはShare / Saveを選択。PNGも同じ結果欄から保存。最後の出力はページの再読込前に保存してください。
音声はデフォルト無音。AdvancedのAudioをOriginal / micに変更し、カメラは再起動。動画は元音声をWeb Audioで録画に接続（プレビューは無音）。ブラウザの権限や実装によって音声取得に失敗した場合は無音になることがあります。
録画はリアルタイム処理です。通常は入力動画をループ再生します。動画読み込み時に Convert whole clip を選択すると、先頭から再生して終端で自動停止します（最大120秒、オフラインのフレーム単位変換ではありません）。最大120秒、出力チャンク160MiBを目安に停止。バックグラウンド移行時は録画終了。Advanced → Recording format で Auto（MP4優先、WebMへフォールバック）、MP4 only、WebM only を選択できます。MP4を選んでも実際のコーデックはブラウザ依存です。形式は結果欄で確認できます。
出力アスペクト比は原則機器のネイティブ比を維持したまま余白を付ける方式。ただし9:16および縦長Source originalは縦長センサーによる画面充填。入力は機器の比率に中央クロップ。出力解像度は長辺の上限目安で、Nativeでは可能な限り整数倍。前面カメラは鏡像。

## エンジン

DMG-89 / CGB-98 / POCKET-98 / PXL-87 / WRIST-00 / SLOWSCAN / PAPER MEMORY / AMBER MEMORY / DISTANT SIGNAL。
低解像度FBO 2枚のping-pongとSLOWSCAN用の保持バッファ。入力は最大1280px、出力長辺最大1080px。CPUでの全画素ループなし。GLコンテキスト喪失時は復元を試行。

## ファイル

index.html: UI、style.css: レスポンシブデザイン、engine.js: WebGL・シェーダー・機器定義、compat.js: Canvas 2D互換エンジン、app.js: カメラ・入力・録画・プリセット・状態管理、manifest.webmanifest / sw.js / icon-*.png: PWA、version.json: 公開バージョン確認、.nojekyll: 静的配信設定。

## 検証状況・制約

Node.jsの構文チェック、MesaソフトウェアOpenGL ESによる3種類のGLSLプログラムのコンパイル・リンク、Chromium上での模擬GPU・模擬MediaRecorderを用いた9機種の切替、エンコーダー開始失敗からの再試行、録画中のUIロック、録画終了、PNGプレビュー、画像読み込み、短いWebMの読み込みと全体変換の自動停止テストに合格。Chromiumでは実際のWebGLコンテキストが生成できなかったため、実際の映像描画、動画エンコード、カメラ、iPhone実機、PWAインストールの動作は未確認です。
MOV/HEVC/HEICの読み込みは端末のデコーダー依存。H.264 MP4、JPEG/PNGを推奨。MP4エンコードが利用不可の場合はWebMを出力。SNSがWebMを受け付けない場合はMP4への変換が必要。連続撮影・長時間録画・発熱は実機検証後に調整してください。

## v0.1.4 — Development deployment

- Development builds no longer use offline caching. The service worker activates immediately, removes only this project's previous version caches and does not intercept requests.
- Versioned script/style URLs prevent old assets from being reused by the HTTP cache. Reload after the worker update; no automatic reload during recording.
- If the old version is still shown, verify GitHub Pages deployment and open in a fresh/private tab. Home-screen launch is supported, but offline use is intentionally disabled during development.

## v0.1.3 — Rendering compatibility

- WebGL優先。初期化失敗、GPUバッファ確保失敗、復旧失敗または8秒の復旧タイムアウト後にCanvas 2Dへ切替。録画・非同期処理が終わるまで切替を待つ。
- COMPAT / 2Dは9機種の簡易モデル、低解像度長辺最大192px、内部更新最大12fps。GPU版と同一の質感ではない。縦型、撮影、読み込み、保存は共通UIを使用（ブラウザのMediaRecorder等への対応が必要）。
- GPU diagnosticsで失敗段階・シェーダーログを表示。Retry WebGL / Reloadで再試行（最後の出力は先に保存）。
- Safari実機での動作、実際のコンテキスト復旧、録画は未検証。

## v0.1.2 — Stability & Portrait

- iPhone等の小型タッチ端末では初期480px、内部更新最大24fps、入力長辺最大720px。出力720/1080pxは選択可能。
- 縦持ち起動時は9:16を初期選択。Output aspectを撮影画面に移動。9:16および縦長Source originalではセンサーも縦長化し、余白を入れず中央クロップ。従来のNative/横長は維持。
- コンテキスト喪失時は描画停止、録画を部分保存として終了。復元イベント後も録画終了・非同期処理完了・フォアグラウンド復帰を待って再初期化。画像記憶はリセットされる。復元されない場合は最後の出力を保存後Reload app。
- 録画準備中のGPU喪失を検出、終了タイムアウト時に受領済みチャンクを保持（再生可能性は保証しない）。
- Safari実機・実GPUでのコンテキスト喪失、録画、縦持ちレイアウトの検証は未実施。

## v0.1.1 の変更

- 9エンジンの構成を維持。GLSLのvarying精度を明示。静止画・同一動画フレームの再転送を抑制。
- 録画形式の指定、開始失敗時の次候補への切替、停止イベントのタイムアウト、全体変換を追加。
- メディア読み込みのタイムアウト、カメラ切断時の復帰、画面外移行時の描画停止、iOS向けvideo要素の配置変更。
- PNGの結果プレビュー、操作ターゲットの拡大、PWAキャッシュのバージョン単位の管理。PWA更新は古いタブ・ホーム画面アプリをすべて閉じて再起動してください。

## 実機での確認順序

1. Demoで9機種の表示を確認。
2. 720px、無音、Autoで10秒録画し、結果欄で最後まで再生。
3. iPhone Safari（HTTPS）でカメラを起動し、前後切替と10秒録画。Share / Saveで保存先を選択。
4. 短いH.264 MP4をImportし、Convert whole clipで先頭から終端まで録画。
5. 必要に応じ音声あり、1080px、長時間録画を確認。MP4非対応の場合はWebM、または別のブラウザで試す。
