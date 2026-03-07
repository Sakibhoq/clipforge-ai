import React from "react";

export default function AuthMixedBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-y-0 left-0 w-[58%] bg-[radial-gradient(980px_620px_at_20%_16%,rgba(155,140,255,0.28),transparent_66%),radial-gradient(900px_560px_at_34%_72%,rgba(70,215,255,0.18),transparent_70%),radial-gradient(760px_520px_at_42%_38%,rgba(53,242,166,0.13),transparent_72%)]" />
      <div className="absolute inset-y-0 right-0 w-[58%] bg-[radial-gradient(980px_620px_at_80%_16%,rgba(255,183,3,0.24),transparent_66%),radial-gradient(900px_560px_at_66%_72%,rgba(251,86,7,0.18),transparent_70%),radial-gradient(760px_520px_at_58%_38%,rgba(58,134,255,0.13),transparent_72%)]" />
      <div className="absolute inset-0 opacity-[0.22]">
        <div className="aurora" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(1050px_640px_at_50%_8%,rgba(255,255,255,0.045),transparent_66%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.16),rgba(0,0,0,0.46))]" />
      <div className="hidden sm:block absolute inset-0 opacity-[0.08] mix-blend-overlay [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px]" />
    </div>
  );
}

