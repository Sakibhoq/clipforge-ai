import React from "react";

export default function TermsPage() {
  return (
    <section className="relative mx-auto max-w-4xl px-6 pb-20 pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="aurora opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
        </div>

        <div className="relative">
          <div className="text-xs text-white/55">• Terms</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-white/55">Last updated: February 6, 2026</p>

          <div className="mt-6 space-y-6 text-sm leading-relaxed text-white/65">
            <p>
              By using Orbito, you agree to use the service responsibly and to only upload content you have rights
              to process.
            </p>

            <div>
              <div className="text-sm font-semibold text-white/80">Your content</div>
              <p className="mt-2">
                You keep ownership of your content. You give us permission to process it only to provide the service.
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Billing</div>
              <p className="mt-2">
                Credits are used when you generate clips. Plans and pricing are displayed on the Pricing page.
              </p>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Availability</div>
              <p className="mt-2">
                We work to keep the service reliable, but uptime is not guaranteed. Contact support if you hit an
                issue.
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
