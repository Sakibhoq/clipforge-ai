// frontend/lib/brand.ts
export const BRAND = {
  name: "Orbito",
  product: "Orbito", // keep separate in case you ever want "Orbito Studio", etc.
  tagline: "Turn long videos into viral clips.",
  metaTitle: "Orbito — AI Video Clipping",
  metaDescription:
    "Orbito turns long videos into high-performing clips with smart reframing, captions, and a seamless pipeline.",

  // Merged product link
  clipforgeName: "Orbito Labs",
  clipforgeProduct: "Orbito Labs",
  clipforgeUrl:
    process.env.NEXT_PUBLIC_LABS_MARKETING_URL?.trim() ||
    "https://app.orbito.cc/app/labs/app/generate",

  // Monetization partner
  whopName: "Whop",
  whopUrl: "https://whop.com/discover/app/app_QRxsQodZgK1r4D/",
};
