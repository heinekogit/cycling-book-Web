# Cycling Book Web React移行計画

調査日: 2026-08-22

## 1. 前提

- 現行Web版の原本は `/Users/dev_tomo/Desktop/cy2` とする。
- React版は `/Users/dev_tomo/workspace/cycling-book-web` で開発する。
- React Native版は別系統であり、Web版の仕様原本にはしない。ただし、距離計算、Polyline、型定義などの純粋ロジックは必要に応じて参考にする。
- `cy2`ではApp版から開発を始めたため、`index.html`など接頭辞なしの名前がApp版に使われ、Webサービス版には重複回避のため`web-`／`Web-`接頭辞が付いた。両者は現在分離済みなので、React版ではこの命名上の制約を引き継がない。
- `web-explore.html`をWebサービス版のトップページの原本とし、React版では `/` に配置する。
- 現行HTMLはReact版が安定するまで変更せず、挙動比較と切り戻しの基準として残す。
- `メモ_react化推進のメモ.txt` の `run.html` 起点案は採用しない。

## 2. 現行ファイルの分類

### Web版の移植対象（正本）

| 現行ファイル | 役割 | React側の想定URL | 主な機能 |
|---|---|---|---|
| `web-explore.html` | Webサービストップ・公開ルート一覧 | `/` | 公開ルート最新10件、写真数、認証表示、ルート作成導線 |
| `web-login.html` | 認証 | `/login` | ログイン、新規登録、復帰先URL、アカウントIDのキャッシュ |
| `web-mypage.html` | 個人データ一覧 | `/mypage` | マイルート／実走ログのタブ、一覧、削除、ルート統計 |
| `web-detail.html` | ルート・実走共通詳細 | `/routes/:routeId`、`/runs/:runId` | 地図、標高、写真、公開設定、削除、ルート化、簡易描画・実走記録 |
| `web-profile.html` | プロフィール設定 | `/profile` | 表示名、ホーム地点名、緯度経度、地図選択、現在地取得 |
| `Web-route-edit.html` | ルート作成・編集 | `/routes/new`、`/routes/:routeId/edit` | Leaflet描画、道路追従、手描き、Undo/Redo、下書き、保存 |
| `Web-route-photos.html` | ルート写真一覧 | `/routes/:routeId/photos` | 写真一覧表示 |

React版では画面をHTMLファイル名で公開しない。`web-`／`Web-`接頭辞は廃止し、役割を表す通常のURLとコンポーネント名へ統一する。

### Web版から参照されるが、別途判断する対象

| 現行ファイル | 現状 | 方針 |
|---|---|---|
| `run.html` | Webマイページから「実走を始める」で参照 | React Webへ移すか、React Nativeへ誘導するかを後半で決める |
| `detail-edit.html` | `web-detail.html`の編集リンクが参照 | ルート編集との役割重複を確認し、原則 `/routes/:id/edit` へ統合 |
| `route-photos.html` | App版写真一覧 | Web版では `Web-route-photos.html` を正本とする |
| `service-worker.js` | 旧PWAキャッシュ | 初期移植では使わない。React版完成後にPWA要件として再設計 |

### Web移行の正本にしないもの

- App系: `index.html`、`login.html`、`mypage.html`、`profile.html`、`detail.html`、`route-edit.html`、`route-photos.html`
- 実験・診断: `diag.html`、`leaflet_test.html`、`run-supabase-check.html`、`trial-run.html`
- 旧版: `古い/` 以下
- `mng.html`: 実体がほぼないため、要件が確定するまで保留

## 3. 現在の画面遷移

```text
Webサービストップ (web-explore → `/`)
├─ ログイン → web-login
├─ マイページ → web-mypage
├─ ルートを描く → Web-route-edit
└─ 公開ルート詳細 → web-route-detail.html（存在しない参照）

ログイン (web-login)
├─ 認証後 → returnTo、または web-explore
└─ マイページ → web-mypage

マイページ (web-mypage)
├─ プロフィール → web-profile
├─ ルート作成 → Web-route-edit
├─ マイルート詳細 → web-detail?kind=route&id=...
├─ 実走詳細 → web-detail?kind=run&id=...
└─ 実走開始 → run.html

詳細 (web-detail)
├─ 写真一覧 → Web-route-photos?route_id=...
├─ ルート編集 → detail-edit.html?id=...
├─ 実走をマイルート化 → 同じ画面のroute詳細
├─ 削除後 → web-mypage
└─ 戻る／トップ → web-explore

ルート編集 (Web-route-edit)
└─ 保存後 → web-detail?kind=route&id=...
```

React移行時は、存在しない `web-route-detail.html` を `web-detail.html` 相当の `/routes/:routeId` に統合する。また、トップへ戻る導線はすべて `/` に統一する。

## 4. データと外部依存

### Supabase

