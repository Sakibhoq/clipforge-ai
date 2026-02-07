import Link from "next/link";
import React from "react";
import { BRAND } from "@/lib/brand";

type LegalKind = "privacy" | "terms";

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const LAST_UPDATED = "February 7, 2026";
const CONTACT_EMAIL = "support@orbito.cc";

const PRIVACY_SECTIONS: Section[] = [
  {
    id: "scope",
    title: "1. Scope",
    body: (
      <>
        This Privacy Policy explains how {BRAND.name} collects, uses, stores, and shares information when you use
        our website and product. It applies to public pages, account areas, and paid plans.
      </>
    ),
  },
  {
    id: "collect",
    title: "2. Information We Collect",
    body: (
      <ul className="space-y-2">
        <li>Account data: name, email, login provider, and account settings.</li>
        <li>Billing data: plan, credits, payment status, and Stripe customer references.</li>
        <li>Content data: videos and files you upload, clips and exports generated from them.</li>
        <li>Usage data: job status, feature usage, device/browser logs, and diagnostics.</li>
        <li>Support data: messages, issue reports, and files you share with support.</li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "3. How We Use Information",
    body: (
      <ul className="space-y-2">
        <li>Provide and improve clip generation, uploads, processing, and exports.</li>
        <li>Operate billing, credit tracking, fraud prevention, and account security.</li>
        <li>Respond to support requests and service issues.</li>
        <li>Analyze reliability and performance to improve output quality.</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "4. Sharing and Service Providers",
    body: (
      <>
        We do not sell personal data. We share data only with vendors needed to run the service, such as cloud
        hosting, storage, authentication, and payment processing providers. These providers may process data only for
        service operations.
      </>
    ),
  },
  {
    id: "retention",
    title: "5. Retention",
    body: (
      <>
        We keep account and billing records while your account is active and as required for legal, tax, and security
        obligations. We keep uploaded and generated content for service delivery, recovery, and user access unless you
        delete it or request deletion.
      </>
    ),
  },
  {
    id: "choices",
    title: "6. Your Controls",
    body: (
      <ul className="space-y-2">
        <li>Update account data from your settings.</li>
        <li>Request account or data deletion by contacting support.</li>
        <li>Request access/export details for your account data.</li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "7. Cookies and Session Data",
    body: (
      <>
        We use essential cookies/session tokens to keep you signed in, secure your account, and run core product
        flows. We may also use limited diagnostics data for stability and abuse prevention.
      </>
    ),
  },
  {
    id: "security",
    title: "8. Security",
    body: (
      <>
        We use reasonable technical and organizational safeguards to protect data. No method of transmission or
        storage is fully guaranteed secure, so we cannot promise absolute security.
      </>
    ),
  },
  {
    id: "children",
    title: "9. Children",
    body: (
      <>
        {BRAND.name} is not intended for children under 13 (or the minimum age required in your region). If you
        believe a child has provided personal data, contact us and we will review and remove it when appropriate.
      </>
    ),
  },
  {
    id: "changes",
    title: "10. Policy Updates",
    body: (
      <>
        We may update this Privacy Policy as the product evolves. We will publish updates on this page and adjust the
        “Last updated” date.
      </>
    ),
  },
  {
    id: "contact",
    title: "11. Contact",
    body: (
      <>
        Privacy questions can be sent to{" "}
        <a className="text-white/85 hover:text-white" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
];

const TERMS_SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "1. Acceptance",
    body: (
      <>
        By using {BRAND.name}, you agree to these Terms of Service. If you do not agree, do not use the service.
      </>
    ),
  },
  {
    id: "accounts",
    title: "2. Accounts and Access",
    body: (
      <>
        You are responsible for account credentials and activity under your account. Keep your login details secure
        and notify us if you suspect unauthorized access.
      </>
    ),
  },
  {
    id: "content-rights",
    title: "3. Your Content and Permissions",
    body: (
      <>
        You keep ownership of the content you upload. You grant us permission to host, process, transform, and
        deliver that content only as needed to provide {BRAND.name}. You confirm you have the rights required to
        upload and process your content.
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "4. Acceptable Use",
    body: (
      <ul className="space-y-2">
        <li>Do not upload unlawful, infringing, abusive, or malicious content.</li>
        <li>Do not attempt to reverse engineer, disrupt, or abuse the platform.</li>
        <li>Do not use the service to violate third-party rights or platform rules.</li>
      </ul>
    ),
  },
  {
    id: "billing",
    title: "5. Plans, Credits, and Billing",
    body: (
      <>
        Paid plans, credits, and pack pricing are shown on the Pricing page. Stripe handles checkout and payment
        processing. Unless required by law, fees are non-refundable once service credits or processing resources are
        consumed.
      </>
    ),
  },
  {
    id: "availability",
    title: "6. Service Availability",
    body: (
      <>
        We aim for reliable service, but uptime and processing speed are not guaranteed. Features may change as we
        improve quality, reliability, and safety.
      </>
    ),
  },
  {
    id: "ip",
    title: "7. Intellectual Property",
    body: (
      <>
        {BRAND.name}, our software, branding, and product assets are owned by Sakib LLC and protected by applicable
        laws. These Terms do not transfer ownership of our technology to you.
      </>
    ),
  },
  {
    id: "termination",
    title: "8. Suspension and Termination",
    body: (
      <>
        We may suspend or terminate access for violations of these Terms, security risks, fraud, or abuse. You may
        stop using the service at any time.
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "9. Disclaimers",
    body: (
      <>
        The service is provided on an “as is” and “as available” basis. To the fullest extent allowed by law, we
        disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </>
    ),
  },
  {
    id: "liability",
    title: "10. Limitation of Liability",
    body: (
      <>
        To the fullest extent allowed by law, Sakib LLC will not be liable for indirect, incidental, special,
        consequential, or punitive damages, or lost profits, data, or goodwill arising from your use of {BRAND.name}.
      </>
    ),
  },
  {
    id: "contact",
    title: "11. Contact",
    body: (
      <>
        Questions about these Terms can be sent to{" "}
        <a className="text-white/85 hover:text-white" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
];

function SectionBlock({ section }: { section: Section }) {
  return (
    <section id={section.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <h2 className="text-base font-semibold text-white/90">{section.title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-white/70">{section.body}</div>
    </section>
  );
}

export default function LegalDocument({ kind }: { kind: LegalKind }) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Service";
  const subtitle = isPrivacy
    ? "How Orbito handles your data."
    : "Rules for using Orbito responsibly.";
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <section className="relative mx-auto max-w-5xl px-6 pb-20 pt-12">
      <div className="surface relative overflow-hidden p-6 sm:p-8 md:p-10">
        <div className="absolute inset-0">
          <div className="aurora opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
        </div>

        <div className="relative">
          <div className="text-xs text-white/55">{isPrivacy ? "• Privacy" : "• Terms"}</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-white/60">{subtitle}</p>
          <p className="mt-1 text-xs text-white/45">Last updated: {LAST_UPDATED}</p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/65">
            <Link href="/contact" className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 hover:text-white/85">
              Contact support
            </Link>
            <Link href="/pricing" className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 hover:text-white/85">
              Pricing
            </Link>
            <Link href="/" className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 hover:text-white/85">
              Back to home
            </Link>
          </div>

          <div className="mt-8 space-y-4">
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
