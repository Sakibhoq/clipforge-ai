import React from "react";

export default function AuthMixedBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-0 bg-[radial-gradient(1120px_700px_at_12%_14%,rgba(155,140,255,0.28),transparent_68%),radial-gradient(1120px_700px_at_88%_14%,rgba(255,183,3,0.24),transparent_68%),radial-gradient(980px_620px_at_18%_80%,rgba(70,215,255,0.17),transparent_70%),radial-gradient(980px_620px_at_84%_80%,rgba(251,86,7,0.16),transparent_72%),radial-gradient(980px_620px_at_52%_46%,rgba(58,134,255,0.12),transparent_72%)]" />
      <div className="absolute inset-0 opacity-[0.22]">
        <div className="aurora" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(1050px_640px_at_50%_8%,rgba(255,255,255,0.045),transparent_66%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.16),rgba(0,0,0,0.46))]" />
      <div className="hidden sm:block absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
    </div>
  );
}
