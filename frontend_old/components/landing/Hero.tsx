import Link from "next/link";

type HeroProps = {
  onPrimaryClickHref?: string;
  onSecondaryClickHref?: string;
};

export default function Hero({
  onPrimaryClickHref = "#try",
  onSecondaryClickHref = "/how-it-works",
}: HeroProps) {
  return (
    <section className="cf-section relative w-full overflow-hidden">
      {/* Local hero glow (separate from global background) */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-160px] h-[560px] w-[980px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(120,80,255,0.38),transparent_65%)] blur-3xl" />
      </div>

      <div className="cf-container cf-section-inner">
        {/* The “good screenshot” surface wrapper */}
        <div className="cf-surface p-6 sm:p-10">
          <div className="mx-auto max-w-4xl">
            {/* Eyebrow pill */}
            <div className="mb-6 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1 text-xs font-semibold text-white/70">
                🎬 Auto-clips for Shorts, Reels, TikTok
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-6xl">
              Automated clips.
              <br />
              <span className="cf-gradient-text">Zero effort.</span>
            </h1>

            {/* Subhead */}
            <p className="mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-white/70 sm:text-lg">
              Upload once. Clipforge turns long videos into social-ready highlight
              clips — no downloading, no editing, no re-uploading. Just consistent
              output.
            </p>

            {/* CTAs */}
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={onPrimaryClickHref}
                className="cf-btn cf-btn-primary px-7 py-3.5 text-base"
              >
                Start clipping free →
              </Link>

              <Link
                href={onSecondaryClickHref}
                className="cf-btn cf-btn-ghost px-7 py-3.5 text-base"
              >
                See how it works
              </Link>
            </div>

            {/* Callout */}
            <div className="mt-10 flex justify-center">
              <div className="max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-white/75">
                ⚡ Set it once and let the content flow.{" "}
                <span className="font-semibold text-white/90">Clipforge</span>{" "}
                handles everything after upload.
              </div>
            </div>
          </div>
        </div>

        {/* Clean divider like EasySlice */}
        <div className="mt-10 cf-divider" />
      </div>
    </section>
  );
}
