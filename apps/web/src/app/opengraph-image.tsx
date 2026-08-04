import { ImageResponse } from "next/og";
import { SITE_NAME } from "../lib/site";

/**
 * Default Open Graph image — brand dark-navy with the gold accent, generated
 * at build time by next/og. Pages without their own image inherit this one.
 */
export const alt = `${SITE_NAME} — CA-verified accountants on demand`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #0e1c12 0%, #142719 55%, #306339 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          color: "#E9A23B",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        ✦ CA-verified · Built in India
      </div>
      <div
        style={{
          marginTop: 36,
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1.05,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span>Book Your</span>
        <span style={{ color: "#E9A23B" }}>Accountant</span>
      </div>
      <div style={{ marginTop: 32, fontSize: 30, color: "rgba(255,255,255,0.75)" }}>
        Verified accountants for India&apos;s MSMEs — pay by the day
      </div>
      <div
        style={{
          marginTop: 48,
          height: 6,
          width: 220,
          background: "#E9A23B",
          borderRadius: 3,
        }}
      />
    </div>,
    size,
  );
}
