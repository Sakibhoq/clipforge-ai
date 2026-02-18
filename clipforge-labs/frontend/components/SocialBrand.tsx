"use client";

import React from "react";

export type SocialPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "reels"
  | "shorts";

type SocialTheme = {
  label: string;
  text: string;
  border: string;
  background: string;
  iconBackground: string;
  iconBorder: string;
};

const THEME: Record<SocialPlatform, SocialTheme> = {
  youtube: {
    label: "YouTube",
    text: "#FFDCE2",
    border: "#FF5B67",
    background: "linear-gradient(135deg, rgba(255,49,71,0.30), rgba(255,0,51,0.20))",
    iconBackground: "linear-gradient(135deg, #ff3147, #ff0033)",
    iconBorder: "#ff5b67",
  },
  tiktok: {
    label: "TikTok",
    text: "#DFFCFA",
    border: "#3FCBC4",
    background: "linear-gradient(135deg, rgba(37,244,238,0.20), rgba(254,44,85,0.16))",
    iconBackground:
      "linear-gradient(135deg, #121212 5%, #1d1d1d 42%, #2f101a 100%)",
    iconBorder: "#3a3a3a",
  },
  instagram: {
    label: "Instagram",
    text: "#FFE4F1",
    border: "#E28AC0",
    background: "linear-gradient(135deg, rgba(245,133,41,0.22), rgba(221,42,123,0.18), rgba(129,52,175,0.16), rgba(81,91,212,0.16))",
    iconBackground:
      "linear-gradient(135deg, #F58529 0%, #DD2A7B 45%, #8134AF 75%, #515BD4 100%)",
    iconBorder: "#E28AC0",
  },
  facebook: {
    label: "Facebook",
    text: "#E0EEFF",
    border: "#5A9EFF",
    background: "linear-gradient(135deg, rgba(35,116,225,0.25), rgba(24,119,242,0.18))",
    iconBackground: "linear-gradient(135deg, #2374E1, #1877F2)",
    iconBorder: "#5A9EFF",
  },
  reels: {
    label: "Reels",
    text: "#FFE6F4",
    border: "#D98AC2",
    background: "linear-gradient(135deg, rgba(250,126,30,0.20), rgba(214,41,118,0.18), rgba(150,47,191,0.16))",
    iconBackground: "linear-gradient(135deg, #FA7E1E, #D62976, #962FBF)",
    iconBorder: "#D98AC2",
  },
  shorts: {
    label: "Shorts",
    text: "#FFE4E8",
    border: "#FF7A86",
    background: "linear-gradient(135deg, rgba(255,45,85,0.24), rgba(255,75,58,0.18))",
    iconBackground: "linear-gradient(135deg, #FF2D55, #FF4B3A)",
    iconBorder: "#FF7A86",
  },
};

function cn(...xs: Array<string | undefined | false | null>) {
  return xs.filter(Boolean).join(" ");
}

export function socialBrandTheme(platform: SocialPlatform): SocialTheme {
  return THEME[platform];
}

