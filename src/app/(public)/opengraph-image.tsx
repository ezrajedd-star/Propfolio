import { ImageResponse } from "next/og";

import { VALUE_PROPOSITION } from "@/domain/marketing/content";

/** The card shown when a website page is shared on Facebook, Viber, LinkedIn and others. */
export const alt = "Propfolio: never miss a lease renewal again";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #0f766e 0%, #115e59 60%, #134e4a 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "white",
            color: "#0f766e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          P
        </div>
        <div style={{ fontSize: 40, fontWeight: 700 }}>Propfolio</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 1000 }}>
          {VALUE_PROPOSITION.headline}
        </div>
        <div style={{ fontSize: 32, opacity: 0.9, maxWidth: 950 }}>
          Every lease, rent schedule and renewal date in one place, for Philippine lessors.
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 26 }}>
        {VALUE_PROPOSITION.proof.map((p) => (
          <div
            key={p}
            style={{
              display: "flex",
              padding: "10px 20px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.15)",
            }}
          >
            {p}
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
