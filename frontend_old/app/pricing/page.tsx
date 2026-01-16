"use client";

import React from "react";
import { motion } from "framer-motion";
import MarketingShell from "../../components/MarketingShell";

const TIERS = [
  {
    name: "Starter",
    price: "$19",
    note: "For testing the pipeline",
    emoji: "🟣",
    items: ["Auto-clips (basic)", "Captions included", "S3-ready pipeline", "Community support"],
    cta: "Start Starter",
    accent: "purple",
  },
  {
    name: "Pro",
    price: "$49",
    note: "For consistent creators",
    emoji: "🔵",
    items: ["Higher clip volume", "Hook scoring", "Faster processing", "Priority support"],
    cta: "Go Pro",
    accent: "cyan",
    featured: true,
  },
  {
    name: "Studio",
    price: "$99",
    note: "For teams & agencies",
    emoji: "🟢",
    items: ["Team workspaces (later)", "More automation", "Advanced exports", "Early access features"],
    cta: "Start Studio",
    accent: "green",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="cf-page">
        <motion.h1 className="cf-h1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
          Pricing
        </motion.h1>

        <motion.p className="cf-sub" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut", delay: 0.06 }}>
          Simple plans now. Billing integration later. (We’ll wire Stripe after UI is locked.)
        </motion.p>

        <div className="cf-tiers">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              className={`cf-tier ${t.featured ? "is-featured" : ""} ${t.accent}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 + i * 0.06 }}
            >
              <div className="cf-tierTop">
                <div className="cf-tierName">
                  <span className="cf-tierEmoji" aria-hidden="true">{t.emoji}</span>
                  {t.name}
                </div>
                <div className="cf-tierNote">{t.note}</div>
              </div>

              <div className="cf-tierPrice">
                <span className="cf-tierPriceNum">{t.price}</span>
                <span className="cf-tierPriceUnit">/mo</span>
              </div>

              <ul className="cf-tierList">
                {t.items.map((x) => (
                  <li key={x}>✅ {x}</li>
                ))}
              </ul>

              <button className="cf-tierBtn" onClick={() => alert("Billing later — UI first.")}>
                {t.cta}
              </button>

              <div className="cf-tierRing" aria-hidden="true" />
            </motion.div>
          ))}
        </div>
      </section>

      <style jsx>{`
        .cf-page {
          padding-top: 12px;
          text-align: center;
        }
        .cf-h1 {
          margin: 26px 0 8px;
          font-size: 54px;
          line-height: 1.05;
          letter-spacing: -0.8px;
        }
        .cf-sub {
          margin: 0 auto;
          max-width: 70ch;
          opacity: 0.82;
          line-height: 1.6;
        }

        .cf-tiers {
          margin-top: 24px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          text-align: left;
        }
        @media (max-width: 980px) {
          .cf-tiers {
            grid-template-columns: 1fr;
          }
          .cf-h1 {
            font-size: 40px;
          }
        }

        .cf-tier {
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          padding: 18px;
          backdrop-filter: blur(12px);
          overflow: hidden;
          transition: transform 160ms ease, background 160ms ease;
        }
        .cf-tier:hover {
          transform: translateY(-3px);
          background: rgba(255, 255, 255, 0.08);
        }
        .cf-tier.is-featured {
          border-color: rgba(6, 182, 212, 0.35);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
        }

        .cf-tierTop {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .cf-tierName {
          font-weight: 900;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cf-tierEmoji {
          font-size: 18px;
        }
        .cf-tierNote {
          opacity: 0.75;
          font-size: 12px;
          white-space: nowrap;
        }

        .cf-tierPrice {
          margin-top: 12px;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .cf-tierPriceNum {
          font-size: 36px;
          font-weight: 900;
          letter-spacing: -0.3px;
        }
        .cf-tierPriceUnit {
          opacity: 0.75;
        }

        .cf-tierList {
          margin: 14px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 8px;
          opacity: 0.88;
          font-size: 13px;
          line-height: 1.5;
        }

        .cf-tierBtn {
          width: 100%;
          margin-top: 16px;
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 900;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #e9ecf5;
          cursor: pointer;
          transition: transform 150ms ease, background 150ms ease;
        }
        .cf-tierBtn:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.11);
        }

        .cf-tierRing {
          position: absolute;
          inset: -2px;
          pointer-events: none;
          opacity: 0.9;
          background: radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.25), transparent 55%),
            radial-gradient(circle at 80% 30%, rgba(6, 182, 212, 0.2), transparent 55%);
          mix-blend-mode: screen;
        }

        .purple .cf-tierPriceNum { color: rgba(168, 85, 247, 0.95); }
        .cyan .cf-tierPriceNum { color: rgba(6, 182, 212, 0.95); }
        .green .cf-tierPriceNum { color: rgba(34, 197, 94, 0.95); }
      `}</style>
    </MarketingShell>
  );
}
