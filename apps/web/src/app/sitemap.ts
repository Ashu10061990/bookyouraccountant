import type { MetadataRoute } from "next";
import { CITY_PAGES } from "../lib/seo/cities";
import { SERVICE_PAGES } from "../lib/seo/services";
import { absUrl } from "../lib/site";

/**
 * Full sitemap: the five core pages plus every programmatic route. New service
 * or city pages appear here automatically because the same constants drive
 * both `generateStaticParams` and this file.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ): MetadataRoute.Sitemap[number] => ({
    url: absUrl(path),
    lastModified,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1, "weekly"),
    entry("/services", 0.9, "weekly"),
    entry("/compliance-calendar", 0.9, "monthly"),
    ...SERVICE_PAGES.map((s) => entry(`/services/${s.slug}`, 0.8, "monthly")),
    ...SERVICE_PAGES.flatMap((s) =>
      CITY_PAGES.map((c) => entry(`/services/${s.slug}/${c.slug}`, 0.7, "monthly")),
    ),
    entry("/about", 0.6, "monthly"),
    entry("/why", 0.6, "monthly"),
    entry("/dashboards", 0.6, "monthly"),
    entry("/contact", 0.6, "monthly"),
  ];
}
