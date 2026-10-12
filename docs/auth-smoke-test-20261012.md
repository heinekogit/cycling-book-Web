# メール認証スモークテスト（2026-10-12）

対象: 既存の Supabase `cycling-book` プロジェクト。公開用の別環境はまだない。

| 項目 | 結果 |
| --- | --- |
| 新規登録 API | 受理され、即時にセッションを返した |
| メール確認 | 未検証。`Confirm email` が OFF、Auth API の `mailer_autoconfirm=true` |
| テストアカウントでログイン | 成功。メールは自動確認済み扱い |
| 本人の `public.users` 行の読み取り | 0 行。一般ユーザー用 RLS は未整備 |
| 再設定メールの送信 | API は2回とも受理 |
| 1通目のメールリンク | 旧Site URLの `https://heinekogit.github.io/cy2/` に転送された |
| 2通目のメールリンク | `localhost` に転送されたが、別マシンで開いたため接続できず。パスワード更新は未検証 |

原因として、当初のRedirect URLsには旧サイトの2件しかなかった。`http://localhost:5173/auth/callback` と `http://localhost:5173/reset-password` を追加し、Dashboardで計4件になったことを確認した。Site URLは引き続き旧サイトを指す。再設定メールのテンプレートは標準の `{{ .ConfirmationURL }}` を使っている。組み込みメール送信サービスを使用中。

テスト用パスワードはGit対象外の `.backup-secrets/auth-test-20261012.json` に保存し、チャットや文書には記載していない。実DBにテストアカウントが1件作成されている。SQLは実行していない。

その後 `Confirm email` をONに保存した。追加登録用の別名アドレスは、別マシンから `localhost` に接続できなかったため未送信。開発用Macの `192.168.3.37:5174` で一時的なLAN用Viteを起動し、同ホストのcallback/reset-passwordをRedirect URLsに追加した。Mac自身からはHTTP 200だが、別マシンからは接続エラー。MacのファイアウォールはOFFで、Viteは同IP・ポートでLISTEN中。別マシン側のサブネット・ネットワーク分離を確認中。

外部の別マシンから試すため、2026-10-12にビルド済みプレビューを127.0.0.1:4173で起動し、指定メールのワンタイム認証で保護したCloudflare Quick Tunnelを作成。外部からのHTTPリクエストは認証画面へ転送されたが、Cloudflareが認証状態のCookieを受け取れず「Bad request」になった。ユーザーの希望によりトンネルとプレビューは停止した。認証メールの転送先として登録した一時ホスト名のcallback/reset-passwordは後で削除する。

GitHub Pagesの自動公開を再開し、コミット `61852fd` を `main` にpushした。GitHub Actionsの公開処理 `38226523752` は成功、`https://heinekogit.github.io/cycling-book-Web/` はHTTP 200。`/signup` はSPA用の `404.html` を返し、HTMLには公開版のアセットパスがある。公開版のcallback/reset-passwordのRedirect URLsはユーザーに登録を依頼済み。実機での登録・確認・再設定は未検証。

Supabaseから一時的なLAN・トンネルのRedirect URLsを削除する。開発者限定RLSを一時的に緩める場合は、テストユーザーだけを対象にして、変更前後の行・ポリシーを確認した上で別途ロールバックする。

残作業: 別のテスト用アドレスで登録・確認・ログインを検証する。再設定メールで新しいパスワード画面に到達し、更新後のログインを確認する。公開前に一般ユーザー用RLSとSMTPを整備する。

## 退会を含む再登録テスト

2026-10-12に `202610120001_delete_empty_personal_account.sql` を新規適用した。既存関数がないことを読み取り確認し、ロールバック付きトランザクションでコンパイルしてから一度だけ適用した。適用後、Supabaseの既定設定で匿名ロールに付いた実行権限を別SQLで取り消した。最終権限は匿名不可・ログイン済み可、Authユーザー数は適用前後で5件のまま。Web画面とSQL定義はコミット `9fb7ba5` にあり、GitHub Pagesの公開処理は成功した。

対象は記録・写真のない新規個人アカウント。画面でパスワードを再確認し、DB関数で個人アカウントとAuthユーザーを同じトランザクション内で削除する。既存の記録やStorage所有物、他アカウントへの所属がある場合は削除せずにエラーにする。データを持つ一般利用者向けの完全な退会機能は別途必要。

次の実測は `tomokawa.cr+cb-auth-test@gmail.com` を使う予定。このアドレスは適用時点で未登録。登録→確認メール→ログイン→退会→同じメールで再登録できるか確認する。既存の `tomokawa.cr@gmail.com` はこのテストでは削除しない。

