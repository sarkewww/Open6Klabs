# Amuse

[English](en.md) · [简体中文](zh.md) · [日本語](ja.md) · [한국어](ko.md) · [← Back](../README.md)

![Amuse — control panel](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/panel.png)

![Amuse — widget](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/widget.png)

A local now-playing widget for streamers, with a control panel to customize it.

## Features

- 8 skins · 4 covers · 2 themes · 14 fonts · 24 in/out animations
- 6 music sources: Spotify · Pear Desktop · YouTube Music Desktop · Apple Music · Tidal · Spicetify
- Free / Pro / Discord membership gating
- Local mock backend with self-hosted realtime (WebSocket + SSE)
- Control panel with live preview

## Usage

```bash
pnpm install

pnpm mock     # backend -> http://localhost:8787
pnpm widget   # widget  -> http://localhost:5199/widget/amuse/local
pnpm panel    # panel   -> http://localhost:5174
```

- Panel: <http://localhost:5174>
- Widget: <http://localhost:5199/widget/amuse/local>
