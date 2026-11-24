# The Future Was Small — v0.2.0

古い映像機器の制約を創作的に再構築する、端末内完結の動画・写真加工アプリ。
外部ライブラリ不要。WebGL 1 / GLSL ES 1.00、HTML、CSS、JavaScriptで実装。
実機の電子回路・液晶・記録媒体を厳密に再現するエミュレーターではありません。

## 起動

- 単体HTML版: デスクトップのChrome/Edge/Safariで開く。まずDemoで動作確認。ファイル直接起動時はカメラ・保存機能にブラウザ制限がある場合があります。
- PWA版: ZIPを展開し、そのフォルダで `python3 -m http.server 8000`（Windowsでは `py -m http.server 8000`）を実行し、PCのブラウザで http://localhost:8000/ を開く。Pythonが必要です。
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
出力アスペクト比は機器のネイティブ比を維持したまま余白を付ける方式。入力は機器の比率に中央クロップ。出力解像度は長辺の上限目安で、Nativeでは可能な限り整数倍。前面カメラは鏡像。

## エンジン

DMG-89 / CGB-98 / POCKET-98 / PXL-87 / WRIST-00 / SLOWSCAN / PAPER MEMORY / AMBER MEMORY / DISTANT SIGNAL。
低解像度FBO 2枚のping-pongとSLOWSCAN用の保持バッファ。入力は最大1280px、出力長辺最大1080px。CPUでの全画素ループなし。GLコンテキスト喪失時は復元を試行。

## ファイル

index.html: UI、style.css: レスポンシブデザイン、engine.js: WebGL・シェーダー・機器定義、app.js: カメラ・入力・録画・プリセット・状態管理、manifest.webmanifest / sw.js / icon-*.png: PWA。

## v0.2.0 — Material & Sensor

- 既存9機種、UI、録画、プリセットの形式を維持。
- LCDは明暗非対称の応答と秒単位の残像。POCKET/WRISTは固定パターンと撮像特性。PXLは水平帯域・暗部ノイズ・局所欠損。
- SLOWSCANのTransmission周回境界を修正。PAPERは局所更新と残留、AMBERは色別の残光、DISTANTは固定送信スロットと欠損。
- 実機の厳密な再現ではなく、映像表現を目的としたモデルです。iPhoneでの描画・録画は未検証。

## v0.1.1 の検証状況・制約

Node.jsの構文チェック、MesaソフトウェアOpenGL ESによる3種類のGLSLプログラムのコンパイル・リンク、Chromium上での模擬GPU・模擬MediaRecorderを用いた9機種の切替、エンコーダー開始失敗からの再試行、録画中のUIロック、録画終了、PNGプレビュー、画像読み込み、短いWebMの読み込みと全体変換の自動停止テストに合格。Chromiumでは実際のWebGLコンテキストが生成できなかったため、実際の映像描画、動画エンコード、カメラ、iPhone実機、PWAインストールの動作は未確認です。
MOV/HEVC/HEICの読み込みは端末のデコーダー依存。H.264 MP4、JPEG/PNGを推奨。MP4エンコードが利用不可の場合はWebMを出力。SNSがWebMを受け付けない場合はMP4への変換が必要。連続撮影・長時間録画・発熱は実機検証後に調整してください。

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
