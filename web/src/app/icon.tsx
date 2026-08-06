import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #2563EB, #3B82F6)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "8px",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 22,
            fontWeight: 900,
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          T
        </span>
      </div>
    ),
    { ...size }
  );
}
