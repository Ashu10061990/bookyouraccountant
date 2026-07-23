import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/legacy-golden.json" with { type: "json" };
import { SOP_COUNTS, buildSopTasks, type SopTask } from "./sop.js";

interface GoldenSop {
  name: string;
  serviceIds: string[];
  bizNature: string;
  tasks: SopTask[];
}

const sops = golden.sops as GoldenSop[];

describe("buildSopTasks matches the frozen legacy templates", () => {
  // Every COMMON, nature-specific and per-service task appears in at least one
  // of these captured cases, so a single altered, reordered or dropped line —
  // the way hand-curated domain text silently degrades — diverges the fixture.
  it.each(sops.map((s) => [s.name, s] as const))("reproduces %s exactly", (_name, gold) => {
    expect(buildSopTasks(gold.serviceIds, gold.bizNature)).toEqual(gold.tasks);
  });

  it("covers all seven captured SOP cases", () => {
    expect(sops).toHaveLength(7);
  });
});

describe("the §19 hand-curated counts are intact", () => {
  // The inventory names these figures specifically as expensive-to-recreate
  // assets. Pinning them means a dropped task fails a count as well as a vector.
  it("has the 28-point bookkeeping SOP (22 common + 6 trading)", () => {
    expect(SOP_COUNTS.common).toBe(22);
    const trading = buildSopTasks(["bookkeeping"], "trading");
    expect(trading).toHaveLength(28);
  });

  it("has 19 business-nature checks across the three natures", () => {
    const nature =
      SOP_COUNTS.natureTrading + SOP_COUNTS.natureManufacturing + SOP_COUNTS.natureService;
    expect(nature).toBe(19);
    expect(SOP_COUNTS.natureTrading).toBe(6);
    expect(SOP_COUNTS.natureManufacturing).toBe(7);
    expect(SOP_COUNTS.natureService).toBe(6);
  });

  it("has four tasks for each non-bookkeeping service", () => {
    for (const sid of ["gst", "tax", "payroll", "statements", "advisory", "audit"]) {
      expect(SOP_COUNTS.perService[sid]).toHaveLength(4);
    }
  });
});

describe("buildSopTasks structural invariants", () => {
  it("assigns sequential, unique task ids", () => {
    const tasks = buildSopTasks(["bookkeeping", "gst", "tax"], "trading");
    const ids = tasks.map((t) => t.id);

    expect(ids).toEqual(tasks.map((_t, i) => "t" + String(i)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders a bookkeeping engagement setup → entries → reco → nature → review → close", () => {
    const groups = buildSopTasks(["bookkeeping"], "trading").map((t) => t.group);
    const firstOf = (g: string): number => groups.indexOf(g);

    expect(firstOf("start")).toBeLessThan(firstOf("entries"));
    expect(firstOf("entries")).toBeLessThan(firstOf("reco"));
    expect(firstOf("reco")).toBeLessThan(firstOf("trading"));
    expect(firstOf("trading")).toBeLessThan(firstOf("review"));
    expect(firstOf("review")).toBeLessThan(firstOf("close"));
  });

  it("starts every task not-done, so progress begins at zero", () => {
    for (const task of buildSopTasks(["bookkeeping", "gst"], "service")) {
      expect(task.done).toBe(false);
      expect(task.doneAt).toBeNull();
    }
  });

  // The legacy floor: an unrecognised scope must still yield a usable checklist
  // rather than an empty one an accountant could tick straight to "complete".
  it("falls back to the full common SOP for an unknown service", () => {
    const tasks = buildSopTasks(["mystery"], "service");
    expect(tasks).toHaveLength(22);
    expect(tasks.every((t) => t.done === false)).toBe(true);
  });

  it("does not emit the superseded per-service bookkeeping entry", () => {
    // bookkeeping uses COMMON_SOP; its SOP_BY_SERVICE entry is carried but unused.
    const labels = buildSopTasks(["bookkeeping"], "service").map((t) => t.label);
    expect(labels).not.toContain("Enter all transactions with a document behind each entry");
  });
});
