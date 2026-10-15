import type { MetadataRoute } from "next";
import { currentSeason, seasonIcon } from "@/lib/season-icon";

export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const s = currentSeason();
  return {
    name: "R2U 크루", short_name: "R2U", start_url: "/", display: "minimal-ui", background_color: "#0a0706", theme_color: "#0a0706",
    icons: [
      { src: seasonIcon(s, 192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: seasonIcon(s, 512), sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
