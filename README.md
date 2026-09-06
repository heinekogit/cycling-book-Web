# Cycling Book Web

Cycling BookのWebサービス版です。Vite、React、TypeScriptで開発します。

## 開発

```sh
npm install
npm run dev
```

## 確認

```sh
npm run lint
npm run build
```

`.env.example`を基に`.env.local`へSupabase等のブラウザ公開設定を用意します。

## GitHub Pages

開発中はGitHub Pagesを停止しており、`.github/workflows/deploy-pages.yml`は手動実行だけに制限しています。
一般公開時に`main`ブランチの自動公開を再開します。

GitHub Actionsで使用するRepository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

GitHubの **Settings → Pages → Build and deployment → Source** では **GitHub Actions** を選択します。
このリポジトリの公開URLは `https://heinekogit.github.io/cycling-book-Web/` です。

最新の既存版は `/Users/dev_tomo/Desktop/cy2` にあります。既存HTMLを原本として参照し、画面単位でReactへ移行します。
