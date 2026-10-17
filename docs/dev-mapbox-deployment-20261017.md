# 開発用WebのMapbox設定（2026-10-17）

開発用Pages `https://heinekogit.github.io/cycling-book-web-dev/` の道路に沿うルート計算・住所検索を検証するため、Mapboxで `Cycling Book Web development` という公開トークンを作成した。公開・秘密スコープはすべてOFF。許可URLは `https://heinekogit.github.io`。トークン値はこのリポジトリや開発用PagesリポジトリのGit履歴には含めていない。

本番用と開発用のGitHub Pagesは同じホスト名にある。ブラウザの通常のReferrer-PolicyではMapboxへのクロスオリジン要求にパス名が送られないため、MapboxのURL制限を開発用リポジトリのパスだけに確実に限定できない。許可範囲は同ホストの全Pagesである。専用ドメインを用意すればホスト名で分離できる。

開発用リポジトリ `heinekogit/cycling-book-web-dev` のRepository Actions secret `VITE_MAPBOX_TOKEN` に登録し、PagesをGitHub Actions公開へ変更した。コミット `14e2628` の静的ビルドにはトークンのプレースホルダーのみ含み、ワークフローが公開アーティファクトを作る際にsecretから差し込む。ブラウザ用の公開トークンなので配信後のJSからは取得可能だが、URL制限と最小スコープで利用を制約する。開発用Supabaseの接続先は `cyutxspjthlodvgchnst` のみで、本番用は含めない。

アプリの地図タイルはOpenStreetMapを使用する。Mapboxトークンが必要なのは `src/features/routes/routing.ts` のDirections APIと `src/features/maps/geocoding.ts` のGeocoding API。トークンなしでも地図表示と直線を使った描画は可能で、道路へのスナップと住所検索はできない。

GitHub Actionsの実行 `39042002504` は成功した。配信中のHTMLとJSを確認し、開発用Supabaseの参照があり、本番用Supabaseの参照はなく、トークンのプレースホルダーも残っていないことを確認した。許可URLをRefererに指定したMapbox Directions（cycling）とGeocodingの応答はいずれもHTTP 200だった。

2026-10-17、ユーザーが開発用Web版にログインして、案内したルート描画、道路に沿うルート計算、住所検索、保存、開き直しての編集を試し、問題は見られなかったと報告した。これはユーザーによるブラウザ操作の結果であり、個々の操作ログや保存データの再照合は行っていない。API経由の開発用DBへのルート保存と本番DBからの分離は `docs/web-environment-isolation-test-20261017.md` で確認済み。
