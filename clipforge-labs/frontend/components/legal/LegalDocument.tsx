import Link from "next/link";
import React from "react";
import { BRAND } from "@/lib/brand";

type LegalKind = "privacy" | "terms";

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const LAST_UPDATED = "February 10, 2026";
const CONTACT_EMAIL = BRAND.supportEmail;

const PRIVACY_SECTIONS: Section[] = [
  {
    id: "overview",
    title: "1. Overview",
    body: (
      <div className="space-y-2">
        <p>
          This Privacy Policy explains how {BRAND.name} (we, us, or our) collects, uses, stores, shares, and
          protects information when you use our website, app, APIs, and related services.
        </p>
        <p>
          By using the services, you agree to the data practices described in this policy. If you do not agree, do not
          use the services.
        </p>
      </div>
    ),
  },
  {
    id: "controller",
    title: "2. Data Controller",
    body: (
      <>
        Sakib LLC is the primary data controller for information covered by this policy. For privacy requests, contact{" "}
        <a className="text-white/85 hover:text-white" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
  {
    id: "scope",
    title: "3. Scope",
    body: (
      <ul className="space-y-2">
        <li>This policy applies to our hosted app, marketing site, support channels, and official APIs.</li>
        <li>This policy does not cover third-party websites, social platforms, or payment pages we do not control.</li>
        <li>Third-party services are governed by their own terms and privacy policies.</li>
      </ul>
    ),
  },
  {
    id: "definitions",
    title: "4. Key Definitions",
    body: (
      <ul className="space-y-2">
        <li>Personal information means information that identifies or can reasonably identify a person.</li>
        <li>Content means files, media, text, metadata, and project material you upload or create in the service.</li>
        <li>Processing means any operation on data, including collection, storage, use, transfer, and deletion.</li>
      </ul>
    ),
  },
  {
    id: "categories",
    title: "5. Categories of Information We Collect",
    body: (
      <ul className="space-y-2">
        <li>Account data: name, email, login provider, and account settings.</li>
        <li>Billing data: plan, credits, invoice status, transaction records, and payment processor references.</li>
        <li>Content data: uploaded media, generated clips, captions, exports, and file metadata.</li>
        <li>Technical data: IP address, browser/device details, request logs, and diagnostics.</li>
        <li>Usage data: feature events, job status, queue actions, and in-product interactions.</li>
        <li>Support and trust data: support messages, attachments, and abuse or fraud review records.</li>
      </ul>
    ),
  },
  {
    id: "account-profile",
    title: "6. Account and Profile Information",
    body: (
      <>
        When you create an account, we collect information needed to authenticate you, provide access, and secure your
        account. You are responsible for keeping your account information accurate and up to date.
      </>
    ),
  },
  {
    id: "billing-payment",
    title: "7. Billing and Payment Information",
    body: (
      <div className="space-y-2">
        <p>
          Billing operations are supported by payment processors. We do not store full payment card numbers on our
          servers.
        </p>
        <p>
          We may store limited payment-related data, such as customer IDs, subscription status, billing interval,
          invoices, and transaction outcomes, to run subscriptions and support.
        </p>
      </div>
    ),
  },
  {
    id: "media-content",
    title: "8. Media and Project Content",
    body: (
      <div className="space-y-2">
        <p>
          We process your uploaded files and generated outputs to provide the core service, including clipping,
          captioning, reframing, and export delivery.
        </p>
        <p>
          You control what content you upload. You should not upload content you are not allowed to use, or sensitive
          information you do not want processed by cloud systems.
        </p>
      </div>
    ),
  },
  {
    id: "technical-usage",
    title: "9. Technical and Usage Data",
    body: (
      <ul className="space-y-2">
        <li>We log request metadata to keep the service stable, secure, and available.</li>
        <li>We track feature usage to understand performance and improve workflows.</li>
        <li>We use error logs and diagnostics to investigate failures and reduce downtime.</li>
      </ul>
    ),
  },
  {
    id: "support-safety",
    title: "10. Support, Safety, and Abuse Signals",
    body: (
      <>
        If you contact support or if an account triggers fraud or abuse checks, we may process related records to
        respond, investigate, enforce our Terms, and protect users, creators, and our platform.
      </>
    ),
  },
  {
    id: "sources",
    title: "11. Where Information Comes From",
    body: (
      <ul className="space-y-2">
        <li>Directly from you during sign-up, uploads, settings, billing actions, and support requests.</li>
        <li>Automatically from your device and browser while using the service.</li>
        <li>From service providers we use for hosting, analytics, authentication, storage, and payments.</li>
        <li>From connected platforms when you explicitly authorize integrations.</li>
      </ul>
    ),
  },
  {
    id: "legal-bases",
    title: "12. Legal Bases for Processing (Where Required)",
    body: (
      <ul className="space-y-2">
        <li>Contract: to provide features you request and run the service.</li>
        <li>Legitimate interests: to secure, improve, and operate our business and platform.</li>
        <li>Legal obligations: to meet tax, accounting, compliance, and lawful request duties.</li>
        <li>Consent: for limited optional activities where consent is required.</li>
      </ul>
    ),
  },
  {
    id: "service-operations",
    title: "13. How We Use Information for Service Operations",
    body: (
      <ul className="space-y-2">
        <li>Authenticate users and manage account access.</li>
        <li>Run media processing workflows and deliver outputs.</li>
        <li>Manage subscriptions, credits, invoices, and billing state.</li>
        <li>Provide support and resolve technical issues.</li>
      </ul>
    ),
  },
  {
    id: "product-improvement",
    title: "14. Product Improvement and Internal Analytics",
    body: (
      <>
        We may use aggregated or de-identified information to evaluate performance, improve quality, plan features, and
        operate our business. We do not treat de-identified data as personal information unless required by law.
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "15. AI and Automated Processing",
    body: (
      <div className="space-y-2">
        <p>
          {BRAND.name} uses automated systems for tasks such as speech timing, caption generation, segment scoring, and
          framing suggestions.
        </p>
        <p>
          AI output can be imperfect. You are responsible for reviewing output before publishing or distributing it.
        </p>
      </div>
    ),
  },
  {
    id: "human-review",
    title: "16. Human Review and Enforcement",
    body: (
      <>
        Authorized personnel may access limited data when needed for support, legal compliance, abuse prevention,
        fraud investigations, security response, or service reliability.
      </>
    ),
  },
  {
    id: "sharing",
    title: "17. Sharing and Disclosure",
    body: (
      <ul className="space-y-2">
        <li>We do not sell personal information for money.</li>
        <li>We disclose information to service providers only as needed to run the service.</li>
        <li>We may disclose information to prevent fraud, enforce Terms, and protect rights and safety.</li>
        <li>We may disclose information when required by law or valid legal process.</li>
      </ul>
    ),
  },
  {
    id: "processors",
    title: "18. Service Providers and Subprocessors",
    body: (
      <>
        We use third-party providers for hosting, storage, authentication, analytics, email, and payments. These
        providers process data under contractual obligations and security controls appropriate for their role.
      </>
    ),
  },
  {
    id: "legal-disclosures",
    title: "19. Legal Requests and Protection of Rights",
    body: (
      <>
        We may disclose data if we reasonably believe disclosure is necessary to comply with law, respond to legal
        requests, detect or investigate fraud, enforce agreements, or protect rights, property, or safety.
      </>
    ),
  },
  {
    id: "business-transfer",
    title: "20. Business Transfers",
    body: (
      <>
        If Sakib LLC is involved in a merger, acquisition, financing, restructuring, or sale of assets, information
        may be transferred as part of that transaction, subject to this policy or a successor policy.
      </>
    ),
  },
  {
    id: "international",
    title: "21. International Data Transfers",
    body: (
      <>
        Our services and providers may process data in multiple countries. Where required by law, we use transfer
        safeguards such as contractual protections and related compliance mechanisms.
      </>
    ),
  },
  {
    id: "cookies",
    title: "22. Cookies and Similar Technologies",
    body: (
      <ul className="space-y-2">
        <li>We use cookies and tokens for login, session continuity, security, and basic product analytics.</li>
        <li>Blocking certain cookies can reduce functionality or prevent login.</li>
        <li>You can control cookies through browser settings, subject to feature limitations.</li>
      </ul>
    ),
  },
  {
    id: "analytics",
    title: "23. Analytics and Diagnostics",
    body: (
      <>
        We collect analytics and diagnostics to monitor uptime, identify bugs, and improve user experience. This may
        include event metrics, performance traces, and error reports.
      </>
    ),
  },
  {
    id: "retention",
    title: "24. Data Retention",
    body: (
      <div className="space-y-2">
        <p>
          We retain data for as long as needed to provide services, maintain account history, perform legitimate
          business operations, and comply with legal obligations.
        </p>
        <p>
          Retention periods vary by data type, legal requirements, fraud prevention needs, and operational backup
          cycles.
        </p>
      </div>
    ),
  },
  {
    id: "deletion-backups",
    title: "25. Deletion, Backups, and Residual Copies",
    body: (
      <>
        When data is deleted, copies may remain in backup systems for a limited period. We may also retain required
        records for legal, accounting, security, abuse prevention, and dispute resolution purposes.
      </>
    ),
  },
  {
    id: "security",
    title: "26. Security Measures",
    body: (
      <ul className="space-y-2">
        <li>We use administrative, technical, and organizational controls designed to protect information.</li>
        <li>Security controls may include encryption in transit, access controls, monitoring, and logging.</li>
        <li>Access to data is limited to authorized personnel and trusted providers with legitimate need.</li>
      </ul>
    ),
  },
  {
    id: "security-no-guarantee",
    title: "27. Security Disclaimer",
    body: (
      <>
        No system can be guaranteed 100% secure. You understand and accept that internet transmissions and cloud
        systems involve risk, and you use the services at your own risk.
      </>
    ),
  },
  {
    id: "rights",
    title: "28. Your Rights and Choices",
    body: (
      <ul className="space-y-2">
        <li>You may request access, correction, or deletion of certain personal information.</li>
        <li>You may request export of certain account data where technically feasible.</li>
        <li>You may object to or request restriction of certain processing where applicable law allows.</li>
        <li>We may need to verify identity and may deny requests as allowed by law.</li>
      </ul>
    ),
  },
  {
    id: "us-state-rights",
    title: "29. U.S. State Privacy Disclosures",
    body: (
      <div className="space-y-2">
        <p>
          Residents of certain U.S. states (for example California, Colorado, Virginia, Connecticut, and Utah) may
          have additional privacy rights under local law.
        </p>
        <p>
          You may exercise eligible rights by contacting us. We may use authorized agents where allowed, subject to
          verification requirements.
        </p>
      </div>
    ),
  },
  {
    id: "do-not-sell",
    title: "30. Sale or Sharing of Personal Information",
    body: (
      <>
        We do not sell personal information for monetary compensation. If laws treat certain analytics disclosures as
        sharing, you may contact us to request applicable opt-out rights.
      </>
    ),
  },
  {
    id: "children",
    title: "31. Children and Minors",
    body: (
      <>
        The services are not directed to children under 13, or a higher minimum age where local law applies. If you
        believe a child provided personal information without authorization, contact us to review and remove it.
      </>
    ),
  },
  {
    id: "sensitive-data",
    title: "32. Sensitive Information",
    body: (
      <>
        Do not upload sensitive personal information unless strictly necessary and legally permitted. We do not intend
        to collect special category data unless it is voluntarily provided in content you submit.
      </>
    ),
  },
  {
    id: "communications",
    title: "33. Service Communications",
    body: (
      <>
        We may send transactional and operational messages, including security notices, billing notices, policy
        updates, and service alerts. These are service-related communications and are not marketing opt-ins.
      </>
    ),
  },
  {
    id: "changes",
    title: "34. Changes to This Privacy Policy",
    body: (
      <>
        We may update this policy from time to time. Material changes will be posted on this page with an updated
        Last updated date, and may be communicated through the product or email when appropriate.
      </>
    ),
  },
  {
    id: "contact",
    title: "35. Contact and Privacy Requests",
    body: (
      <>
        Send privacy questions or rights requests to{" "}
        <a className="text-white/85 hover:text-white" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . We may request additional information to verify identity before completing requests.
      </>
    ),
  },
];

const TERMS_SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    body: (
      <>
        By accessing or using {BRAND.name}, you agree to these Terms of Service, our Privacy Policy, and any posted
        policies referenced in them. If you do not agree, do not use the services.
      </>
    ),
  },
  {
    id: "definitions",
    title: "2. Definitions",
    body: (
      <ul className="space-y-2">
        <li>Services means our website, app, APIs, and related features.</li>
        <li>Content means files, text, media, metadata, and project material you upload or create.</li>
        <li>Output means clips, captions, edits, exports, and generated results produced through the services.</li>
      </ul>
    ),
  },
  {
    id: "eligibility",
    title: "3. Eligibility and Authority",
    body: (
      <>
        You must be legally able to enter a binding contract. If you use the services for a company or organization,
        you represent that you have authority to bind that entity to these Terms.
      </>
    ),
  },
  {
    id: "accounts",
    title: "4. Accounts and Security",
    body: (
      <ul className="space-y-2">
        <li>You are responsible for all activity under your account.</li>
        <li>You must keep login credentials secure and notify us of suspected unauthorized access.</li>
        <li>You must provide accurate registration and billing information.</li>
      </ul>
    ),
  },
  {
    id: "license-access",
    title: "5. Limited License to Use the Services",
    body: (
      <>
        Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access
        and use the services for lawful business or personal use.
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable Use Rules",
    body: (
      <ul className="space-y-2">
        <li>Use the services only for lawful purposes and in compliance with third-party rights.</li>
        <li>Do not attempt to bypass technical limits, payment controls, or security protections.</li>
        <li>Do not interfere with service stability, infrastructure, or other users.</li>
      </ul>
    ),
  },
  {
    id: "prohibited-content",
    title: "7. Prohibited Content and Conduct",
    body: (
      <ul className="space-y-2">
        <li>Do not upload unlawful, infringing, defamatory, abusive, or malicious content.</li>
        <li>Do not use the service for harassment, fraud, impersonation, or rights violations.</li>
        <li>Do not upload content that violates platform rules where you plan to publish output.</li>
      </ul>
    ),
  },
  {
    id: "user-promises",
    title: "8. Your Representations and Warranties",
    body: (
      <ul className="space-y-2">
        <li>You have all rights and permissions needed to upload and process your content.</li>
        <li>Your use of the services and output will comply with law and third-party agreements.</li>
        <li>You are solely responsible for final review before public posting or distribution.</li>
      </ul>
    ),
  },
  {
    id: "content-license",
    title: "9. License You Grant Us for Content",
    body: (
      <div className="space-y-2">
        <p>
          You retain ownership of your content. You grant us a worldwide, non-exclusive, royalty-free license to host,
          copy, process, transform, transmit, and store content as needed to operate, secure, and improve the services
          for your account.
        </p>
        <p>
          This license includes technical rights needed for encoding, transcoding, captioning, clipping, reframing,
          rendering, caching, and delivery of outputs.
        </p>
      </div>
    ),
  },
  {
    id: "generated-output",
    title: "10. Generated Output and AI Limitations",
    body: (
      <>
        Output may be incomplete or inaccurate. We do not guarantee factual accuracy, legal safety, editorial quality,
        or platform compliance of AI-assisted output. You must review output before use.
      </>
    ),
  },
  {
    id: "editorial-responsibility",
    title: "11. Editorial and Legal Responsibility",
    body: (
      <>
        You are solely responsible for publication decisions, rights clearances, disclosures, captions, music rights,
        endorsements, and legal compliance of any content or output you publish.
      </>
    ),
  },
  {
    id: "ip-rights",
    title: "12. Our Intellectual Property",
    body: (
      <>
        The services, software, design, trademarks, and related materials are owned by Sakib LLC or its licensors and
        are protected by intellectual property laws. No rights are granted except as explicitly stated in these Terms.
      </>
    ),
  },
  {
    id: "feedback",
    title: "13. Feedback License",
    body: (
      <>
        If you submit feedback, ideas, or suggestions, you grant us a perpetual, irrevocable, royalty-free license to
        use, modify, and incorporate that feedback into our services without restriction or compensation.
      </>
    ),
  },
  {
    id: "dmca",
    title: "14. Copyright Complaints",
    body: (
      <>
        If you believe content infringes your copyright, contact us with a legally sufficient notice. We may remove or
        disable challenged material, and we may terminate repeat infringers where appropriate.
      </>
    ),
  },
  {
    id: "plans-billing",
    title: "15. Plans, Billing, and Authorization",
    body: (
      <>
        Paid features are offered by subscription plans, credits, or packs. By purchasing, you authorize us and our
        payment processor to charge your selected payment method for recurring and one-time charges.
      </>
    ),
  },
  {
    id: "credits",
    title: "16. Credits and Metering Rules",
    body: (
      <ul className="space-y-2">
        <li>Credits are usage units consumed by supported processing and export actions.</li>
        <li>Credit requirements and metering logic may change over time.</li>
        <li>Credits are non-transferable, non-refundable, and have no cash value unless law requires otherwise.</li>
      </ul>
    ),
  },
  {
    id: "renewal-cancel",
    title: "17. Renewal, Downgrade, and Cancellation",
    body: (
      <>
        Subscriptions renew automatically until canceled. Unless required by law, cancellations take effect at the end
        of the current billing cycle. Downgrades and plan changes may apply in a future cycle.
      </>
    ),
  },
  {
    id: "refunds",
    title: "18. Refund Policy",
    body: (
      <>
        Except where required by law, all fees are final and non-refundable once paid, especially after credits are
        delivered, processing has started, or a billing period has begun.
      </>
    ),
  },
  {
    id: "trials-promos",
    title: "19. Free Trials, Discounts, and Promotions",
    body: (
      <ul className="space-y-2">
        <li>Trials and promotions may be limited by account, email, organization, payment method, or device.</li>
        <li>We may modify or end a promotion at any time unless prohibited by law.</li>
        <li>Abuse of promotions may result in suspension, termination, or charge recovery.</li>
      </ul>
    ),
  },
  {
    id: "taxes",
    title: "20. Taxes",
    body: (
      <>
        You are responsible for applicable taxes, levies, and duties associated with your purchases, except taxes
        based on our net income. Tax amounts may be calculated at checkout where supported.
      </>
    ),
  },
  {
    id: "third-party",
    title: "21. Third-Party Services and Platforms",
    body: (
      <>
        Integrations and publication platforms are controlled by third parties. We are not responsible for third-party
        outages, API changes, moderation decisions, account restrictions, or policy enforcement.
      </>
    ),
  },
  {
    id: "api-automation",
    title: "22. API, Automation, and Technical Limits",
    body: (
      <ul className="space-y-2">
        <li>We may apply rate limits, queue limits, storage limits, and anti-abuse controls.</li>
        <li>We may block or throttle traffic that threatens reliability or security.</li>
        <li>Automated access must comply with our published limits and restrictions.</li>
      </ul>
    ),
  },
  {
    id: "service-changes",
    title: "23. Service Changes and Feature Availability",
    body: (
      <>
        We may add, modify, suspend, or remove features at any time. We do not guarantee that any feature, integration,
        or pricing model will remain available forever.
      </>
    ),
  },
  {
    id: "beta-availability",
    title: "24. Availability and Beta Features",
    body: (
      <>
        Services are provided on an as-available basis. Beta, preview, or experimental features may be unstable,
        changed, or removed without notice and may not be suitable for critical workloads.
      </>
    ),
  },
  {
    id: "suspension",
    title: "25. Suspension Rights",
    body: (
      <>
        We may suspend or limit access immediately for suspected fraud, abuse, non-payment, legal risk, security
        threats, or Terms violations, with or without prior notice where legally permitted.
      </>
    ),
  },
  {
    id: "termination",
    title: "26. Termination",
    body: (
      <>
        We may terminate accounts for repeated violations, serious misconduct, legal requirements, or unresolved
        payment failure. You may stop using the services at any time.
      </>
    ),
  },
  {
    id: "effects",
    title: "27. Effect of Termination",
    body: (
      <ul className="space-y-2">
        <li>Your right to access the services ends when termination becomes effective.</li>
        <li>We may delete or disable access to data after reasonable retention periods.</li>
        <li>Provisions that should survive termination will survive, including payment and liability terms.</li>
      </ul>
    ),
  },
  {
    id: "disclaimers",
    title: "28. Disclaimers",
    body: (
      <>
        To the maximum extent permitted by law, services are provided as-is and as-available. We disclaim all
        warranties, express or implied, including merchantability, fitness for a particular purpose, title, and
        non-infringement.
      </>
    ),
  },
  {
    id: "liability",
    title: "29. Limitation of Liability",
    body: (
      <div className="space-y-2">
        <p>
          To the fullest extent permitted by law, Sakib LLC and its affiliates are not liable for indirect,
          incidental, consequential, special, exemplary, or punitive damages, including lost profits, lost data, lost
          revenue, business interruption, or reputational harm.
        </p>
        <p>
          Our total aggregate liability for any claim related to the services will not exceed the greater of (a) the
          amount you paid us in the 12 months before the claim arose, or (b) USD $100.
        </p>
      </div>
    ),
  },
  {
    id: "indemnity",
    title: "30. Indemnification",
    body: (
      <>
        You agree to defend, indemnify, and hold harmless Sakib LLC, its affiliates, officers, employees, and agents
        from claims, liabilities, losses, and expenses (including legal fees) arising from your content, your use of
        the services, or your violation of these Terms or applicable law.
      </>
    ),
  },
  {
    id: "arbitration",
    title: "31. Dispute Resolution and Arbitration",
    body: (
      <div className="space-y-2">
        <p>
          Before filing a claim, you agree to first contact us and attempt to resolve the dispute informally. If not
          resolved, disputes will be resolved by binding arbitration on an individual basis, except where prohibited by
          law.
        </p>
        <p>
          Either party may seek injunctive or equitable relief in court for intellectual property misuse, unauthorized
          access, or urgent security issues.
        </p>
      </div>
    ),
  },
  {
    id: "class-waiver",
    title: "32. Class Action and Jury Trial Waiver",
    body: (
      <>
        To the extent permitted by law, you and Sakib LLC waive any right to a jury trial and waive participation in
        class actions, class arbitrations, representative actions, or consolidated proceedings.
      </>
    ),
  },
  {
    id: "governing-law",
    title: "33. Governing Law and Venue",
    body: (
      <>
        These Terms are governed by the laws applicable to Sakib LLC, without regard to conflict-of-law principles,
        except where mandatory consumer law provides otherwise.
      </>
    ),
  },
  {
    id: "assignment",
    title: "34. Assignment",
    body: (
      <>
        You may not assign or transfer these Terms without our prior written consent. We may assign these Terms as part
        of a merger, acquisition, reorganization, or sale of assets.
      </>
    ),
  },
  {
    id: "force-majeure",
    title: "35. Force Majeure",
    body: (
      <>
        We are not liable for delays or failures caused by events outside our reasonable control, including internet
        failures, cloud outages, labor disputes, war, terrorism, pandemics, natural disasters, or government action.
      </>
    ),
  },
  {
    id: "severability",
    title: "36. Severability and Waiver",
    body: (
      <>
        If any provision is held unenforceable, the remaining provisions remain in effect. Failure to enforce any
        provision is not a waiver of our right to enforce it later.
      </>
    ),
  },
  {
    id: "entire-agreement",
    title: "37. Entire Agreement",
    body: (
      <>
        These Terms, together with the Privacy Policy and referenced policies, are the entire agreement between you and
        Sakib LLC regarding the services and replace prior agreements on the same subject.
      </>
    ),
  },
  {
    id: "contact",
    title: "38. Contact",
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
    ? "How we collect, use, and protect information."
    : `Rules for using ${BRAND.name} and related services.`;
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
            <Link
              href="/contact"
              className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 hover:text-white/85"
            >
              Contact support
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 hover:text-white/85"
            >
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
