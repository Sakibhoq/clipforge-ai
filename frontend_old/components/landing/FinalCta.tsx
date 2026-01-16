"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

type FinalCtaProps = {
  primaryHref?: string;
  secondaryHref?: string;
};

export default function FinalCta({
  primaryHref = "/upload",
  secondaryHref = "/pricing",
}: FinalCtaProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section id="contact" className="cf-section">
      {/* Background accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(980px 560px at 30% 20%, rgba(124,58,237,0.10), transparent 62%), radial-gradient(920px 560px at 75% 55%, rgba(6,182,212,0.08), transparent 62%)",
        }}
      />

      <div className="cf-container cf-section-inner">
        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="cf-surface"
          style={{
            borderRadius: 26,
            overflow: "hidden",
            position: "relative",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: 28,
              background:
                "radial-gradient(circle at 20% 20%, rgba(124,58,237,0.18), transparent 58%), radial-gradient(circle at 80% 30%, rgba(6,182,212,0.14), transparent 58%), radial-gradient(circle at 40% 80%, rgba(34,197,94,0.12), transparent 62%)",
              opacity: 0.95,
              pointerEvents: "none",
              mixBlendMode: "screen",
            }}
          />

          <div style={{ position: "relative", padding: 18 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 0.9fr",
                gap: 14,
                alignItems: "stretch",
              }}
              className="cf-finalGrid"
            >
              {/* Left content */}
              <div
                style={{
                  borderRadius: 22,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(7,10,18,0.35)",
                  padding: 18,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(233,236,245,0.78)",
                    fontSize: 13,
                    width: "fit-content",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(34,197,94,0.95)",
                      boxShadow: "0 0 16px rgba(34,197,94,0.22)",
                    }}
                  />
                  <span style={{ opacity: 0.9 }}>Launch-ready workflow</span>
                </div>

                <h2
                  style={{
                    marginTop: 14,
                    marginBottom: 0,
                    fontSize: 34,
                    lineHeight: 1.1,
                    letterSpacing: "-0.6px",
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                  }}
                >
                  Build a clip engine that prints output.
                </h2>

                <p
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    color: "rgba(233,236,245,0.70)",
                    lineHeight: 1.65,
                    fontSize: 15,
                    maxWidth: 78 * 8,
                  }}
                >
                  Clipforge is built for creators who want a real system: upload
                  long-form once, then ship publish-ready clips on repeat —
                  without living in an editor.
                </p>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <a className="cfFinalBtn cfFinalBtnPrimary" href={primaryHref}>
                    Start clipping
                    <span className="cfFinalBtnGlow" aria-hidden="true" />
                  </a>
                  <a className="cfFinalBtn cfFinalBtnGhost" href={secondaryHref}>
                    View pricing
                  </a>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <Pill text="No editing required" />
                  <Pill text="AWS-ready pipeline" />
                  <Pill text="Clean captions + exports" />
                  <Pill text="Built for Shorts/ Reels" />
                </div>
              </div>

              {/* Right “confidence” panel */}
              <div
                style={{
                  borderRadius: 22,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 18,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    color: "rgba(255,255,255,0.90)",
                    letterSpacing: "-0.2px",
                  }}
                >
                  What you get
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <Bullet
                    title="Publish-ready clips"
                    desc="Cuts with clean boundaries + captions that look premium."
                  />
                  <Bullet
                    title="Reliable SaaS pipeline"
                    desc="Uploads → Jobs → Worker → Clips. Built for scale and retries."
                  />
                  <Bullet
                    title="Output consistency"
                    desc="Uniform presets so your library looks intentional."
                  />
                </div>

                <div
                  style={{
                    marginTop: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(7,10,18,0.35)",
                    padding: 14,
                    color: "rgba(233,236,245,0.70)",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  <strong style={{ color: "rgba(255,255,255,0.86)" }}>
                    Next build step:
                  </strong>{" "}
                  add the <b>/api/upload</b> proxy route so uploads work
                  end-to-end without CORS.
                </div>
              </div>
            </div>
          </div>

          <style jsx>{`
            .cfFinalBtn {
              border-radius: 16px;
              padding: 12px 16px;
              font-weight: 800;
              text-decoration: none;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px solid rgba(255, 255, 255, 0.14);
              cursor: pointer;
              transition: transform 150ms ease, background 150ms ease,
                filter 150ms ease, box-shadow 150ms ease;
              user-select: none;
              position: relative;
            }

            .cfFinalBtnPrimary {
              background: linear-gradient(
                135deg,
                rgba(124, 58, 237, 0.95),
                rgba(6, 182, 212, 0.88)
              );
              color: #061018;
              border-color: rgba(255, 255, 255, 0.18);
              box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
            }

            .cfFinalBtnPrimary:hover {
              filter: brightness(1.08);
              transform: translateY(-1px);
              box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15),
                0 14px 45px rgba(124, 58, 237, 0.35),
                0 18px 60px rgba(0, 0, 0, 0.35);
            }

            .cfFinalBtnGlow {
              position: absolute;
              inset: -2px;
              border-radius: 18px;
              background: radial-gradient(
                  circle at 30% 30%,
                  rgba(124, 58, 237, 0.35),
                  transparent 60%
                ),
                radial-gradient(
                  circle at 70% 40%,
                  rgba(6, 182, 212, 0.28),
                  transparent 55%
                );
              opacity: 0;
              transition: opacity 200ms ease;
              pointer-events: none;
            }

            .cfFinalBtnPrimary:hover .cfFinalBtnGlow {
              opacity: 1;
            }

            .cfFinalBtnGhost {
              background: rgba(255, 255, 255, 0.06);
              color: rgba(255, 255, 255, 0.9);
            }

            .cfFinalBtnGhost:hover {
              background: rgba(255, 255, 255, 0.095);
              transform: translateY(-1px);
            }

            @media (max-width: 980px) {
              :global(.cf-finalGrid) {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </motion.div>

        <div className="mt-10 cf-divider" />
      </div>
    </section>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "7px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(233,236,245,0.74)",
      }}
    >
      {text}
    </span>
  );
}

function Bullet({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr",
        gap: 10,
        alignItems: "start",
        padding: "10px 12px",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          marginTop: 2,
          width: 18,
          height: 18,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="rgba(255,255,255,0.78)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 900,
            color: "rgba(255,255,255,0.88)",
            letterSpacing: "-0.2px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            color: "rgba(233,236,245,0.66)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}
