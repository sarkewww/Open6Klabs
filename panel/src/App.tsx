import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WIDGET_PATH = (import.meta as any).env?.VITE_WIDGET_URL || "/widget/amuse/local";
const AUTH = { authorization: "Bearer local" };

type Settings = {
  skin: string;
  theme: string;
  cover: string;
  tint_color: string;
  font: string;
  visible_duration: number;
  hide_delay: number;
  cover_blur: boolean;
  cover_glow: boolean;
  hide_on_pause: boolean;
  song_change_only: boolean;
  magic_colors: boolean;
  hide_visualizer: boolean;
  show_animation: string;
  hide_animation: string;
  is_demo: boolean;
};

const DEFAULTS: Settings = {
  skin: "boxy",
  theme: "default_light",
  cover: "vinyl",
  tint_color: "#ffffff",
  font: "poppins",
  visible_duration: 5,
  hide_delay: 0,
  cover_blur: true,
  cover_glow: true,
  hide_on_pause: false,
  song_change_only: false,
  magic_colors: true,
  hide_visualizer: false,
  show_animation: "default_in",
  hide_animation: "default_out",
  is_demo: false,
};

const SKINS = [
  { id: "compact", name: "Compact", tier: "FREE", hasCover: true },
  { id: "boxy", name: "Boxy", tier: "FREE", hasCover: true },
  { id: "gallery", name: "Gallery", tier: "FREE", hasCover: true },
  { id: "minimal", name: "Minimal", tier: "FREE", hasCover: true },
  { id: "macos", name: "macOS", tier: "PRO", hasCover: true },
  { id: "shell", name: "Shell", tier: "PRO", hasCover: false },
  { id: "windows98", name: "Windows 98", tier: "PRO", hasCover: true },
  { id: "discord", name: "Discord", tier: "DISCORD", hasCover: true },
];
const COVERS = [
  { id: "square", name: "Square" },
  { id: "canvas", name: "Canvas" },
  { id: "vinyl", name: "Vinyl" },
  { id: "none", name: "None" },
];
const THEMES = [
  { id: "default_dark", name: "Dark Mode" },
  { id: "default_light", name: "Light Mode" },
];
const FONTS = [
  ["poppins", "Poppins"], ["fredoka", "Fredoka"], ["spacemono", "Space Mono"], ["silkscreen", "Silkscreen"],
  ["bagelFatOne", "Bagel Fat One"], ["gasoekOne", "Gasoek One"], ["zcoolKuaile", "ZCOOL KuaiLe"],
  ["zcoolQingkeHuangyou", "ZCOOL QingKe HuangYou"], ["singleDay", "Single Day"], ["jua", "Jua"],
  ["russoOne", "Russo One"], ["monomakh", "Monomakh"], ["notoSerifDisplay", "Noto Serif Display"], ["openDyslexic", "Open Dyslexic"],
].map(([id, name]) => ({ id, name }));
const SHOW = ["default_in", "fade_in", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "grow_in", "shrink_in", "swing_rotate_in_left", "swing_rotate_in_right", "tilt_in_right", "tilt_in_left"];
const HIDE = ["default_out", "fade_out", "slide_out_left", "slide_out_right", "slide_out_top", "slide_out_bottom", "grow_out", "shrink_out", "swing_rotate_out_left", "swing_rotate_out_right", "tilt_out_right", "tilt_out_left"];

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [tier, setTier] = useState<string>("free");
  const [status, setStatus] = useState<string>("inactive");
  const [discordMember, setDiscordMember] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const iframe = useRef<HTMLIFrameElement>(null);
  const active = status === "active";
  const plan = active ? (tier === "supporter" ? "DISCORD" : tier.toUpperCase()) : "FREE";

  const loadSub = () =>
    Promise.all([
      fetch("/api/users/subscription", { headers: AUTH }).then((r) => r.json()),
      fetch("/api/users", { headers: AUTH }).then((r) => r.json()),
    ])
      .then(([s, u]) => {
        setTier(s.tier || "free");
        setStatus(s.status || "inactive");
        setDiscordMember(!!u?.is_discord_member);
      })
      .catch(() => {});

  useEffect(() => {
    fetch("/api/widgets/amuse/profiles/main", { headers: AUTH })
      .then((r) => r.json())
      .then((p) => p?.settings && setSettings({ ...DEFAULTS, ...p.settings }))
      .catch(() => {});
    loadSub();
  }, []);

  const save = useCallback(
    (next: Settings) => {
      setSaved("saving");
      fetch("/api/widgets/amuse/profiles/main", {
        method: "PUT",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ settings: next }),
      })
        .then(() => {
          setSaved("saved");
          setTimeout(() => setSaved("idle"), 800);
        })
        .catch(() => setSaved("idle"));
    },
    []
  );

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      save(next);
      return next;
    });
  };

  const locked = (skin: (typeof SKINS)[number]) => {
    if (skin.tier === "PRO") return !active;
    // real Amuse rule: an active subscription, or linked Discord + membership, unlocks Discord
    if (skin.tier === "DISCORD") return !(active || discordMember);
    return false;
  };

  const overlayUrl = new URL(WIDGET_PATH, window.location.origin).href;

  const card = "rounded-2xl border border-line bg-card p-5";
  const sectionTitle = "mb-3 font-poppins text-sm uppercase tracking-widest text-white/50";

  return (
    <div className="min-h-screen bg-ink font-poppins">
      <div className="mx-auto flex max-w-7xl gap-8 p-8">
        <main className="min-w-0 flex-1">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-poppins text-3xl font-black text-white">Amuse</h1>
              <p className="text-sm text-white/50">Widget control panel</p>
            </div>
            <div className="flex items-center gap-3">
              <span data-plan className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-white/70">
                {plan}
                {discordMember && plan !== "DISCORD" ? " · DISCORD" : ""}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(overlayUrl)}
                className="rounded-xl bg-gradient-to-br from-white to-white/70 px-4 py-2 text-sm font-semibold text-black shadow-lg transition hover:opacity-90"
              >
                Copy overlay URL
              </button>
            </div>
          </header>

          <section className={`${card} mb-6`}>
            <h2 className={sectionTitle}>Skin</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {SKINS.map((skin) => {
                const isLocked = locked(skin);
                const selected = settings.skin === skin.id;
                return (
                  <button
                    key={skin.id}
                    data-skin={skin.id}
                    data-locked={isLocked}
                    disabled={isLocked}
                    onClick={() => update("skin", skin.id)}
                    className={`relative overflow-hidden rounded-xl border p-3 text-left transition ${
                      selected ? "border-white/80 ring-2 ring-white/60" : "border-line hover:border-white/30"
                    } ${isLocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-black/40">
                      <img src={`${WIDGET_PATH.replace(/\/widget\/.*/, "")}/assets/${skinImg(skin.id)}`} alt="" className="max-h-16" />
                    </div>
                    <div className="text-sm font-semibold text-white">{skin.name}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/40">{skin.tier}</div>
                    {isLocked && <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">Unlock</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className={card}>
              <h2 className={sectionTitle}>Cover</h2>
              <div className="flex flex-wrap gap-2">
                {COVERS.map((c) => (
                  <button
                    key={c.id}
                    data-cover={c.id}
                    onClick={() => update("cover", c.id)}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${settings.cover === c.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </section>
            <section className={card}>
              <h2 className={sectionTitle}>Theme</h2>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    data-theme={t.id}
                    onClick={() => update("theme", t.id)}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${settings.theme === t.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className={`${card} mb-6`}>
            <h2 className={sectionTitle}>Font</h2>
            <div className="flex flex-wrap gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  data-font={f.id}
                  onClick={() => update("font", f.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${settings.font === f.id ? "border-white/80 bg-white/10 text-white" : "border-line text-white/60 hover:border-white/30"}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className={card}>
              <h2 className={sectionTitle}>Show animation</h2>
              <select
                data-show
                value={settings.show_animation}
                onChange={(e) => update("show_animation", e.target.value)}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {SHOW.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <h2 className={`${sectionTitle} mt-5`}>Hide animation</h2>
              <select
                data-hide
                value={settings.hide_animation}
                onChange={(e) => update("hide_animation", e.target.value)}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {HIDE.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </section>
            <section className={card}>
              <h2 className={sectionTitle}>Timing</h2>
              <label className="mb-1 block text-xs text-white/50">Visible duration</label>
              <select
                data-duration
                value={settings.visible_duration}
                onChange={(e) => update("visible_duration", Number(e.target.value))}
                className="mb-4 w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {[5, 10, 15, 20, 25, 30].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-xs text-white/50">Hide delay</label>
              <select
                data-delay
                value={settings.hide_delay}
                onChange={(e) => update("hide_delay", Number(e.target.value))}
                className="w-full rounded-lg border border-line bg-black/40 p-2 text-sm text-white"
              >
                {[0, 5, 10, 20, 30, 40, 50, 60].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "No delay" : `${s} seconds`}
                  </option>
                ))}
              </select>
            </section>
          </div>
        </main>

        <aside className="sticky top-8 h-fit w-[480px] shrink-0">
          <div className={`${card} flex flex-col items-center gap-4`}>
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Live preview</span>
              <span data-save-state className="text-xs text-white/40">
                {saved === "saving" ? "saving…" : saved === "saved" ? "saved" : "synced"}
              </span>
            </div>
            <div className="flex h-[420px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#0e0e0e]">
              <iframe ref={iframe} title="Amuse widget" src={WIDGET_PATH} className="h-[420px] w-full border-0" />
            </div>
            <div data-preview-state className="w-full break-all text-center text-[11px] text-white/40">
              skin={settings.skin} · cover={settings.cover} · theme={settings.theme} · font={settings.font}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-white/30">
            Local reproduction · widget served at <code className="text-white/50">{overlayUrl}</code>
          </p>
        </aside>
      </div>
    </div>
  );
}

function skinImg(id: string): string {
  const map: Record<string, string> = {
    compact: "compact-CQiUdgmT.svg",
    boxy: "boxy-BucZ6z4D.svg",
    gallery: "big-cover-DUHeEaO7.svg",
    minimal: "minimal-lTckpbhQ.svg",
    macos: "macOS-DHIESALH.svg",
    shell: "shell-fSpeMdMs.svg",
    windows98: "windows98-DTy_973X.svg",
    discord: "discord-hPuUPOwv.svg",
  };
  return map[id] || "boxy-BucZ6z4D.svg";
}
