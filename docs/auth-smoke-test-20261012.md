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
