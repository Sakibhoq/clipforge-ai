import { readFileSync } from "fs";
import { join } from "path";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/svg+xml";

export default function Icon() {
  const svg = readFileSync(
    join(process.cwd(), "public/clipforge-labs-mark.svg"),
    "utf8"
  );

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
    },
  });
}