現行コードが直接参照するテーブルは以下。

| テーブル | 主な用途 | 確認できた主な項目 |
|---|---|---|
| `users` | 認証ユーザーとサービス内アカウント、プロフィール | `id`, `account_id`, `display_name`, `profile_image`, `home_lat`, `home_lng`, `home_name` |
| `routes` | 作成ルート、実走から作成したルート | `id`, `account_id`, `owner_account_id`, `name`, `created_at`, `is_public`, `route_type`, `source_run_id`, `origin`, `distance_m`, `geojson`, `polyline` |
| `runs` | 実走ログ | `id`, `account_id`, `name`, `started_at`, `ended_at`, `created_at`, `distance_m`, `duration_s`, `geojson`, `polyline` |
| `route_spot_photos` | ルート上の写真 | `id`, `route_id`, `image_url`, `thumb_url`, `taken_at`, `lat`, `lng` |

React版ではSupabaseクライアントを1か所に集約し、URLとAnon Keyは `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` から読む。Anon Keyはクライアント公開前提だが、RLSが正しく設定されていることを別途確認する。

### 地図・ルート・標高

- Leaflet 1.9.4
- OpenStreetMapタイル
- Mapbox Directions API（`js/routing.js`）
- Open Elevation API
- OpenTopoData API
- Turf 6.5.0は主に実走系ページで利用

Mapbox TokenもHTML/JS直書きをやめ、React版では環境変数へ移す。

### ブラウザ機能

- `localStorage`: 認証補助キャッシュ、アプリ版番号、ルート編集下書き
- Cache API / Service Worker: 旧版更新・オフライン対策
- Geolocation API: プロフィールのホーム地点、詳細画面内の簡易実走記録

## 5. 共通化が必要な処理

現行版ではHTML内に同種処理が重複している。React化と同時に次へ分離する。

| 共通処理 | 現在の主な所在 | React側の候補 |
|---|---|---|
| Supabaseクライアント | 各HTMLに重複 | `src/lib/supabase.ts` |
| セッション・ログイン状態 | `auth-common.js`、各HTML | `src/features/auth/AuthProvider.tsx` |
| account_id取得 | `auth-common.js`ほか | `src/features/auth/account.ts` |
| プロフィール取得・更新 | `profile-common.js` | `src/features/profile/api.ts` |
| GeoJSON解析・座標正規化 | `route-segments.js`、detail/mypage内 | `src/features/routes/geometry.ts` |
| 距離計算 | detail/mypage/edit内に重複 | `src/features/routes/distance.ts` |
| Polyline encode/decode | detail/edit内に重複 | `src/features/routes/polyline.ts` |
| 標高取得・集計 | detail/mypage内に重複 | `src/features/elevation/` |
| ルートAPI操作 | 各HTML | `src/features/routes/api.ts` |
| 実走API操作 | mypage/detail | `src/features/runs/api.ts` |
| 写真API操作 | explore/detail/photos | `src/features/photos/api.ts` |
| Leaflet表示 | detail/profile/edit | 共通Mapコンポーネント＋用途別コンポーネント |
| 読込・空・エラー表示 | 各HTML | 共通UIコンポーネント |

`route-segments.js` は純粋関数中心であり、TypeScriptへの移植優先度が高い。React Native版の距離計算・Polyline処理とも比較し、入力形式をWeb側のDBデータに合わせて一本化する。

## 6. React側の推奨構成

```text
src/
├── app/
│   ├── router.tsx
│   └── AppLayout.tsx
├── components/
│   ├── Header.tsx
│   ├── LoadingState.tsx
│   ├── EmptyState.tsx
│   └── ErrorState.tsx
├── features/
│   ├── auth/
│   ├── elevation/
│   ├── maps/
│   ├── photos/
│   ├── profile/
│   ├── routes/
│   └── runs/
├── pages/
│   ├── ExplorePage.tsx
│   ├── LoginPage.tsx
│   ├── MyPage.tsx
│   ├── ProfilePage.tsx
│   ├── RouteDetailPage.tsx
│   ├── RunDetailPage.tsx
│   ├── RouteEditorPage.tsx
│   └── RoutePhotosPage.tsx
├── lib/
│   └── supabase.ts
├── styles/
└── types/
```

`web-detail.html`は1ファイルだが、Reactではルート詳細と実走詳細を別ページコンポーネントに分け、地図・標高・写真などだけを共有する。

## 7. 移行フェーズ

### Phase 0: 接続準備

- SupabaseパッケージとLeaflet関連パッケージを追加
- `.env.local`にSupabase・Mapbox設定を用意
- 型、Supabaseクライアント、ルーター、共通レイアウトを作成
- 旧版と同じDBへ読み取り接続できることを確認

完了条件: `/`からSupabaseへ接続でき、認証状態を共通部品で表示できる。

