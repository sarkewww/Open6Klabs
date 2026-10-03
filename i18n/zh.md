# Amuse

[English](en.md) · [简体中文](zh.md) · [日本語](ja.md) · [한국어](ko.md) · [← 返回](../README.md)

![Amuse — 控制面板](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/panel.png)

![Amuse — 挂件](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/widget.png)

一个本地运行的「正在播放」挂件，配套一个可实时预览的控制面板。

## 功能

- 8 种皮肤 · 4 种封面 · 2 种主题 · 14 种字体 · 24 种进出场动画
- 6 个音乐源：Spotify · Pear Desktop · YouTube Music Desktop · Apple Music · Tidal · Spicetify
- FREE / PRO / DISCORD 会员门禁
- 本地 mock 后端 + 自建实时通道（WebSocket + SSE）
- 控制面板带实时预览
- 多档案 · 每个档案独立样式与专属挂件链接（免费 3 个 · Pro 无限）

## 使用方法

```bash
pnpm install
pnpm dev      # 后端 :8787 · 挂件 :5199 · 面板 :5174
```

- 控制面板：<http://localhost:5174>
- 挂件：<http://localhost:5199/widget/amuse/local>
