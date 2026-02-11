import Link from "next/link";
import Navbar from "@/components/Navbar";
import { SocialBrandRow } from "@/components/SocialBrand";

const footerLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy-policy" },
  { label: "Terms", href: "/terms-of-service" },
] as const;

export default function FeaturesPage() {
  return (
    <div className="relative overflow-x-hidden bg-transparent">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 opacity-[0.55]">
          <div className="aurora" />
        </div>
        <div className="absolute -top-40 left-[-20%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_62%)] blur-3xl" />
        <div className="absolute top-24 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.18),transparent_64%)] blur-3xl" />
      </div>

      <Navbar />

      <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-12 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]">
        <section className="surface relative overflow-hidden p-6 sm:p-8 md:p-12">
          <div className="absolute inset-0">
            <div className="aurora opacity-55" />
            <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
          </div>

          <div className="relative">
            <div className="text-xs text-white/55">• Features</div>
            <h1 className="mt-3 text-[34px] leading-[1.05] font-semibold tracking-tight sm:text-4xl md:text-6xl text-white/92">
              How Orbito <span className="grad-text">works</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 md:text-[15px]">
              Turn one long video into short clips. Edit fast. Post everywhere.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <SocialBrandRow platforms={["youtube", "tiktok", "reels"]} compact />
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60">
                Upload once - publish more
              </span>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="surface-soft p-5">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/75">
                  Step 1
                </div>
                <div className="mt-3 text-sm font-semibold text-white/90">Upload your video</div>
                <div className="mt-2 text-sm text-white/60">Paste a YouTube link or upload a file.</div>
              </div>

              <div className="surface-soft p-5">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/75">
                  Step 2
                </div>
                <div className="mt-3 text-sm font-semibold text-white/90">Pick your clips</div>
                <div className="mt-2 text-sm text-white/60">Orbito finds strong moments. You keep what you like.</div>
              </div>

              <div className="surface-soft p-5">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/75">
                  Step 3
                </div>
                <div className="mt-3 text-sm font-semibold text-white/90">Post in minutes</div>
                <div className="mt-2 text-sm text-white/60">Schedule to connected accounts from your clips.</div>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <div className="text-sm font-semibold text-white/90">What you get</div>
              <div className="mt-3 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
                <div>Auto captions built for short videos</div>
                <div>Aspect ratios for every main platform</div>
                <div>Clean exports with ready-to-post files</div>
                <div>Social connect + scheduling in one flow</div>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/start-trial" className="btn-aurora w-full sm:w-auto text-center">
                Start free
              </Link>
              <Link href="/pricing" className="btn-ghost w-full sm:w-auto text-center">
                Pricing
              </Link>
              <Link href="/contact" className="btn-ghost w-full sm:w-auto text-center">
                Contact support
              </Link>
            </div>

            <footer className="pt-16 sm:pt-20 text-xs text-white/45">
              <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>© 2026 • Orbito by Sakib LLC</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {footerLinks.map((item) => (
                    <a key={item.href} href={item.href} className="hover:text-white/70">
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
