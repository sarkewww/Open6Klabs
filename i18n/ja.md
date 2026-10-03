# Amuse

[English](en.md) · [简体中文](zh.md) · [日本語](ja.md) · [한국어](ko.md) · [← 戻る](../README.md)

![Amuse — コントロールパネル](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/panel.png)

![Amuse — ウィジェット](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/widget.png)

配信者向けのローカル再生中ウィジェットと、それをカスタマイズするコントロールパネルです。

## 機能

- スキン 8 · カバー 4 · テーマ 2 · フォント 14 · アニメーション 24
- 6 つの音楽ソース: Spotify · Pear Desktop · YouTube Music Desktop · Apple Music · Tidal · Spicetify
- FREE / PRO / DISCORD のメンバーシップ制限
- ローカル mock バックエンド + 自前リアルタイム (WebSocket + SSE)
- ライブプレビュー付きコントロールパネル
- 複数プロフィール · プロフィールごとにスタイルと専用ウィジェットURL（無料 3 個 · Pro は無制限）

## 使い方

```bash
pnpm install
pnpm dev      # mock :8787 · widget :5199 · panel :5174
```

- コントロールパネル: <http://localhost:5174>
- ウィジェット: <http://localhost:5199/widget/amuse/local>
