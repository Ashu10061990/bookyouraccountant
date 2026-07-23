import type { MetadataRoute } from "next";

const BASE_URL = "https://bookyouraccountant.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: BASE_URL, changeFrequency: "weekly", priority: 1 }];
}
