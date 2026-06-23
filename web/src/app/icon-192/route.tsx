import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  const size = 192;
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: `${size * 0.2}px`,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: size * 0.55,
            fontWeight: 900,
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          T
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
