import type { MetadataRoute } from "next";

const base = "https://fitron.in";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-10-01");
  return [
    { url: `${base}/`, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, lastModified: updated, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
