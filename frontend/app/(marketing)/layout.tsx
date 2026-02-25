// frontend/app/(marketing)/layout.tsx
import React from "react";
import Navbar from "@/components/Navbar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative bg-transparent"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Global marketing background (darker base + brighter accent glows + faster motion) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-20] overflow-hidden">
        {/* base */}
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,2,8,0.84),rgba(0,0,0,0.97))]" />

        {/* top bloom + side accents (keep the page dark while highlights stay vivid) */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_680px_at_50%_0%,rgba(255,255,255,0.05),transparent_64%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_12%_18%,rgba(56,130,246,0.3),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_88%_22%,rgba(129,90,255,0.3),transparent_60%)]" />

        {/* animated glow orbs */}
        <div className="absolute inset-0">
          {/* left orb */}
          <div
            className="absolute left-[-12%] top-[6%] h-[560px] w-[560px] rounded-full opacity-[0.96]"
            style={{
              background:
                "radial-gradient(circle at 35% 35%, rgba(56,130,246,0.72), rgba(56,130,246,0.24) 38%, transparent 68%)",
              filter: "blur(22px)",
              mixBlendMode: "screen",
              animation: "orbFloatA 9s ease-in-out infinite",
            }}
          />
          {/* right orb */}
          <div
            className="absolute right-[-14%] top-[10%] h-[620px] w-[620px] rounded-full opacity-[0.92]"
            style={{
              background:
                "radial-gradient(circle at 55% 40%, rgba(129,90,255,0.68), rgba(129,90,255,0.24) 40%, transparent 70%)",
              filter: "blur(24px)",
              mixBlendMode: "screen",
              animation: "orbFloatB 10.5s ease-in-out infinite",
            }}
          />
          {/* bottom orb */}
          <div
            className="absolute left-[18%] bottom-[-22%] hidden h-[760px] w-[760px] rounded-full opacity-[0.86] sm:block"
            style={{
              background:
                "radial-gradient(circle at 45% 45%, rgba(20,184,166,0.62), rgba(20,184,166,0.22) 42%, transparent 72%)",
              filter: "blur(28px)",
              mixBlendMode: "screen",
              animation: "orbFloatC 12s ease-in-out infinite",
            }}
          />
          {/* micro sparkles */}
          <div
            className="absolute left-[14%] top-[28%] h-[220px] w-[220px] rounded-full opacity-[0.72]"
            style={{
              background: "radial-gradient(circle at 40% 40%, rgba(214,238,255,0.34), transparent 65%)",
              filter: "blur(18px)",
              animation: "orbPulse 4.8s ease-in-out infinite",
            }}
          />
          <div
            className="absolute right-[18%] top-[44%] hidden h-[260px] w-[260px] rounded-full opacity-[0.66] sm:block"
            style={{
              background: "radial-gradient(circle at 45% 45%, rgba(225,230,255,0.30), transparent 68%)",
              filter: "blur(20px)",
              animation: "orbPulse 5.6s ease-in-out infinite",
            }}
          />
        </div>

        {/* aurora (existing global class) */}
        <div className="marketing-aurora absolute inset-0 hidden opacity-[0.96] sm:block">
          <div className="aurora" />
        </div>

        {/* subtle grain */}
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")",
            backgroundSize: "180px 180px",
            mixBlendMode: "overlay",
          }}
        />

        {/* Keyframes (Server Component-safe — no styled-jsx) */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes orbFloatA {
                0% { transform: translate3d(0,0,0) scale(1); }
                50% { transform: translate3d(40px,22px,0) scale(1.06); }
                100% { transform: translate3d(0,0,0) scale(1); }
              }
              @keyframes orbFloatB {
                0% { transform: translate3d(0,0,0) scale(1); }
                50% { transform: translate3d(-34px,28px,0) scale(1.05); }
                100% { transform: translate3d(0,0,0) scale(1); }
              }
              @keyframes orbFloatC {
                0% { transform: translate3d(0,0,0) scale(1); }
                50% { transform: translate3d(18px,-26px,0) scale(1.04); }
                100% { transform: translate3d(0,0,0) scale(1); }
              }
              @keyframes orbPulse {
                0%, 100% { opacity: 0.28; transform: scale(0.98); }
                50% { opacity: 0.48; transform: scale(1.05); }
              }
              .marketing-aurora .aurora::before { animation-duration: 7s; }
              .marketing-aurora .aurora::after { animation-duration: 9.5s; }
            `,
          }}
        />
      </div>

      {/* Navbar must be in normal document flow for sticky to work */}
      <Navbar />

      {/* Clip x-overflow HERE (not on the parent that contains sticky) */}
      <main className="relative overflow-x-clip">{children}</main>
    </div>
  );
}
