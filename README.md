# はよおきんかい（Hayookinkai）

朝が苦手な人向けの **AI目覚ましWebアプリ**。設定時刻にアラームが鳴り、計算・シェイク・記憶などのミッションをクリアするまで止まりません。AIメッセージ・天気・睡眠記録で朝をサポートします。

- 本番URL: https://hayo.webtool-labs.com
- 構成: Flask + Gunicorn + Nginx（VPS）/ HTTPS・HTTP→HTTPSリダイレクトはNginx側

## OGP画像について

SNS共有用のOGP画像は `static/ogp.png` に配置してください。
推奨サイズは **1200×630px** です。未配置の場合、SNS共有時に画像が表示されません（タグの参照だけ先に入っています）。

## SEO

- `GET /robots.txt` … クローラー向け設定
- `GET /sitemap.xml` … トップページ、SEO記事、FAQ、運営者情報、規約系ページを収録。ログイン後ページ・APIは含めない方針
- 公開後、Google Search Console で `https://hayo.webtool-labs.com/sitemap.xml` を手動送信してください
- Google に出ない場合は Search Console の URL 検査で `https://hayo.webtool-labs.com/` を検査し、「インデックス登録をリクエスト」を実行してください
- 反映確認は `site:hayo.webtool-labs.com` と `site:hayo.webtool-labs.com はよおきんかい` で行います

## 開発メモ

- `.env`（Groq APIキー等）と `.venv/`、`__pycache__/`、`.DS_Store` は Git 管理対象外（`.gitignore` 済み）。APIキーは絶対にコミットしないこと
- 起動: `python app.py`（ポート 8000）
