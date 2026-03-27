// frontend/app/(marketing)/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { apiFetch } from "@/lib/api";
import { SocialBrandPill, SocialBrandRow } from "@/components/SocialBrand";

const ORBITO_WHOP_MARKETING_URL = "/whop";

const previewSrc = (name: string) => `/previews/${encodeURIComponent(name)}`;

const GENERATE_PREVIEWS = [
  {
    title: "Real",
    text: "Clean and polished for product videos.",
    src: previewSrc("labs-preview-1.mp4.mp4"),
    aspect: "9:16",
    objectPosition: "center center",
    zoom: 1,
    shiftY: "0%",
  },
  {
    title: "Cartoon",
    text: "Bright and fun for fast social posts.",
    src: previewSrc("labs-preview-2.mp4.mp4"),
    aspect: "16:9",
    objectPosition: "50% 50%",
    zoom: 1,
    shiftY: "0%",
  },
  {
    title: "Anime",
    text: "More energy for stronger hooks.",
    src: previewSrc("labs-preview-3.mp4.mp4"),
    aspect: "9:16",
    objectPosition: "center center",
    zoom: 1,
    shiftY: "0%",
  },
  {
    title: "Comic",
    text: "Bold and clear for story or promo videos.",
    src: previewSrc("labs-preview-4.mp4.mp4"),
    aspect: "9:16",
    objectPosition: "center center",
    zoom: 1,
    shiftY: "0%",
  },
] as const;

const HERO_PREVIEW_CLIPS = [
  previewSrc("Real Vertical Clip #48.mp4"),
  previewSrc("Real Vertical Clip #53.mp4"),
  previewSrc("Real Vertical Clip #58.mp4"),
  previewSrc("Anime Vertical Clip #66.mp4"),
  previewSrc("Anime Vertical Clip #67.mp4"),
  previewSrc("Comic Vertical Clip #70.mp4"),
  previewSrc("Comic Vertical Clip #71.mp4"),
];

const PREVIEW_GALLERY = [
  previewSrc("Real Vertical Clip #48.mp4"),
  previewSrc("Real Vertical Clip #49.mp4"),
  previewSrc("Real Vertical Clip #51.mp4"),
  previewSrc("Real Vertical Clip #53.mp4"),
  previewSrc("Real Vertical Clip #54.mp4"),
  previewSrc("Real Vertical Clip #55.mp4"),
  previewSrc("Real Vertical Clip #56.mp4"),
  previewSrc("Real Vertical Clip #57.mp4"),
  previewSrc("Real Vertical Clip #58.mp4"),
  previewSrc("Real Vertical Clip #61.mp4"),
  previewSrc("Real Vertical Clip #63.mp4"),
  previewSrc("Real Vertical Clip #64.mp4"),
  previewSrc("Real Vertical Clip #65.mp4"),
  previewSrc("Anime Vertical Clip #66.mp4"),
  previewSrc("Anime Vertical Clip #67.mp4"),
  previewSrc("Comic Vertical Clip #70.mp4"),
  previewSrc("Comic Vertical Clip #71.mp4"),
];

const ORBITO_LOGO = previewSrc("Orbito.png");

const HERO_BACKGROUND_CLIPS = [
  { src: previewSrc("Real Vertical Clip #48.mp4"), side: "left", top: "8%", size: "large", tilt: "tilt-left", offset: "1vw", scatterX: "132px", opacity: 0.52 },
  { src: previewSrc("Real Vertical Clip #49.mp4"), side: "right", top: "12%", size: "", tilt: "tilt-right", offset: "2vw", scatterX: "-128px", opacity: 0.48 },
  { src: previewSrc("Real Vertical Clip #51.mp4"), side: "left", top: "28%", size: "", tilt: "tilt-right", offset: "8vw", scatterX: "176px", opacity: 0.46 },
  { src: previewSrc("Real Vertical Clip #53.mp4"), side: "right", top: "34%", size: "large", tilt: "tilt-left", offset: "8vw", scatterX: "-168px", opacity: 0.5 },
  { src: previewSrc("Real Vertical Clip #54.mp4"), side: "left", top: "54%", size: "", tilt: "tilt-left", offset: "3vw", scatterX: "94px", opacity: 0.44 },
  { src: previewSrc("Real Vertical Clip #55.mp4"), side: "right", top: "63%", size: "", tilt: "tilt-right", offset: "11vw", scatterX: "-152px", opacity: 0.42 },
  { src: previewSrc("Real Vertical Clip #56.mp4"), side: "left", top: "76%", size: "large", tilt: "tilt-right", offset: "6vw", scatterX: "148px", opacity: 0.5 },
  { src: previewSrc("Real Vertical Clip #57.mp4"), side: "right", top: "82%", size: "", tilt: "tilt-left", offset: "5vw", scatterX: "-98px", opacity: 0.45 },
] as const;

