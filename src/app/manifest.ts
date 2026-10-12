import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anki-ji · 间隔重复记忆卡片", short_name: "Anki-ji", description: "FSRS-6 spaced repetition flashcards",
    start_url: "/", display: "standalone", background_color: "#fafafa", theme_color: "#0f7f76",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
