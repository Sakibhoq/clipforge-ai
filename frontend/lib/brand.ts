// frontend/lib/brand.ts
export const BRAND = {
  name: "Orbito",
  product: "Orbito", // keep separate in case you ever want "Orbito Studio", etc.
  tagline: "Clip long videos, generate new ones, and publish faster.",
  metaTitle: "Orbito — Clip, Generate, Publish",
  metaDescription:
    "Orbito helps you clip long videos, generate new AI videos, and publish short-form content faster from one workflow.",

  // Merged product link
  clipforgeName: "Orbito Generate",
  clipforgeProduct: "Orbito Generate",
  clipforgeUrl:
    process.env.NEXT_PUBLIC_LABS_MARKETING_URL?.trim() ||
    "https://app.orbito.cc/app/labs/app/generate",

  // Monetization partner
  whopName: "Whop",
  whopUrl: "https://whop.com/discover/app/app_QRxsQodZgK1r4D/",
};