テスト用別名アドレスでの登録・確認メールのリンクは成功し、Authでは確認済み、`public.users`・`public.accounts` は各1件、ルート・実走は0件。マイページは開発者限定RLSのためエラー表示だった。本人のアカウントだけ一時的に `public.app_developers` に1件追加し、追加後の行数を確認した。退会に成功すると `auth.users` への外部キーのCASCADEでこの許可行も消える。再読み込み後の画面表示、退会、同一メールでの再登録は未検証。

ユーザーが退会を実行し、ログイン不可を確認した。DB照合ではテスト用アドレスの `auth.users`、対応する個人アカウント、サブスクリプション、一時許可はいずれも0件。直近1日以内に作られた孤立 `public.users` は0件。既存の孤立 `public.users` は2件あるが今回のテストとは別の古い行。同じメールアドレスでの再登録と再確認メールは次の実測待ち。

同じテスト用メールアドレスで再登録し、メールリンクからマイページへ遷移できた。DB照合ではメール確認済みの `auth.users`、`public.users`、`public.accounts` が各1件、ルート・実走は0件、一時許可 `app_developers` は0件。したがって再表示された「記録を読み込めませんでした」は再登録失敗ではなく、一般ユーザーを拒む開発者限定RLSが原因。登録→確認→退会→同じメールで再登録の実測は成功。一般ユーザーのマイページ利用は引き続き公開前の権限移行が必要。

## 一般ユーザー向けRLSへの移行

変更直前に `backups/20261012-before-general-user-rls/database.dump` へ全DBを `pg_dump -Fc` で保全した。`pg_restore -l` で読めることを確認済み。SHA-256は `5f7adfc49b1f138bff136640be6939d1b1afa1ca73fd29e860eee201363e2fb8`。バックアップはGit対象外。

`202610120002_general_user_rls.sql` をロールバック付きで検証してから本番DBへ一度適用した。一般ユーザーの個人アカウント所有を基準に `users`・記録・写真・Storage の権限を変更し、公開ルートは `is_public` のみ閲覧可能にした。RLSが無効だった `accounts`・`account_members`・`orgs`・`plans`・`subscriptions` もRLSを有効にし、必要な読み取りに限定した。SQLのSHA-256は `3a59154531665a775304a489e6a2fa86e768b18282c185d69eb0f44e2e1cc707`。

適用直後の匿名閲覧テストで、古いルートポリシーが参照する `account_members` のSELECT権限不足を発見した。`202610120003_anon_route_policy_dependency.sql` をロールバック付きで検証してから一度適用し、匿名にSELECT権限だけ付与した。同テーブルにはSELECTポリシーがないため匿名・ログイン済みユーザーとも実データは0件。SQLのSHA-256は `a279a4e15efeef0b02bbba311ed56a458fbacf806a85ae99f723cce5b684fc99`。

適用後に再登録した一般ユーザーの権限で `users`・`accounts`・`subscriptions` が各1件、他人の非公開ルート・実走が0件と確認した。匿名では公開ルート5件、非公開ルート0件、公開写真2件。プロフィール更新はロールバック付きで成功した。一般ユーザーのルート作成・公開RPCも適用前のロールバック付き検証で成功した。DB件数は適用後 `users` 8件、`routes` 51件、`runs` 43件、`route_spot_photos` 32件。ブラウザでの再読み込みによる表示確認は未実施。

その後、GitHub Pagesの公開処理は成功し、ユーザーの実機再読み込みで「記録を読み込めませんでした」が消えたことを確認した。

## 新規登録時の個人アカウント所属

変更直前に `backups/20261012-before-membership-trigger/database.dump` へ全DBを `pg_dump -Fc` で保全し、`pg_restore -l` で読めることを確認した。SHA-256は `6cd5f405ea071f7d2bc57f8aa591756a3cdef15f3bc80442987d5c7c1ea3b259`。Git対象外。

現行の `handle_new_user()` はAuthユーザー登録時に個人 `accounts`、`public.users`、無料 `subscriptions` を作るが、`account_memberships` を作っていなかった。所属のない既存個人ユーザー2件はいずれもAuthユーザーが存在し、無料プランが有効だった。

`202610120004_signup_personal_membership.sql` をロールバック付きで検証後、一度だけ本番DBに適用した。新規登録と同じトランザクションで有効な `owner` 所属を作り、欠けていた2件だけ補完した。既存の所属のrole/statusは変更しない。移行SQLのSHA-256は `2b0509e02cb6396c3fee8617f042ab9ae1c1f16d776314386221447369cdb3d0`。

試験用Authユーザーをロールバック付きトランザクションで挿入し、ユーザー・個人アカウント・owner所属・無料プランが各1件生成されることを確認した。適用後は個人アカウントの所属欠落0件、有効なowner所属8件。試験用Auth行は残っていない。一般ユーザーとして本人のowner所属1件と個人アカウント1件を閲覧できた。組織アカウントの作成・招待・ロール変更は今回の対象外。
