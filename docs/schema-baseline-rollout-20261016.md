# 初期スキーマ・マイグレーション整備（2026-10-16）

> **2026-10-17時点の結論:** 初期スキーマの開発用DB再現、既存DBとの構造・権限照合、Supabase CLI履歴の基点登録まで完了。以下の前半は作成時点の計画を残したもの。現在の正本と次の変更手順は `docs/db-migration-workflow-20261017.md` を参照。

## 作成したもの

`2026-10-15` の現行DBスキーマダンプ（`docs/current-schema-capture-20261015.md`）から、新しい**空のSupabaseプロジェクト専用**のベースライン候補を `supabase/baseline/` に作成した。現行DBへSQLを適用していない。

1. `001_public_schema.sql` — アプリの `public` スキーマの現行スナップショット。16テーブル、19関数、2 enum、2シーケンス、6トリガー、47 RLSポリシー、現行GRANTを含む。Supabase管理ロールのデフォルト権限6ブロックは、新環境が管理する設定として除外した。
2. `002_auth_storage_policies.sql` — `auth.users` のアプリ登録トリガー1件と、`storage.objects` のアプリ・旧ポリシー10件。
3. `003_initial_data.sql` — `free` / `group` / `pro` のプラン3件と、非公開 `route-photos` バケット。現行DBから読んだ静的設定のみで、ユーザー・記録・写真は含めない。

`001` と `002` は、取得済みダンプを `pg_restore` で選択抽出して作成した。オブジェクト数をダンプのTOCと照合し、メールアドレス・接続先・キーの埋め込みがないことを確認した。`003` のプランとバケット設定は現行DBを読み取り専用で照合した。開発用DBへの適用結果は末尾に記録した。

## 履歴の扱い

作成時点の `supabase/migrations/` には、積み上げた16本のSQLがあった。現在は `supabase/archive/pre_baseline_20261017/` へ退避済み。これらは現行DBにあった初期9テーブルなどを作成しないため、空のDBに順番どおり流しても再現できない。一方、ベースライン候補は16本の変更後の**現行状態**を含む。したがって、ベースラインの後に16本を再実行してはならない。

当初はベースラインを `supabase/baseline/` に隔離した。その後、両DBの実状態を照合して `supabase/migrations/20261017000000_baseline.sql` を正本とし、旧16本をアーカイブした。既存DBにはベースラインを再適用せず、CLI履歴だけを適用済みに補正した。詳細は `docs/db-migration-workflow-20261017.md`。

## 当初の検証項目

1. 新規SupabaseプロジェクトのPostgreSQL/Auth/Storageのバージョンと既存管理オブジェクトを確認し、`001` → `002` → `003` の順に、エラー時に停止するトランザクションで適用する。管理スキーマ全体のダンプは適用しない。
2. テーブル、関数、トリガー、RLS・Storageポリシー、GRANTを現行スナップショットと比較する。Supabase管理側の差分はアプリ独自定義と分ける。
3. 認証メール・Redirect URLs・SMTPなどDBダンプに含まれない設定を記録・再現する。新規登録で個人アカウント、owner所属、free契約が生成されることを確認する。
4. 匿名・利用者A・利用者Bで `supabase/tests/two_user_rls.sql` 相当の境界試験を行い、Storage APIで写真の表示・登録・削除を確かめる。
5. 復元試験、データ・写真の移行方針、現行DBの履歴基点の扱いが決まってから、通常のマイグレーション運用に切り替える。

その後、開発用DBへの再現、Auth・Storage API実測、既存DBとの構造・権限照合、履歴基点の登録まで完了した。「初期スキーマ・マイグレーションの整備」は**完了**。バックアップからの復旧試験は別項目で継続する。

## 開発用プロジェクト（2026-10-17）

検証用に `cycling-book-dev` を DotBlot Works の Free 組織に作成した。プロジェクト参照IDは `cyutxspjthlodvgchnst`、リージョンは `ap-northeast-1`（東京）。Dashboard上で `Healthy`、`No migrations` と表示された。既存の本番扱いプロジェクト `cqiqhczxuiyakptdjowr` とは別IDである。作成時に Data API は有効、「Automatically expose new tables」は無効、automatic RLS は無効とした。適用前にはアプリの独自テーブルはなかった。接続パスワードやAPIキーはこの文書に記録しない。


## 開発用DBへの適用とSQL検証（2026-10-17）

適用前に接続先が `postgres.cyutxspjthlodvgchnst`、PostgreSQL 17.11、`public` のアプリテーブルが0件であることを確認した。`001` → `002` → `003` を `psql -X -v ON_ERROR_STOP=1 --single-transaction` で**開発用DBに一度だけ**適用し、終了コード0を確認した。本番扱いプロジェクトには適用していない。ローカルの実行ログはGit対象外の `backups/20261017-dev-baseline/apply.log` に保存した。適用済みSQLを再実行しないこと。

適用後の読み取り専用照合結果は `public` 16テーブル・19関数・RLS有効16テーブル・47ポリシー、`storage.objects` 10ポリシー、`auth.users` 登録トリガー1件、プラン3件、写真バケット1件。`anon` に `accounts` のSELECT、`routes` のINSERT、`has_account_role` のEXECUTEがないこと、`authenticated` に `account_memberships` のSELECTと `has_account_role` のEXECUTEがあり同テーブルのINSERTはないことも確認した。

