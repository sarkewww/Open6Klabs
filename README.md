# Amuse

[English](i18n/en.md) · [简体中文](i18n/zh.md) · [日本語](i18n/ja.md) · [한국어](i18n/ko.md)

![Amuse — control panel](docs/images/panel.png)

![Amuse — widget](docs/images/widget.png)

A local now-playing widget for streamers, with a control panel to customize it.

## Features

- 8 skins · 4 covers · 2 themes · 14 fonts · 24 in/out animations
- 6 music sources: Spotify · Pear Desktop · YouTube Music Desktop · Apple Music · Tidal · Spicetify
- Free / Pro / Discord membership gating
- Local mock backend with self-hosted realtime (WebSocket + SSE)
- Control panel with live preview
- Multiple profiles — each with its own style and a unique widget URL (3 on Free · unlimited on Pro)

## Usage

```bash
pnpm install
pnpm dev      # mock :8787 · widget :5199 · panel :5174
```

- Panel: <http://localhost:5174>
- Widget: <http://localhost:5199/widget/amuse/local>
