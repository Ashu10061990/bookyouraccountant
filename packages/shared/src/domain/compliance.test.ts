import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/legacy-compliance-golden.json" with { type: "json" };
import {
  OBLIGATIONS,
  buildComplianceCalendar,
  complianceFy,
  upcomingObligations,
} from "./compliance.js";

interface GoldenItem {
  name: string;
  appliesTo: string;
  desc: string;
  occurrences: Record<string, { dateIso: string; period: string }[]>;
}

const items = golden.items as GoldenItem[];

describe("compliance obligations match the frozen legacy calendar", () => {
  // The dates are the whole point: this is statutory data dated to sections of
  // the IT Act 2025. A slipped day, a wrong period label, or a dropped
  // occurrence is a real compliance error, and one of these vectors catches it.
  it.each(items.map((it) => [it.name, it] as const))("reproduces %s exactly", (_name, gold) => {
    const obligation = OBLIGATIONS.find((o) => o.name === gold.name);
    expect(obligation, gold.name).toBeDefined();

    expect(obligation!.appliesTo).toBe(gold.appliesTo);
    expect(obligation!.desc).toBe(gold.desc);

    for (const [fy, expected] of Object.entries(gold.occurrences)) {
      expect(obligation!.occ(Number(fy)), `${gold.name} FY${fy}`).toEqual(expected);
    }
  });

  it("has all 23 obligations and no extras", () => {
    expect(OBLIGATIONS).toHaveLength(23);
    expect(OBLIGATIONS.map((o) => o.name).sort()).toEqual(items.map((i) => i.name).sort());
  });
});

describe("complianceFy — April starts the financial year", () => {
  it("puts April–December in the year-to-next FY", () => {
    expect(complianceFy("2026-04-01")).toBe(2026);
    expect(complianceFy("2026-12-31")).toBe(2026);
  });

  it("puts January–March in the previous FY", () => {
    expect(complianceFy("2026-03-31")).toBe(2025);
    expect(complianceFy("2026-01-15")).toBe(2025);
  });
});

describe("buildComplianceCalendar", () => {
  it("returns every occurrence for the FY, sorted by date", () => {
    const cal = buildComplianceCalendar(2026);

    expect(cal.length).toBeGreaterThan(50);
    for (let i = 1; i < cal.length; i++) {
      expect(cal[i]!.dateIso >= cal[i - 1]!.dateIso).toBe(true);
    }
  });

  it("marks unextended entries with extended: null", () => {
    expect(buildComplianceCalendar(2026).every((e) => e.extended === null)).toBe(true);
  });
});

describe("notified extensions — the config/complianceOverrides mechanism", () => {
  // The exact rule ComplianceOverridesEditor writes and the calendar reads:
  // from-date equals the occurrence AND the name contains the match keyword.
  it("shifts a matching occurrence to the extended date and notes it", () => {
    // GSTR-3B monthly is due the 20th; extend the April one to 2026-04-25.
    const cal = buildComplianceCalendar(2026, [
      { match: "GSTR-3B", from: "2026-04-20", to: "2026-04-25", note: "CBIC N/N 01/2026" },
    ]);

    const extended = cal.find((e) => e.name.includes("GSTR-3B") && e.period === "for March 26");
    expect(extended?.dateIso).toBe("2026-04-25");
    expect(extended?.extended).toBe("CBIC N/N 01/2026");
  });

  it("leaves non-matching obligations on their original date", () => {
    const cal = buildComplianceCalendar(2026, [
      { match: "GSTR-3B", from: "2026-04-20", to: "2026-04-25", note: "" },
    ]);

    // The PF contribution on the 15th is untouched.
    const pf = cal.find((e) => e.name.includes("PF"));
    expect(pf?.extended).toBeNull();
  });

  it("matches the keyword case-insensitively, as the legacy did", () => {
    const cal = buildComplianceCalendar(2026, [
      { match: "gstr-3b", from: "2026-04-20", to: "2026-04-24", note: "x" },
    ]);
    expect(cal.some((e) => e.dateIso === "2026-04-24" && e.extended === "x")).toBe(true);
  });

  it("defaults the note when the extension carries none", () => {
    const cal = buildComplianceCalendar(2026, [
      { match: "GSTR-3B", from: "2026-04-20", to: "2026-04-25", note: "" },
    ]);
    const extended = cal.find((e) => e.dateIso === "2026-04-25");
    expect(extended?.extended).toBe("Extended by notification");
  });

  it("does not shift an occurrence whose date does not match `from`", () => {
    // Right keyword, wrong from-date → no shift.
    const cal = buildComplianceCalendar(2026, [
      { match: "GSTR-3B", from: "2099-01-01", to: "2099-01-05", note: "" },
    ]);
    expect(cal.some((e) => e.dateIso === "2099-01-05")).toBe(false);
  });
});

describe("upcomingObligations", () => {
  it("returns the soonest obligations on or after a date", () => {
    const upcoming = upcomingObligations("2026-04-15", [], 3);

    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]!.dateIso >= "2026-04-15").toBe(true);
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i]!.dateIso >= upcoming[i - 1]!.dateIso).toBe(true);
    }
  });

  it("excludes dates already passed", () => {
    expect(upcomingObligations("2026-12-25", [], 10).every((e) => e.dateIso >= "2026-12-25")).toBe(
      true,
    );
  });
});
