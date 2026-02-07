import React from "react";

export default function PrivacyPage() {
  return (
    <section className="relative mx-auto max-w-4xl px-6 pb-20 pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="aurora opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
        </div>

        <div className="relative">
          <div className="text-xs text-white/55">• Privacy</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-white/55">Last updated: February 6, 2026</p>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-white/65">
            <p>
              We collect the minimum data needed to run Orbito: account details, usage data, and files you upload so
              we can generate clips for you.
            </p>

            <div>
              <div className="text-sm font-semibold text-white/80">What we collect</div>
              <ul className="mt-2 space-y-2">
                <li>Account info (name, email, login provider).</li>
                <li>Usage data (credits, jobs, and exports).</li>
                <li>Uploads you provide for processing.</li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">How we use it</div>
              <ul className="mt-2 space-y-2">
                <li>To process videos and deliver clips.</li>
                <li>To improve output quality and reliability.</li>
                <li>To support billing and account security.</li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Sharing</div>
              <p className="mt-2">
                We do not sell your data. We only share with trusted providers that help us run the service (for
                example, storage or payments).
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Contact</div>
              <p className="mt-2">
                Questions? Contact support at <span className="text-white/80">support@orbito.cc</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