const WORKS_BACKGROUND_CLIPS = [
  { src: previewSrc("Real Vertical Clip #58.mp4"), side: "left", top: "6%", size: "", tilt: "tilt-left", offset: "12vw", scatterX: "168px", opacity: 0.44 },
  { src: previewSrc("Real Vertical Clip #59.mp4"), side: "right", top: "10%", size: "", tilt: "tilt-right", offset: "4vw", scatterX: "-84px", opacity: 0.44 },
  { src: previewSrc("Real Vertical Clip #60.mp4"), side: "left", top: "24%", size: "large", tilt: "tilt-right", offset: "7vw", scatterX: "136px", opacity: 0.5 },
  { src: previewSrc("Real Vertical Clip #61.mp4"), side: "right", top: "28%", size: "", tilt: "tilt-left", offset: "11vw", scatterX: "-168px", opacity: 0.42 },
  { src: previewSrc("Real Vertical Clip #62.mp4"), side: "left", top: "42%", size: "", tilt: "tilt-left", offset: "5vw", scatterX: "102px", opacity: 0.42 },
  { src: previewSrc("Real Vertical Clip #63.mp4"), side: "right", top: "48%", size: "large", tilt: "tilt-right", offset: "10vw", scatterX: "-184px", opacity: 0.5 },
  { src: previewSrc("Real Vertical Clip #64.mp4"), side: "left", top: "60%", size: "", tilt: "tilt-right", offset: "13vw", scatterX: "190px", opacity: 0.44 },
  { src: previewSrc("Real Vertical Clip #65.mp4"), side: "right", top: "66%", size: "", tilt: "tilt-left", offset: "6vw", scatterX: "-118px", opacity: 0.42 },
  { src: previewSrc("Anime Vertical Clip #66.mp4"), side: "left", top: "76%", size: "large", tilt: "tilt-left", offset: "8vw", scatterX: "148px", opacity: 0.5 },
  { src: previewSrc("Anime Vertical Clip #67.mp4"), side: "right", top: "82%", size: "", tilt: "tilt-right", offset: "14vw", scatterX: "-176px", opacity: 0.44 },
  { src: previewSrc("Comic Vertical Clip #70.mp4"), side: "left", top: "88%", size: "", tilt: "tilt-right", offset: "3vw", scatterX: "86px", opacity: 0.42 },
  { src: previewSrc("Comic Vertical Clip #71.mp4"), side: "right", top: "92%", size: "large", tilt: "tilt-left", offset: "7vw", scatterX: "-134px", opacity: 0.5 },
] as const;

type MeResponse = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
  trial_used: boolean;
};

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const items = Array.from(el.querySelectorAll("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.14 }
    );

    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return ref;
}

function H({ children }: { children: React.ReactNode }) {
  return <span className="grad-text inline-block pb-[0.08em] font-semibold tracking-tight">{children}</span>;
}

function HoverSheen() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 hidden opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:block"
        style={{
          background:
            "radial-gradient(120px 120px at 20% 25%, rgba(167,139,250,0.18), transparent 60%), radial-gradient(140px 140px at 80% 30%, rgba(125,211,252,0.15), transparent 62%), radial-gradient(140px 140px at 55% 85%, rgba(45,212,191,0.12), transparent 62%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)",
        }}
      />
    </>
  );
}

