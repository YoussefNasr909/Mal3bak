import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mal3bk | Professional Sports Court Booking in Egypt",
    short_name: "Mal3bk",
    description:
      "Reserve football, padel, tennis, and multi-sport courts across Egypt with live availability and instant confirmation.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d47a1",
    lang: "ar",
    dir: "rtl",
    categories: ["sports", "booking", "lifestyle"],
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