export function SocialPlatformIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const classes = cn("h-4 w-4", className);
  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
        <rect x="3" y="6" width="18" height="12" rx="4" fill="white" />
        <path d="M10.2 9.2 15.6 12l-5.4 2.8V9.2Z" fill="#FF0033" />
      </svg>
    );
  }
  if (platform === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
        <path
          d="M14.6 3.1c.5 2.7 2.4 4.4 5 4.7v2.4c-1.7 0-3.2-.6-4.6-1.6v5.8c0 2.8-2.2 5-5 5-2.8 0-5-2.2-5-5s2.2-5 5-5c.3 0 .6 0 .9.1v2.5c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5S8.6 17 10 17s2.5-1.1 2.5-2.5V3.1h2.1Z"
          fill="#25F4EE"
          opacity="0.88"
          transform="translate(-0.45 0)"
        />
        <path
          d="M14.6 3.1c.5 2.7 2.4 4.4 5 4.7v2.4c-1.7 0-3.2-.6-4.6-1.6v5.8c0 2.8-2.2 5-5 5-2.8 0-5-2.2-5-5s2.2-5 5-5c.3 0 .6 0 .9.1v2.5c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5S8.6 17 10 17s2.5-1.1 2.5-2.5V3.1h2.1Z"
          fill="#FE2C55"
          opacity="0.9"
          transform="translate(0.35 0)"
        />
        <path
          d="M14.6 3.1c.5 2.7 2.4 4.4 5 4.7v2.4c-1.7 0-3.2-.6-4.6-1.6v5.8c0 2.8-2.2 5-5 5-2.8 0-5-2.2-5-5s2.2-5 5-5c.3 0 .6 0 .9.1v2.5c-.3-.1-.6-.2-.9-.2-1.4 0-2.5 1.1-2.5 2.5S8.6 17 10 17s2.5-1.1 2.5-2.5V3.1h2.1Z"
          fill="white"
        />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
        <rect x="5" y="5" width="14" height="14" rx="4" stroke="white" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.3" stroke="white" strokeWidth="1.8" />
        <circle cx="16.4" cy="7.6" r="1.1" fill="white" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
        <path
          d="M14 8.5V7.2c0-.7.5-1.2 1.2-1.2H17V3.5h-2c-2.2 0-3.5 1.4-3.5 3.6v1.4H9.5V11H11.5v9.5h2.8V11h2.3l.4-2.5H14Z"
          fill="white"
        />
      </svg>
    );
  }
  if (platform === "reels") {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
        <rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="white" strokeWidth="1.6" />
        <path d="M4.8 9.2h14.4M9.3 4.8l4.4 4.4M14.1 4.8l4.4 4.4" stroke="white" strokeWidth="1.4" />
        <path d="M11 10.8 15 13l-4 2.2v-4.4Z" fill="white" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={classes} aria-hidden="true" fill="none">
      <path
        d="M9.2 5.2c1.4-.8 4.2-.8 5.6 0l3.1 1.8c1.4.8 1.4 2.1 0 2.9l-3.1 1.8c-1.4.8-4.2.8-5.6 0L6.1 10c-1.4-.8-1.4-2.1 0-2.9l3.1-1.9Z"
        fill="white"
      />
      <path
        d="M9.2 12.2c1.4-.8 4.2-.8 5.6 0l3.1 1.8c1.4.8 1.4 2.1 0 2.9l-3.1 1.8c-1.4.8-4.2.8-5.6 0L6.1 17c-1.4-.8-1.4-2.1 0-2.9l3.1-1.9Z"
        fill="white"
      />
    </svg>
  );
}

export function SocialBrandPill({
  platform,
  label,
  uppercase,
  compact = false,
  className,
}: {
  platform: SocialPlatform;
  label?: string;
  uppercase?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const theme = THEME[platform];
  const text = label || theme.label;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border backdrop-blur-[1px]",
        compact ? "gap-1.5 px-2 py-1 text-[10px]" : "gap-2 px-2.5 py-1 text-[11px]",
        className
      )}
      style={{ color: theme.text, borderColor: theme.border, background: theme.background }}
    >
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border",
            compact ? "h-4 w-4" : "h-5 w-5"
          )}
          style={{ borderColor: theme.iconBorder, background: theme.iconBackground }}
        >
        <SocialPlatformIcon platform={platform} className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      </span>
      <span className={cn("font-semibold tracking-tight", uppercase ? "uppercase" : "")}>{text}</span>
    </span>
  );
}

export function SocialBrandRow({
  platforms,
  compact = false,
  uppercase = false,
  className,
}: {
  platforms: SocialPlatform[];
  compact?: boolean;
  uppercase?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {platforms.map((p) => (
        <SocialBrandPill key={p} platform={p} compact={compact} uppercase={uppercase} />
      ))}
    </span>
  );
}
