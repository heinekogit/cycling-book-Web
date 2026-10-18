# 開発用Supabaseの構造・設定再現確認（2026-10-18）

対象は既存DB `cqiqhczxuiyakptdjowr` と開発用DB `cyutxspjthlodvgchnst`。この監査ではDashboardを読み取り、SQL・設定変更は行っていない。

## 再現済み

- `public` の16テーブル・19関数、RLSポリシー、権限、`auth.users` 登録トリガー、Storageポリシー、`route-photos` バケット、初期プラン3件は照合済み。詳細は `docs/schema-baseline-rollout-20261016.md` と `docs/db-migration-workflow-20261017.md`。
- 開発用で確認メール、新規登録後の個人アカウント・owner所属・free契約、ログイン、Storage APIの写真操作を検証済み。開発用Pagesから開発用DBへの保存と本番DBからの分離も確認済み。詳細は `docs/web-environment-isolation-test-20261017.md`。
- Dashboardでは両プロジェクトとも新規登録許可・メール確認がON、Emailプロバイダが有効、匿名ログイン・その他のプロバイダが無効。メール変更時の両アドレス確認はON、再認証を要するパスワード変更・現行パスワード要求・漏洩パスワード検査はOFF。メールOTP有効期限は3600秒。確認・再設定メールは標準テンプレートを使用し、カスタムSMTPはOFF。
- Authのトークン更新・検証、新規登録・ログイン等のDashboard上のレート制限値は一致。メール送信上限はDashboardでは非表示で、両環境とも組み込み送信の制限を受ける。
- 開発用Site URLは `https://heinekogit.github.io/cycling-book-web-dev/`。Redirect URLsには同サイトの `/auth/callback` と `/reset-password`、ローカル `http://localhost:5173` の同2パスを登録済み。

## 意図した差と公開前の残件

- 本番用と開発用のSupabase URL・公開キー、Auth Site URLは分離している。メールOTP長は本番用6桁、開発用8桁。開発用を6桁へ緩める必要はないため、差を記録して現状維持とした。
- 本番用Site URLは旧 `https://heinekogit.github.io/cy2/` のまま。React版の `https://heinekogit.github.io/cycling-book-Web/` を正式な公開先にする時、Site URLとcallback・再設定Redirect URLsを設定し、登録・再設定メールを実測する。古いLAN・Cloudflare TunnelのRedirect URLsも利用実態を確認して整理する。この監査で本番設定は変更していない。
- 組み込みメール送信には制限がある。開発用のパスワード再設定メールは前回HTTP 429で未完了。公開前にカスタムSMTPを用意し、確認・再設定メールの配信とリンク先を両環境で検証する。
- 開発用に本番ユーザーデータ・写真を複製していない。これは環境分離のため意図した状態。バックアップ復元の検証範囲は `docs/db-backup-restore-test-20261018.md` を参照。

**判定:** 「新環境へのDB構造・設定の再現」は、開発用環境として必要なDB構造、権限、Storage、登録・ログイン設定、および環境別URLの再現まで完了。本番公開先の切替設定、SMTPと再設定メールの通し試験は別の公開準備項目として継続する。