function LandingFX() {
  const orbs = useMemo(
    () => [
      { x: "10%", y: "10%", s: 560, blur: 60, a: 0.22, d: 0.0, t: 22, h: 250 },
      { x: "78%", y: "12%", s: 520, blur: 58, a: 0.2, d: 1.1, t: 24, h: 210 },
      { x: "6%", y: "38%", s: 620, blur: 70, a: 0.18, d: 0.8, t: 28, h: 225 },
      { x: "86%", y: "42%", s: 680, blur: 74, a: 0.18, d: 1.8, t: 30, h: 290 },
      { x: "16%", y: "78%", s: 740, blur: 90, a: 0.15, d: 1.6, t: 36, h: 240 },
      { x: "82%", y: "82%", s: 820, blur: 96, a: 0.12, d: 3.2, t: 38, h: 205 },
    ],
    []
  );

  return (
    <>
      <style>{`
        @keyframes orbDrift {
          0% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
          50% { transform: translate3d(16px, 10px, 0) scale(1.06); }
          100% { transform: translate3d(-12px, -12px, 0) scale(0.98); }
        }
        @keyframes orbPulse {
          0% { opacity: 0; }
          16% { opacity: var(--orb-a); }
          60% { opacity: calc(var(--orb-a) * 0.92); }
          100% { opacity: 0; }
        }
        @keyframes washFloat {
          0% { transform: translate3d(-2%, -1%, 0) scale(1.04); opacity: 0.14; }
          100% { transform: translate3d(2.5%, 1.5%, 0) scale(1.12); opacity: 0.22; }
        }
        @keyframes lineShift {
          0% { background-position: 0% 50%; }
          100% { background-position: 320% 50%; }
        }
        @keyframes lineHue {
          0% { filter: hue-rotate(0deg) saturate(1); }
          50% { filter: hue-rotate(55deg) saturate(1.14); }
          100% { filter: hue-rotate(0deg) saturate(1); }
        }
        @keyframes flowDriftA {
          0%, 100% { transform: translate3d(-26px, 8px, 0); }
          50% { transform: translate3d(34px, -16px, 0); }
        }
        @keyframes flowDriftB {
          0%, 100% { transform: translate3d(20px, -8px, 0); }
          50% { transform: translate3d(-32px, 18px, 0); }
        }
        @keyframes flowDriftC {
          0%, 100% { transform: translate3d(10px, 3px, 0); }
          50% { transform: translate3d(-24px, -12px, 0); }
        }
        @keyframes flowPan {
          0%, 100% { transform: translate3d(-3%, 28px, 0) scale(1.02); }
          50% { transform: translate3d(3%, 6px, 0) scale(1.03); }
        }
        @keyframes flowPulse {
          0%, 100% { opacity: 0.88; }
          50% { opacity: 1; }
        }
        @keyframes previewGlow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 0 26px rgba(251,146,60,0.12); }
          50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 0 36px rgba(125,211,252,0.14), 0 0 48px rgba(251,146,60,0.16); }
        }
        @keyframes previewFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -14px, 0) scale(1.02); }
        }
        @keyframes sideScatterFloat {
          0%, 100% { transform: translate3d(var(--scatter-x, 0px), 0, 0) rotate(var(--tilt, 0deg)) scale(1); }
          50% { transform: translate3d(calc(var(--scatter-x, 0px) + var(--drift-x, 0px)), -18px, 0) rotate(calc(var(--tilt, 0deg) + 1.2deg)) scale(1.02); }
        }
        @keyframes logoShootA {
          0% { transform: translate3d(-24vw, -40px, 0) scale(0.74) rotate(-18deg); opacity: 0; }
          8% { opacity: 0.98; }
          82% { opacity: 0.98; }
          100% { transform: translate3d(122vw, 36px, 0) scale(1.08) rotate(10deg); opacity: 0; }
        }
        @keyframes logoShootB {
          0% { transform: translate3d(112vw, -60px, 0) scale(0.78) rotate(16deg); opacity: 0; }
          10% { opacity: 0.98; }
          80% { opacity: 0.98; }
          100% { transform: translate3d(-28vw, 48px, 0) scale(1.02) rotate(-8deg); opacity: 0; }
        }
        @keyframes logoShootC {
          0% { transform: translate3d(-18vw, 60px, 0) scale(0.7) rotate(-8deg); opacity: 0; }
          12% { opacity: 0.98; }
          78% { opacity: 0.98; }
          100% { transform: translate3d(118vw, -24px, 0) scale(1.1) rotate(14deg); opacity: 0; }
        }
        @keyframes panelBreath {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 18px 46px rgba(0,0,0,0.28); }
          50% { transform: translateY(-4px); box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 26px 64px rgba(0,0,0,0.36), 0 0 26px rgba(96,165,250,0.08); }
        }
        .orbito-grain {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
          background-size: 180px 180px;
          mix-blend-mode: overlay;
        }
        .orbito-hero-rail {
          background: linear-gradient(90deg, rgba(125,211,252,0.92), rgba(167,139,250,0.9), rgba(251,146,60,0.92), rgba(45,212,191,0.9), rgba(125,211,252,0.92));
          background-size: 240% 100%;
          animation: lineShift 5.8s linear infinite;
        }
        .orbito-top-rail {
          background: linear-gradient(90deg, rgba(125,211,252,0.95), rgba(167,139,250,0.88), rgba(251,146,60,0.92), rgba(45,212,191,0.88), rgba(125,211,252,0.95));
          background-size: 260% 100%;
          animation: lineShift 6.2s linear infinite, lineHue 11s ease-in-out infinite;
        }
        .orbito-card-rail {
          left: 50%;
          transform: translateX(-50%);
          width: 80%;
        }
        .orbito-flow-scene {
          animation: lineHue 7.2s ease-in-out infinite, flowPan 8.6s ease-in-out infinite, flowPulse 5.2s ease-in-out infinite;
          will-change: transform, filter;
        }
        .orbito-flow-a,
        .orbito-flow-b,
        .orbito-flow-c {
          transform-box: fill-box;
          transform-origin: center;
        }
        .orbito-flow-a { animation: flowDriftA 6.8s ease-in-out infinite; }
        .orbito-flow-b { animation: flowDriftB 7.8s ease-in-out infinite; }
        .orbito-flow-c { animation: flowDriftC 8.8s ease-in-out infinite; }
        @keyframes logoSpin {
          0% { transform: translate(-50%, -50%) scale(0.98) rotate(-6deg); opacity: 0.42; }
          50% { transform: translate(-50%, -50%) scale(1.06) rotate(6deg); opacity: 0.78; }
          100% { transform: translate(-50%, -50%) scale(0.98) rotate(-6deg); opacity: 0.42; }
        }
        .orbito-logo-float {
          animation: logoSpin 10.5s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(129,140,248,0.18)) drop-shadow(0 0 26px rgba(251,146,60,0.16));
          will-change: transform, opacity;
        }
        .orbito-logo-shooting {
          position: absolute;
          left: -16vw;
          width: 220px;
          height: 220px;
          animation: logoShootA 5.2s linear infinite;
          filter: drop-shadow(0 0 42px rgba(129,140,248,1)) drop-shadow(0 0 76px rgba(251,146,60,0.92));
          opacity: 0;
          pointer-events: none;
          will-change: transform, opacity;
        }
        .orbito-logo-core {
          display: flex;
          height: 100%;
          width: 100%;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.38), rgba(129,140,248,0.20) 38%, rgba(17,24,39,0.06) 72%, rgba(17,24,39,0));
        }
        .orbito-logo-core img {
          height: 78%;
          width: 78%;
          object-fit: contain;
          filter: drop-shadow(0 0 18px rgba(255,255,255,0.44));
        }
        .orbito-logo-shooting::before {
          content: "";
          position: absolute;
          left: -420px;
          top: 50%;
          width: 470px;
          height: 12px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(125,211,252,0), rgba(125,211,252,0.62), rgba(167,139,250,0.78), rgba(251,146,60,0.98));
          filter: blur(8px);
        }
        .orbito-logo-shooting.delay-1 { animation-delay: 0s; top: 12%; animation-name: logoShootA; }
        .orbito-logo-shooting.delay-2 { animation-delay: 0.9s; top: 24%; animation-name: logoShootB; }
        .orbito-logo-shooting.delay-3 { animation-delay: 1.8s; top: 40%; animation-name: logoShootC; }
        .orbito-logo-shooting.delay-4 { animation-delay: 2.7s; top: 56%; animation-name: logoShootB; }
        .orbito-logo-shooting.delay-5 { animation-delay: 3.6s; top: 70%; animation-name: logoShootA; }
        .orbito-logo-shooting.delay-6 { animation-delay: 4.5s; top: 82%; animation-name: logoShootC; }
        .orbito-preview-shell {
          animation: previewGlow 5.2s ease-in-out infinite, panelBreath 8.5s ease-in-out infinite;
        }
        .orbito-preview-item {
          width: 220px;
          height: 392px;
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(7,9,18,0.85);
          box-shadow: 0 22px 60px rgba(0,0,0,0.45);
          animation: previewFloat 8.5s ease-in-out infinite;
        }
        .orbito-preview-item.large {
          width: 260px;
          height: 462px;
        }
        .orbito-preview-item.tilt-left {
          transform: rotate(-2deg);
        }
        .orbito-preview-item.tilt-right {
          transform: rotate(2deg);
        }
        .orbito-side-stack {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .orbito-side-item {
          --tilt: 0deg;
          --drift-x: 0px;
          --scatter-x: 0px;
          width: 186px;
          height: 332px;
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(7,9,18,0.85);
          box-shadow: 0 22px 60px rgba(0,0,0,0.38);
          animation: sideScatterFloat 9.5s ease-in-out infinite;
        }
        .orbito-side-item.large {
          width: 214px;
          height: 380px;
        }
        .orbito-side-item video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .orbito-side-item.tilt-left {
          --tilt: -4.5deg;
          --drift-x: 9px;
        }
        .orbito-side-item.tilt-right {
          --tilt: 4.5deg;
          --drift-x: -11px;
        }
        .orbito-preview-item video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .orbito-breath {
          animation: panelBreath 8.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .orbito-anim,
          .orbito-hero-rail,
          .orbito-top-rail,
          .orbito-preview-shell,
          .orbito-breath,
          .orbito-logo-shooting,
          .orbito-side-item {
            animation: none !important;
          }
        }
        @media (max-width: 900px), (pointer: coarse) {
          .orbito-fx-heavy {
            display: none !important;
          }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="orbito-anim orbito-fx-heavy absolute -inset-[45%] blur-3xl"
          style={{
            background:
              "radial-gradient(900px 520px at 18% 18%, rgba(56,130,246,0.48), transparent 64%), radial-gradient(920px 540px at 82% 22%, rgba(129,90,255,0.44), transparent 64%), radial-gradient(980px 580px at 55% 88%, rgba(20,184,166,0.38), transparent 66%)",
            mixBlendMode: "screen",
            opacity: 0.22,
            animation: "washFloat 16s ease-in-out infinite alternate",
            willChange: "transform, opacity",
          }}
        />

        {orbs.map((o, i) => (
          <div
            key={i}
            className="orbito-anim orbito-fx-heavy absolute rounded-full"
            style={{
              left: o.x,
              top: o.y,
              width: o.s,
              height: o.s,
              opacity: 0,
              ["--orb-a" as any]: o.a,
              background: `radial-gradient(circle at 40% 35%, hsla(${o.h}, 96%, 52%, 0.94), transparent 56%), radial-gradient(circle at 70% 55%, hsla(${(o.h + 110) % 360}, 92%, 46%, 0.82), transparent 58%), radial-gradient(circle at 45% 70%, hsla(${(o.h + 220) % 360}, 88%, 40%, 0.66), transparent 60%)`,
              mixBlendMode: "screen",
              filter: `blur(${o.blur}px)`,
              animation: `orbDrift ${o.t}s ease-in-out infinite, orbPulse ${o.t + 10}s ease-in-out infinite`,
              animationDelay: `${o.d}s, ${o.d * 0.8}s`,
              transform: "translateZ(0)",
              willChange: "transform, opacity",
            }}
          />
        ))}

        <div className="absolute inset-0 opacity-[0.12] orbito-grain orbito-fx-heavy" />
      </div>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1050px_650px_at_50%_10%,rgba(255,255,255,0.03),transparent_66%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_12%_18%,rgba(56,130,246,0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_86%_22%,rgba(129,90,255,0.12),transparent_58%)]" />
        <div className="absolute inset-0 opacity-[0.72] hidden sm:block">
          <div className="aurora" />
        </div>
      </div>
    </>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
      <span>{children}</span>
    </div>
  );
}

function FlowLines() {
  return (
    <div className="relative left-1/2 h-[380px] w-screen -translate-x-1/2 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 280px at 50% 48%, rgba(167,139,250,0.16), transparent 72%), radial-gradient(960px 240px at 18% 52%, rgba(125,211,252,0.14), transparent 70%), radial-gradient(960px 220px at 82% 52%, rgba(251,191,36,0.12), transparent 72%)",
        }}
      />
      <div className="orbito-flow-scene absolute inset-0 opacity-[0.9]">
        <svg viewBox="0 0 1800 320" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="orb-line-a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1800" y2="0">
              <stop offset="0%" stopColor="#7dd3fc">
                <animate attributeName="stop-color" values="#7dd3fc;#45d4bf;#7dd3fc" dur="6.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="35%" stopColor="#a78bfa">
                <animate attributeName="stop-color" values="#a78bfa;#fb7185;#a78bfa" dur="5.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="70%" stopColor="#fb7185">
                <animate attributeName="stop-color" values="#fb7185;#facc15;#fb7185" dur="5.8s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#facc15">
                <animate attributeName="stop-color" values="#facc15;#7dd3fc;#facc15" dur="7.2s" repeatCount="indefinite" />
              </stop>
              <animate attributeName="x1" values="0;220;0" dur="7.2s" repeatCount="indefinite" />
              <animate attributeName="x2" values="1800;2020;1800" dur="7.2s" repeatCount="indefinite" />
            </linearGradient>
            <linearGradient id="orb-line-b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1800" y2="0">
              <stop offset="0%" stopColor="#fb7185">
                <animate attributeName="stop-color" values="#fb7185;#facc15;#fb7185" dur="6.2s" repeatCount="indefinite" />
              </stop>
              <stop offset="45%" stopColor="#fb7185">
                <animate attributeName="stop-color" values="#fb7185;#a78bfa;#fb7185" dur="5.2s" repeatCount="indefinite" />
              </stop>
              <stop offset="75%" stopColor="#a78bfa">
                <animate attributeName="stop-color" values="#a78bfa;#7dd3fc;#a78bfa" dur="6.7s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#facc15">
                <animate attributeName="stop-color" values="#facc15;#45d4bf;#facc15" dur="7s" repeatCount="indefinite" />
              </stop>
              <animate attributeName="x1" values="0;-220;0" dur="6.8s" repeatCount="indefinite" />
              <animate attributeName="x2" values="1800;1580;1800" dur="6.8s" repeatCount="indefinite" />
            </linearGradient>
            <linearGradient id="orb-line-c" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1800" y2="0">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="50%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <filter id="orb-line-glow">
              <feGaussianBlur stdDeviation="5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="orbito-flow-a">
            <path
              d="M-120 168 C 180 98, 460 250, 760 170 S 1380 92, 1920 156"
              stroke="url(#orb-line-a)"
              strokeWidth="8"
              fill="none"
              filter="url(#orb-line-glow)"
              opacity="0.96"
              strokeLinecap="round"
            />
            <animateTransform attributeName="transform" type="translate" values="-26 8;34 -16;-26 8" dur="8s" repeatCount="indefinite" />
          </g>
          <g className="orbito-flow-b">
            <path
              d="M-100 230 C 160 282, 500 88, 860 148 S 1500 262, 1920 206"
              stroke="url(#orb-line-b)"
              strokeWidth="7"
              fill="none"
              filter="url(#orb-line-glow)"
              opacity="0.9"
              strokeLinecap="round"
            />
            <animateTransform attributeName="transform" type="translate" values="20 -8;-32 18;20 -8" dur="9.2s" repeatCount="indefinite" />
          </g>
          <g className="orbito-flow-c">
            <path
              d="M-120 192 C 180 152, 500 206, 860 196 S 1440 170, 1940 188"
              stroke="url(#orb-line-c)"
              strokeWidth="4"
              fill="none"
              opacity="0.65"
              strokeLinecap="round"
            />
            <animateTransform attributeName="transform" type="translate" values="10 3;-24 -12;10 3" dur="10.5s" repeatCount="indefinite" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function HeroFlowBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 hidden md:block">
      <div className="absolute inset-x-[-8%] top-[26%] h-[42%] opacity-[0.44]">
        <svg viewBox="0 0 1200 280" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="hero-line-a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="40%" stopColor="#a78bfa" />
              <stop offset="75%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>
            <linearGradient id="hero-line-b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="40%" stopColor="#fb7185" />
              <stop offset="75%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
            <filter id="hero-line-glow">
              <feGaussianBlur stdDeviation="3.6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g>
            <path
              d="M-30 118 C 150 76, 370 174, 620 122 S 980 86, 1230 118"
              stroke="url(#hero-line-a)"
              strokeWidth="4"
              fill="none"
              filter="url(#hero-line-glow)"
              strokeLinecap="round"
              opacity="0.95"
            />
            <animateTransform attributeName="transform" type="translate" values="-16 8;20 -10;-16 8" dur="6.1s" repeatCount="indefinite" />
          </g>

          <g>
            <path
              d="M-20 162 C 200 200, 380 80, 650 132 S 1000 190, 1220 170"
              stroke="url(#hero-line-b)"
              strokeWidth="3.5"
              fill="none"
              filter="url(#hero-line-glow)"
              strokeLinecap="round"
              opacity="0.88"
            />
            <animateTransform attributeName="transform" type="translate" values="14 -6;-20 12;14 -6" dur="7s" repeatCount="indefinite" />
          </g>

          <g>
            <path
              d="M-10 140 C 200 132, 420 146, 660 146 S 980 142, 1220 148"
              stroke="url(#hero-line-a)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              opacity="0.58"
            />
            <animateTransform attributeName="transform" type="translate" values="6 4;-12 -8;6 4" dur="8.4s" repeatCount="indefinite" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function HeroVisual() {
  const [heroPreviewIndex, setHeroPreviewIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroPreviewIndex((value) => (value + 1) % HERO_PREVIEW_CLIPS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="group surface-soft relative hidden overflow-hidden rounded-[28px] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.34)] md:block md:p-6">
      <HeroFlowBackdrop />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(460px_300px_at_18%_38%,rgba(125,211,252,0.12),transparent_74%), radial-gradient(520px_320px_at_84%_36%,rgba(251,146,60,0.12),transparent_76%)",
        }}
      />

      <div className="relative z-10 pt-6">
        <div className="flex items-center justify-between text-xs text-white/58">
          <span>Live studio preview</span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
            active
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[22px] border border-white/12 bg-white/[0.04] p-4">
            <div className="text-xs text-white/58">Clip mode</div>
            <div className="mt-2 text-xl font-semibold text-white/92">Upload once. Approve fast.</div>
            <div className="mt-3 space-y-2 text-xs text-white/74">
              {[
                "Find strong hooks automatically",
                "Pick your best moments in one pass",
                "Post to every channel from one queue",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/12 bg-black/70 shadow-[0_22px_54px_rgba(0,0,0,0.36)]">
            <div className="relative h-[340px] w-full [contain:layout_paint]">
              {HERO_PREVIEW_CLIPS.map((src, index) => (
                <video
                  key={src}
                  src={src}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden={index !== heroPreviewIndex}
                  className="absolute inset-0 h-full w-full transition-opacity duration-500 will-change-[opacity]"
                  style={{
                    objectFit: "cover",
                    objectPosition: "center center",
                    transform: "scale(1.02) translateZ(0)",
                    opacity: index === heroPreviewIndex ? 1 : 0,
                    zIndex: index === heroPreviewIndex ? 1 : 0,
                    backfaceVisibility: "hidden",
                  }}
                />
              ))}
            </div>
            <div className="border-t border-white/10 px-3 py-2 text-xs text-white/70">
              One workflow. Clip, generate, then publish.
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-[11px] text-white/68 sm:grid-cols-3">
          {[
            { k: "Queue", v: "3 clips ready" },
            { k: "Channels", v: "TikTok • Reels • Shorts" },
            { k: "Turnaround", v: "Minutes, not hours" },
          ].map((item) => (
            <div key={item.k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <span className="text-white/45">{item.k}</span>
              <span className="mx-2 text-white/25">•</span>
              <span className="text-white/80">{item.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenerateStage({
  previewIndex,
  setPreviewIndex,
}: {
  previewIndex: number;
  setPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  const activePreview = GENERATE_PREVIEWS[previewIndex] || GENERATE_PREVIEWS[0];

  return (
    <div className="orbito-breath relative overflow-hidden rounded-3xl border border-orange-300/50 bg-[linear-gradient(120deg,rgba(255,183,3,0.18),rgba(251,86,7,0.14),rgba(96,165,250,0.14))] p-[1px] shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_24px_rgba(251,86,7,0.16),0_0_24px_rgba(96,165,250,0.12)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70 blur-2xl"
        style={{
          background:
            "conic-gradient(from 120deg, rgba(255,183,3,0.24), rgba(251,86,7,0.20), rgba(96,165,250,0.20), rgba(255,183,3,0.24))",
        }}
      />
      <div className="relative rounded-[22px] bg-[linear-gradient(140deg,rgba(16,12,8,0.88),rgba(8,10,20,0.86))] p-6 md:p-7">
        <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-start">
          <div>
            <SectionKicker>Need fresh clips too?</SectionKicker>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Generate them.
            </h2>
            <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
              Type it once. See one preview at a time. Keep the one that feels right.
            </p>

            <div className="mt-5 grid gap-3">
              {[
                "Write one simple prompt",
                "Watch styles rotate live",
                "Keep your favorite and post it",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/12 bg-[linear-gradient(140deg,rgba(255,183,3,0.08),rgba(251,86,7,0.06),rgba(96,165,250,0.08))] px-4 py-3 text-sm text-white/78"
                >
                  <span className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-300/80 shadow-[0_0_14px_rgba(52,211,153,0.65)]" />
                    <span>{item}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="https://app.orbito.cc/app/labs/app/generate" className="btn-clipforge">
                Open Generate
              </Link>
              <Link href="/pricing" className="btn-ghost">
                View pricing
              </Link>
            </div>
          </div>

          <div className="group surface-soft orbito-preview-shell relative overflow-hidden rounded-[26px] p-4 transition-all duration-300 hover:border-white/18 hover:bg-white/[0.04] md:min-h-[680px]">
            <HoverSheen />
            <div className="relative">
              <div className="flex items-center justify-between text-xs text-white/58">
                <span>{activePreview.title} preview</span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                  fixed 9:16 frame
                </span>
              </div>
              <div className="orbito-top-rail mt-3 h-[3px] rounded-full opacity-90" />

              <div className="mt-4 mx-auto flex w-full max-w-[360px] items-center justify-center">
                <div className="relative flex h-[520px] w-full max-w-[292px] flex-none items-center justify-center overflow-hidden rounded-[24px] border border-white/12 bg-black/75 [contain:layout_paint]">
                  {GENERATE_PREVIEWS.map((preview, index) => {
                    const active = index === previewIndex;
                    return (
                      <video
                        key={preview.title}
                        src={preview.src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden={!active}
                        className="absolute inset-0 h-full w-full transition-opacity duration-500 will-change-[opacity]"
                        style={{
                          objectFit: "cover",
                          objectPosition: preview.objectPosition,
                          transform: `translateY(${preview.shiftY}) scale(${preview.zoom})`,
                          opacity: active ? 1 : 0,
                          zIndex: active ? 1 : 0,
                          backfaceVisibility: "hidden",
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 min-h-[84px]">
                <div className="text-lg font-semibold text-white/90">{activePreview.title} style</div>
                <div className="mt-1 text-sm leading-relaxed text-white/66">{activePreview.text}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GENERATE_PREVIEWS.map((preview, index) => {
                  const active = index === previewIndex;
                  return (
                    <button
                      key={preview.title}
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className={[
                        "rounded-xl border px-3 py-2 text-left text-xs transition-all",
                        active
                          ? "border-orange-300/50 bg-orange-300/[0.12] text-white"
                          : "border-white/10 bg-white/[0.03] text-white/62 hover:border-white/20 hover:text-white/82",
                      ].join(" ")}
                    >
                      {preview.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const revealRef = useReveal();

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      try {
        const meData = await apiFetch<MeResponse>("/auth/me", { method: "GET" });
        if (!cancelled) setMe(meData);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPreviewIndex((value) => (value + 1) % GENERATE_PREVIEWS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const trialLocked = Boolean(me?.trial_used);

  const startTrialCta = useMemo(
    () => (className: string) => {
      if (meLoading) {
        return (
          <button
            type="button"
            disabled
            className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            Checking trial…
          </button>
        );
      }
      if (trialLocked) {
        return (
          <button
            type="button"
            disabled
            className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
            title="Your free trial has already been used. Upgrade to a paid plan."
          >
            Trial already used
          </button>
        );
      }
      return (
        <a href="/start-trial" className={className}>
          Start free
        </a>
      );
    },
    [meLoading, trialLocked]
  );

  const footerLinks = useMemo(
    () => [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-of-service" },
    ],
    []
  );

  return (
    <div ref={revealRef as any} className="relative bg-transparent [overflow-x:clip]">
      <LandingFX />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 z-[120] hidden overflow-visible min-[1180px]:block"
        style={{ top: "40px", bottom: "40px" }}
      >
        <div className="orbito-logo-shooting delay-1">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
        <div className="orbito-logo-shooting delay-2">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
        <div className="orbito-logo-shooting delay-3">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
        <div className="orbito-logo-shooting delay-4">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
        <div className="orbito-logo-shooting delay-5">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
        <div className="orbito-logo-shooting delay-6">
          <span className="orbito-logo-core"><img src={ORBITO_LOGO} alt="" /></span>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 [padding-bottom:calc(env(safe-area-inset-bottom)+5rem)]">
        <section className="relative isolate">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-2 -bottom-24 z-0 hidden overflow-visible min-[1650px]:block"
          >
            {HERO_BACKGROUND_CLIPS.map((item, idx) => (
              <div
                key={`${item.src}-${idx}`}
                className={["orbito-side-item absolute", item.size, item.tilt].filter(Boolean).join(" ")}
                style={{
                  top: item.top,
                  left: item.side === "left" ? item.offset : undefined,
                  right: item.side === "right" ? item.offset : undefined,
                  animationDelay: `${idx * 0.45}s`,
                  opacity: item.opacity,
                  ["--scatter-x" as any]: item.scatterX,
                }}
              >
                <video src={item.src} autoPlay loop muted playsInline preload="metadata" />
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[6%] z-0 hidden opacity-[0.72] sm:block">
            <FlowLines />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[6%] z-0 hidden h-[140px] w-[140px] md:block"
          >
            <img src={ORBITO_LOGO} alt="" className="orbito-logo-float absolute left-1/2 top-1/2 h-full w-full" />
          </div>

          <div data-reveal className="reveal relative z-10">
            <div className="surface-soft relative overflow-hidden rounded-[32px] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(125,211,252,0.20),0_0_44px_rgba(251,146,60,0.14)] sm:p-7 md:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(960px_560px_at_20%_18%,rgba(255,183,3,0.10),transparent_68%), radial-gradient(860px_520px_at_82%_22%,rgba(136,120,255,0.12),transparent_70%), radial-gradient(820px_520px_at_50%_100%,rgba(70,215,255,0.10),transparent_72%)",
                }}
              />

              <div className="relative grid gap-8 md:grid-cols-[1.02fr_0.98fr] md:items-center">
                <div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-1.5 py-1 text-[12px] text-white/75">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                    <span className="whitespace-nowrap">Long videos in. Short clips out.</span>
                    <SocialBrandPill platform="youtube" compact className="-mr-0.5" />
                  </div>

                  <h1 className="mt-5 max-w-3xl pb-2 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-[5.4rem]">
                    <span className="block">Stop editing.</span>
                    <span className="mt-1 block">
                      Start <H>making clips that pay</H>
                    </span>
                  </h1>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
                    Upload one long video. Orbito finds the best moments, turns them into short posts, and gives you more chances to earn with Whop.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    {startTrialCta("btn-orbito-cta")}
                    <Link href={ORBITO_WHOP_MARKETING_URL} className="btn-whop">
                      Get paid with <span className="whop-word">Whop</span>
                    </Link>
                    <Link href="/pricing" className="btn-ghost">
                      View pricing
                    </Link>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <SocialBrandRow platforms={["youtube", "tiktok", "reels", "shorts"]} compact />
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/64">
                    Upload once. Pick the clips. Post everywhere.
                    <span className="text-white/40"> Then open Generate when you want fresh footage too.</span>
                  </div>
                </div>

                <HeroVisual />
              </div>
            </div>
          </div>
        </section>
        <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-14 bottom-[34rem] z-0 hidden overflow-visible min-[1650px]:block"
        >
          {WORKS_BACKGROUND_CLIPS.map((item, idx) => (
            <div
              key={`${item.src}-${idx}`}
              className={["orbito-side-item absolute", item.size, item.tilt].filter(Boolean).join(" ")}
              style={{
                top: item.top,
                left: item.side === "left" ? item.offset : undefined,
                right: item.side === "right" ? item.offset : undefined,
                animationDelay: `${idx * 0.45}s`,
                opacity: item.opacity,
                ["--scatter-x" as any]: item.scatterX,
              }}
            >
              <video src={item.src} autoPlay loop muted playsInline preload="metadata" />
            </div>
          ))}
        </div>
        <section id="how-it-works" className="relative pt-10 sm:pt-12">
          <div data-reveal className="reveal">
            <SectionKicker>How it works</SectionKicker>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white/94 sm:text-3xl md:text-4xl">
              One upload. More clips. Better odds.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/68 sm:text-base">
              Orbito keeps the workflow simple. You bring the long video. Orbito helps you turn it into more chances to post and earn.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            <div
              data-reveal
              className="reveal group surface-soft relative overflow-hidden rounded-[28px] p-6 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <HoverSheen />

              <div className="relative pt-5">
                <div className="text-xl font-semibold text-white/92 sm:text-2xl">Upload, pick, post.</div>
                <p className="mt-3 text-sm leading-relaxed text-white/66">
                  Use one clean flow from source video to final post.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    { step: "01", title: "Upload once", text: "Paste a link or upload a file." },
                    { step: "02", title: "Pick your clips", text: "Keep the good moments only." },
                    { step: "03", title: "Post now or later", text: "Send clips where you want them." },
                  ].map((item, index) => (
                    <div
                      key={item.title}
                      className={[
                        "rounded-2xl border border-white/10 bg-white/[0.03] p-4",
                        index === 2 ? "sm:col-span-2" : "",
                      ].join(" ")}
                    >
                      <div className="text-xs text-white/45">{item.step}</div>
                      <div className="mt-1 text-sm font-semibold text-white/86">{item.title}</div>
                      <div className="mt-1 text-xs text-white/60">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                {
                  title: "Post to every channel that matters",
                  text: "YouTube, TikTok, Reels, and Shorts can all sit inside the same routine.",
                },
                {
                  title: "Keep the money angle in the workflow",
                  text: "Push your best clips toward Whop campaigns when you want to turn views into payouts.",
                },
                {
                  title: "Generate new clips when you need them",
                  text: "If you run out of footage, Generate can make new social-ready videos from a prompt.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  data-reveal
                  className="reveal group surface-soft relative overflow-hidden rounded-[24px] p-5 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <HoverSheen />
                  <div className="relative">
                    <div className="text-lg font-semibold text-white/90">{item.title}</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/64">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {startTrialCta("btn-orbito-cta")}
            <Link href="/pricing" className="btn-ghost">
              View pricing
            </Link>
            <Link href="/contact" className="btn-ghost">
              Contact
            </Link>
          </div>
        </section>

        <section id="generate" className="scroll-mt-28 pt-12 sm:pt-14">
          <div data-reveal className="reveal">
            <GenerateStage previewIndex={previewIndex} setPreviewIndex={setPreviewIndex} />
          </div>
        </section>
        <footer className="pb-10 pt-16 text-xs text-white/50 sm:pt-20">
          <div className="mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026 • {BRAND.name} by Sakib LLC. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((item) => (
                <a key={item.href} href={item.href} className="hover:text-white/75">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
        </div>
      </main>
    </div>
  );
}