### Phase 1: Explore

- `web-explore.html`の見た目と公開ルート一覧をWebサービストップ `/` へ移植
- 公開ルート最新10件と写真数を取得
- `/routes/:routeId`へ正しく遷移
- ログイン、マイページ、ルート作成の導線を設定

完了条件: 公開ルート一覧から既存データのルートIDを保持して詳細へ遷移できる。

### Phase 2: Login・認証

- ログイン、新規登録、ログアウト、セッション復元
- `returnTo`相当を安全な内部URLに限定して実装
- 要認証ページの保護
- `users.account_id`取得を共通化

完了条件: リロード後も認証状態が維持され、未ログイン時に元ページへ復帰できる。

### Phase 3: Detail（まず閲覧）

- ルート詳細と実走詳細を分離
- Leaflet地図、軌跡、標高、写真を移植
- ルートと実走の関連表示を移植
- 最初は編集、削除、公開変更、実走記録を無効化した閲覧版で完成させる

完了条件: 公開ルート詳細と本人の実走詳細が旧版と同等に閲覧できる。

### Phase 4: Mypage・Profile

- マイルート／実走ログのタブ一覧
- 削除処理
- プロフィール読込・保存
- ホーム地点の地図選択と現在地取得
- マイページの標高統計は共通標高モジュールを使用

完了条件: 本人のデータのみ閲覧・更新・削除できる。

### Phase 5: Route Editor

- 道路追従／手描き
- ポイント追加・移動・削除・中間点追加
- Undo/Redo、下書き復元
- 新規保存と既存編集を明確に分ける

注意: 現行 `Web-route-edit.html` は編集IDを読み込める一方、保存処理が常に `insert` している。React版では「複製」なのか「update」なのか仕様を決め、誤上書きを避ける。

完了条件: 新規作成、編集、下書き復元が意図どおり分離される。

### Phase 6: Photos・更新操作

- 写真一覧と地図上の写真ピン
- 公開／非公開切替
- 実走ログからマイルート作成
- 詳細からの削除
- 写真アップロードが別画面・別処理に存在する場合は追加調査

完了条件: RLSを含め、所有者だけが更新できる。

### Phase 7: Web実走機能の判断

- `run.html`のWeb実走記録をReact化するかを決定
- React化する場合も、バックグラウンド記録の保証はしない
- React Native版へ誘導する場合は、Web詳細の「このルートで実走する」の遷移方法を設計

### Phase 8: PWA・公開切替

- 必要ならVite向けPWA構成を導入
- キャッシュ、オフライン、更新通知を再設計
- 旧GitHub Pages URLとの互換・リダイレクトを確認
- 画面ごとに旧版と比較後、React版を正本へ切り替える

## 8. 調査で見つかった要注意点

1. `web-explore.html`が存在しない `web-route-detail.html`へ遷移している。React版では `/routes/:id`へ修正する。
2. Supabase URLとAnon Keyが複数HTMLに重複している。環境変数と単一クライアントへ統合する。
3. Mapbox Tokenが `js/config.js`に直書きされている。環境変数へ移す。
4. 距離、Polyline、GeoJSON、標高処理が複数ページで重複している。画面移植前に純粋関数へ分離する。
5. `web-detail.html`は閲覧、編集、公開変更、削除、ルート化、簡易実走記録まで持つ巨大ページである。一度に移植せず機能を段階分割する。
6. `Web-route-edit.html`は既存ルートを読み込めるが保存は `insert`。編集と複製の期待動作を確定する必要がある。
7. `web-mypage.html`にはDBカラム不足を握りつぶす互換処理がある。現行DBスキーマを確認して不要なフォールバックを整理する。
8. `web-detail.html`から参照される `detail-edit.html`はApp系タイトルで、Web系との境界が曖昧。React版では編集ページへ統合する。
9. `Web-route-photos.html`は認証必須だが、公開ルートの写真を未ログイン閲覧させるか仕様確認が必要。
10. 現行コードから確認できる写真機能は一覧取得が中心。アップロード元とSupabase Storageのバケット・ポリシーは追加確認が必要。
11. 旧Service Workerのキャッシュ削除とバージョンクエリは、Viteのハッシュ付き成果物ではそのまま移さない。
12. 公開ルート一覧は最新10件固定。ページング、検索、絞り込みは現行機能ではなく将来拡張として扱う。

## 9. 最初の実装単位

最初の実装は次の範囲に限定する。

1. Supabase設定
2. React Router
3. 共通ヘッダーと認証表示
4. `/`の公開ルート一覧
5. `/routes/:routeId`の最小閲覧ページへの遷移

これにより、React基盤、DB接続、認証表示、主要導線を小さい範囲で一度に検証できる。旧版を変更せず、React版だけで確認する。

- 開発サーバー起動済み：
http://127.0.0.1:5173/










