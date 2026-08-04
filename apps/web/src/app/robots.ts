import type { MetadataRoute } from "next";
import { absUrl } from "../lib/site";

/** Everything on the marketing site is public — allow all, point to the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: absUrl("/sitemap.xml"),
  };
}