仮のAuthユーザー2件を一つのトランザクションで挿入し、登録トリガーがそれぞれ個人アカウント、active/owner所属、free契約を作ることを検証した。続けて `supabase/tests/two_user_rls.sql` のユーザー間・匿名・Storage行アクセス境界試験を実行し、終了コード0と末尾の `ROLLBACK` を確認した。試験後、Authユーザー、アプリアカウント、所属、契約、ルート、走行、Storageオブジェクトが全て0件であることを読み取り専用で確認した。試験ログと生成SQLはGit対象外の `backups/20261017-dev-baseline/` に保存した。

これはDB上のSQL権限試験であり、Authメール送信・リダイレクト設定、HTTP経由のStorage操作、Web/iOS接続、完全なスキーマ差分比較までは確認していない。これらを次段階で検証する。


## Auth・API・ローカル接続の確認（2026-10-17）

開発用Dashboardで新規登録許可と `Confirm email` がON、Emailプロバイダが有効、カスタムSMTPが無効（標準テンプレートと組み込み送信）であることを確認した。Site URLの初期値 `http://localhost:3000` を `http://localhost:5173/` に変更し、Redirect URLsに `http://localhost:5173/auth/callback` と `http://localhost:5173/reset-password` を追加した。開発用プロジェクトだけの設定変更である。別マシンでは `localhost` はその別マシン自身を指すため、確認リンクの実測には開発用Mac上のブラウザか別の開発用公開URLが必要。

旧 `.env.local` が本番扱いプロジェクトを指していたため、Git対象外の `.env.development.local`（開発用URL・publishable key）と `.env.production.local`（旧設定）へ分け、共通ファイルを削除した。`.gitignore` に `.env.*.local` を追加。開発モードのビルドには開発用URLだけ、本番モードのビルドには旧URLだけが埋め込まれることを確認した。`npm run build` と `npm run lint` は成功。GitHub ActionsのRepository secretsは変更していない。

開発用APIの実測: Auth healthは公開キーでHTTP 200。匿名の `routes` と `route_markers` はHTTP 200・空配列、Storageオブジェクト一覧もHTTP 200・空配列。`plans` は匿名SELECT権限がないためHTTP 401（DB側で確認した権限と一致）。プライベートバケットのメタデータ単独取得は匿名でHTTP 400/404。

`tomokawa.cr+cb-dev-auth@gmail.com` で開発用Authの新規登録APIを実行し、HTTP 200、セッション未発行を確認した。実DB上にはAuthユーザー、`public.users`、active/owner所属、free契約が各1件生成された。受信・メール確認・ログイン・再設定、およびHTTP経由の写真登録・削除は未検証。テスト用パスワードはGit対象外の `.backup-secrets/dev-auth-test-password` に保存し、文書やログには記録しない。


## 別マシン用のテストURL準備（2026-10-17）

開発用ビルド専用の公開GitHubリポジトリ `heinekogit/cycling-book-web-dev` を作成した。GitHub Pagesをmainブランチのrootから有効化した。開発用Supabase URL・publishable keyで `/cycling-book-web-dev/` 用の静的サイトをビルドした。公開前の確認でMapboxトークンを含む初回ビルドのpushは自動承認審査により拒否された。そこでMapboxトークンを除いた認証検証用ビルドを `backups/20261017-dev-pages-safe/` に作成した。新しいビルドには開発用Supabase URLがあり、既存本番URL・Mapboxトークン・実際のsecret API key形式の値はない。ユーザーの明示承認後、コミット `28110f9` をpushした。Pagesワークフローは成功し、`https://heinekogit.github.io/cycling-book-web-dev/` の画面表示を確認した。地図API機能はこのビルドでは動作しない。


開発用SupabaseのSite URLを公開テストURLへ変更し、`/auth/callback` と `/reset-password` をRedirect URLsへ追加した。ローカル用の2 URLは残した。両方の深いURLがGitHub PagesのSPA fallbackでWebアプリを表示することを、トークンなしの状態で確認した（無効リンク表示は想定どおり）。新しい公開URLを指定して確認メールを再送し、Auth APIが受け付けた。受信箱側のリンク操作・DBの確認済み状態は検証待ち。


ユーザーが別マシンで最新の確認メールを開き、開発用Pagesのマイページ表示を確認した。管理接続の読み取り専用照合で `email_confirmed_at` 設定済み・アプリユーザー1件を確認。保存したテストパスワードを用いるAuth APIログインも成功した。

同じテストユーザーで一時的な非公開ルートと1px PNGを作り、Storage API経由の写真upload、署名URL取得・HTTP 200閲覧、remove、空一覧を確認した。試験のルートと写真は削除し、DB上の該当行が0件であることを確認した。テストユーザー1件は後続の認証試験用に残す。パスワード再設定メールの送信を試したが、Auth APIは429 `email rate limit exceeded` を返したため再送せず、メール経由の再設定試験は保留。
