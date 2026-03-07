import Link from "next/link";

export default function LabsLandingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-12">
      <div className="surface relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-65"
          style={{
            background:
              "radial-gradient(620px 320px at 22% 24%, rgba(155,140,255,0.24), transparent 70%), radial-gradient(640px 340px at 80% 28%, rgba(255,183,3,0.24), transparent 72%), radial-gradient(680px 360px at 52% 96%, rgba(58,134,255,0.18), transparent 74%)",
          }}
        />

        <div className="relative">
          <div className="inline-flex rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-xs text-white/75">
            Orbito Labs
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
            Labs landing
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
            You are in the Orbito Labs entry page. To keep access clean, the Labs console opens from your dashboard.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="surface-soft rounded-2xl p-4 text-sm text-white/75">
              One account across Orbito and Labs.
            </div>
            <div className="surface-soft rounded-2xl p-4 text-sm text-white/75">
              Shared social connections and publish flow.
            </div>
            <div className="surface-soft rounded-2xl p-4 text-sm text-white/75">
              Console access stays in dashboard.
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/app" className="btn-orbito-cta">
              Open Dashboard
            </Link>
            <Link href="/pricing" className="btn-clipforge">
              View Plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

