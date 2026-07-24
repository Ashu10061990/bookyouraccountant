import {
  ACCOUNTING_SOFTWARE,
  CITIES_BY_STATE,
  COMPLIANCE_SOFTWARE,
  INDIA_STATES,
  LANGUAGES,
  QUALIFICATIONS,
  SERVICES,
  createAccountantSchema,
} from "@bya/shared";
import { useMemo, useState } from "react";
import { Button } from "@bya/ui";
import { createProfile } from "../../lib/queries.js";
import { ErrorNote, Field, MultiSelect, Panel, Select, TextInput } from "../../components/ui.js";

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function ProfileStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [accountingSoftware, setAccountingSoftware] = useState<string[]>([]);
  const [complianceSoftware, setComplianceSoftware] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const cities = useMemo<readonly string[]>(() => CITIES_BY_STATE[state] ?? [], [state]);

  const submit = async () => {
    setErr("");
    const candidate = {
      name,
      state,
      city,
      experienceYears: experienceYears === "" ? Number.NaN : Number(experienceYears),
      qualifications,
      specialties,
      languages,
      accountingSoftware,
      complianceSoftware,
    };
    const parsed = createAccountantSchema.safeParse(candidate);
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Please complete every required field.");
      return;
    }
    setBusy(true);
    try {
      await createProfile(parsed.data);
      onDone();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Register your profile"
      sub="This is what businesses see. You're already verified."
    >
      {err !== "" && <ErrorNote>{err}</ErrorNote>}

      <Field label="Full name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Asha Rao"
        />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="State">
          <Select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setCity("");
            }}
          >
            <option value="">Select a state</option>
            {INDIA_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City">
          <Select value={city} onChange={(e) => setCity(e.target.value)} disabled={state === ""}>
            <option value="">{state === "" ? "Pick a state first" : "Select a city"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Years of experience">
        <TextInput
          value={experienceYears}
          onChange={(e) => setExperienceYears(e.target.value.replace(/\D/g, "").slice(0, 2))}
          inputMode="numeric"
          placeholder="e.g. 8"
        />
      </Field>

      <Field label="Qualifications">
        <MultiSelect
          options={QUALIFICATIONS.map((q) => ({
            value: q,
            label: q.toUpperCase().replaceAll("_", " "),
          }))}
          selected={qualifications}
          onToggle={(v) => setQualifications((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Specialties">
        <MultiSelect
          options={SERVICES.map((s) => ({ value: s.id, label: s.name }))}
          selected={specialties}
          onToggle={(v) => setSpecialties((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Languages">
        <MultiSelect
          options={LANGUAGES.map((l) => ({
            value: l,
            label: l.charAt(0).toUpperCase() + l.slice(1),
          }))}
          selected={languages}
          onToggle={(v) => setLanguages((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Accounting software (optional)">
        <MultiSelect
          options={ACCOUNTING_SOFTWARE.map((s) => ({ value: s.value, label: s.label }))}
          selected={accountingSoftware}
          onToggle={(v) => setAccountingSoftware((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Compliance software (optional)">
        <MultiSelect
          options={COMPLIANCE_SOFTWARE.map((s) => ({ value: s.value, label: s.label }))}
          selected={complianceSoftware}
          onToggle={(v) => setComplianceSoftware((l) => toggle(l, v))}
        />
      </Field>

      <Button onClick={() => void submit()} isLoading={busy} className="mt-2 w-full">
        Complete registration
      </Button>
    </Panel>
  );
}
