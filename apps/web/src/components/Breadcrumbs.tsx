import Link from "next/link";
import type { Crumb } from "../lib/structured-data";
import { breadcrumbsJsonLd } from "../lib/structured-data";
import { JsonLd } from "./JsonLd";

/**
 * Visible breadcrumb trail + matching BreadcrumbList JSON-LD, from one crumb
 * list so the markup and the structured data can never disagree.
 */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <>
      <JsonLd data={breadcrumbsJsonLd(crumbs)} />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              {i === last ? (
                <span aria-current="page" className="font-semibold text-ink">
                  {c.name}
                </span>
              ) : (
                <Link href={c.path} className="hover:text-gold">
                  {c.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
