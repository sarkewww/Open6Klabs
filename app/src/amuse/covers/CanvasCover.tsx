/**
 * Canvas (video) cover — `settings.cover === "canvas"` (`Cover.CANVAS`).
 *
 * Faithful port of the canvas branch of the original cover component `Q`
 * (`app/_reference/PlayerWindows98-ChpRHqWu.js:186-209`) plus the shared video
 * element `vs` (`:252-278`). The shared `Q` / `ms` layers live in
 * `cover-layers.tsx`.
 *
 * Original canvas DOM/behaviour:
 *   - `vs` (`:252-278`) renders the canvas media with
 *     `className="absolute h-full w-full transform-gpu object-cover"`,
 *     `muted controls={false} loop autoPlay playsInline preload="metadata"`,
 *     `disablePictureInPicture` / `disableRemotePlayback`, and
 *     `onError` -> `console.error("Video error:", ...)`.
 *   - `ms`'s overlay `j` (`:250`) only mounts the canvas media when
 *     `settings.cover === "canvas" && canvas_url && is_playing`, i.e. the video
 *     is lazily mounted while a track plays.
 *   - `vs`'s visibility effect (`:263-274`) plays only when
 *     `!document.hidden && cover === CANVAS && canvas_url && is_playing`, and
 *     pauses otherwise (unmount clears `src` + `load()`).
 *
 * This rewrite renders the canvas media as a YouTube embed iframe (plan
 * Todo 18: "video iframe from `canvas_url`") wrapped in the `.video-container`
 * geometry from `widget/assets/PlayerWindows98-Dx94IdDH.css`:
 *
 *   .video-container{width:205%;height:100%;overflow:hidden;position:absolute}
 *   .video-container iframe{position:absolute;width:100%;height:100%}
 *   .video-container iframe{pointer-events:none}
 *   .video-container iframe{position:absolute;top:-60px;left:0;width:100%;
 *                            height:calc(100% + 120px)}
 *   .video-foreground{pointer-events:none}
 *
 * No iframe dimensions/aspect/params are set inline: the `.video-container`
 * CSS owns the geometry, and the embed URL mirrors the reference YouTube
 * embed (`app/_reference/main-Dx8nN5Es.js:26953-26954`) exactly — same
 * `youtube.com/embed/<id>` src, same `allow` permission list, `allowFullScreen`.
 * `loading="lazy"` reproduces the original's lazy media mounting.
 *
 * The YouTube id parser is the verbatim reference regex from
 * `main-Dx8nN5Es.js:26953`.
 */

import { usePlayerStoreSelector } from '../player/context';
import { useProfileSettings } from '../profile/context';
import { Cover } from '../types/user';
import { CoverArt, CoverGlow } from './cover-layers';

/* -------------------------------------------------------------------------- */
/* YouTube parsing — verbatim from `main-Dx8nN5Es.js:26953`                     */
/* -------------------------------------------------------------------------- */

/** YouTube embed host used by the reference embed (`main-Dx8nN5Es.js:26954`). */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube.com/embed/';

/**
 * YouTube id extraction — the exact regex the reference embed uses
 * (`main-Dx8nN5Es.js:26953`). Matches `youtu.be/<id>`, `youtube.com/embed/<id>`,
 * `youtube.com/v/<id>`, `youtube.com/watch?v=<id>` and `watch?...&v=<id>`.
 */
export const YOUTUBE_ID_PATTERN =
  /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/;

/** Extracts the 11-char YouTube video id from a URL, or `null` if none. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.match(YOUTUBE_ID_PATTERN)?.[1] ?? null;
}

/** Builds the reference embed URL for a parsed video id. */
export function buildYouTubeEmbedUrl(videoId: string): string {
  return `${YOUTUBE_EMBED_ORIGIN}${videoId}`;
}

/**
 * `allow` permission list — verbatim from the reference embed
 * (`main-Dx8nN5Es.js:26954`).
 */
export const YOUTUBE_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

/** `Q`'s default radius for non-vinyl covers (`e.radius ?? "0.5rem"`). */
export const CANVAS_COVER_RADIUS = '0.5rem';

/** `ms`'s radial mask for non-vinyl covers (`x.set(... : -0.5)`). */
export const CANVAS_COVER_MASK =
  'radial-gradient(circle at center, transparent -0.5%, black -0.5%)';

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function CanvasCover() {
  const settings = useProfileSettings();
  const canvasUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.canvas_url,
  );
  const coverUrl = usePlayerStoreSelector(
    (state) => state.currentTrack.cover_url,
  );
  const isPlaying = usePlayerStoreSelector(
    (state) => state.currentTrack.is_playing,
  );

  const videoId = parseYouTubeId(canvasUrl);
  // Lazy mount: the original only mounts/plays the canvas media while the
  // canvas cover is selected, a canvas_url exists and the track is playing
  // (`ms`'s `j` gate + `vs`'s visibility effect).
  const showVideo =
    settings.cover === Cover.CANVAS && isPlaying && videoId !== null;
  const showGlow = Boolean(settings.cover_glow && coverUrl);

  return (
    <div
      data-testid="amuse-cover"
      data-cover="canvas"
      className="relative aspect-square h-full"
    >
      <div
        className="relative h-full w-full transform-gpu"
        style={{ transformOrigin: 'center center' }}
      >
        <div className="relative z-50">
          <CoverArt
            radius={CANVAS_COVER_RADIUS}
            mask={CANVAS_COVER_MASK}
            testId="amuse-cover-art"
            image={
              <div
                data-testid="amuse-canvas-fallback"
                className="absolute inset-0"
                style={{
                  backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                }}
              />
            }
            canvas={
              showVideo ? (
                <div
                  data-testid="amuse-canvas-video-container"
                  className="video-container"
                >
                  <iframe
                    data-testid="amuse-canvas-iframe"
                    className="video-foreground"
                    src={buildYouTubeEmbedUrl(videoId)}
                    title="Canvas video"
                    loading="lazy"
                    allowFullScreen
                    allow={YOUTUBE_IFRAME_ALLOW}
                    onError={(event) => {
                      // Faithful to `vs`'s `onError` (`:275-277`).
                      console.error('Video error:', event);
                    }}
                  />
                </div>
              ) : null
            }
          />
        </div>
        <CoverGlow
          show={showGlow}
          radius={CANVAS_COVER_RADIUS}
          coverUrl={coverUrl}
        />
      </div>
    </div>
  );
}
