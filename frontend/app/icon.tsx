import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: "#0B0F14",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        {/* OUTER GLOW */}
        <div
          style={{
            position: "absolute",
            width: 56,
            height: 56,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(94,234,212,0.55) 0%, rgba(94,234,212,0.25) 45%, rgba(11,15,20,0) 70%)",
            filter: "blur(6px)",
          }}
        />

        {/* MAIN ORB */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 30%, #7EEAD7 0%, #2DD4BF 70%)",
            boxShadow: "0 0 18px rgba(94,234,212,0.55)",
          }}
        />

        {/* INNER RING */}
        <div
          style={{
            position: "absolute",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "4px solid rgba(165,243,252,0.9)",
            boxShadow: "0 0 10px rgba(165,243,252,0.45)",
          }}
        />

        {/* CENTER DOT */}
        <div
          style={{
            position: "absolute",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#E0FFFB",
          }}
        />
      </div>
    ),
    size
  );
}
