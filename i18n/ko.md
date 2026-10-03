# Amuse

[English](en.md) · [简体中文](zh.md) · [日本語](ja.md) · [한국어](ko.md) · [← 뒤로](../README.md)

![Amuse — 컨트롤 패널](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/panel.png)

![Amuse — 위젯](https://raw.githubusercontent.com/sarkewww/Open6Klabs/main/docs/images/widget.png)

스트리머를 위한 로컬 재생 중 위젯과 이를 커스터마이즈하는 컨트롤 패널입니다.

## 기능

- 스킨 8 · 커버 4 · 테마 2 · 폰트 14 · 애니메이션 24
- 6개 음악 소스: Spotify · Pear Desktop · YouTube Music Desktop · Apple Music · Tidal · Spicetify
- FREE / PRO / DISCORD 멤버십 제한
- 로컬 mock 백엔드 + 자체 실시간 (WebSocket + SSE)
- 라이브 미리보기 컨트롤 패널
- 다중 프로필 · 프로필마다 고유 스타일과 전용 위젯 URL (무료 3개 · Pro 무제한)

## 사용 방법

```bash
pnpm install
pnpm dev      # mock :8787 · widget :5199 · panel :5174
```

- 컨트롤 패널: <http://localhost:5174>
- 위젯: <http://localhost:5199/widget/amuse/local>
