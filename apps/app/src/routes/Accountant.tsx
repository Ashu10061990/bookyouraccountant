import { useAuth } from "../lib/auth-context.js";
import { useAccountant, useMyPhotoUrl } from "../lib/queries.js";
import { Panel, Pill, Spinner } from "../components/ui.js";
import { PhotoUpload } from "../components/PhotoUpload.js";

export function Accountant() {
  const { user, signOut } = useAuth();
  const profile = useAccountant(user?.uid);
  const hasPhoto = profile.data?.photoKey !== undefined;
  const photo = useMyPhotoUrl(hasPhoto);

  return (
    <div className="min-h-screen bg-paper px-6 py-10 font-body">
      <div className="mx-auto max-w-2xl">
        {profile.isPending ? (
          <Panel title="Loading your profile…">
            <Spinner />
          </Panel>
        ) : profile.data === null || profile.isError ? (
          <Panel title="Profile not found">
            <p className="text-ink-soft">
              We couldn&apos;t load your profile. Try signing in again.
            </p>
          </Panel>
        ) : (
          <Panel>
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-navy/10 text-2xl">
                {profile.data.verified ? "✓" : "⏳"}
              </div>
              <h1 className="font-display text-2xl font-bold text-navy">
                {profile.data.verified ? "You're verified" : "Profile under review"}
              </h1>
              {profile.data.verified &&
                profile.data.examScore !== undefined &&
                profile.data.examTotal !== undefined && (
                  <p className="mt-1 text-ink-soft">
                    {profile.data.examScore}/{profile.data.examTotal} on the qualifying exam. Your
                    profile is live to businesses.
                  </p>
                )}
            </div>

            <dl className="mt-6 grid gap-3 border-t border-line pt-6 text-sm">
              <Row label="Name" value={profile.data.name} />
              <Row label="Location" value={`${profile.data.city}, ${profile.data.state}`} />
              <Row label="Experience" value={`${String(profile.data.experienceYears)} years`} />
              <ChipRow
                label="Qualifications"
                values={profile.data.qualifications.map((q) => q.toUpperCase())}
              />
              <ChipRow label="Specialties" values={profile.data.specialties} />
              <ChipRow label="Languages" values={profile.data.languages} />
            </dl>

            <div className="mt-6 border-t border-line pt-6">
              <p className="mb-3 text-sm font-semibold text-sage">Profile photo</p>
              <div className="flex items-center gap-4">
                {photo.data !== null && photo.data !== undefined && (
                  <img
                    src={photo.data}
                    alt="Your profile"
                    className="h-16 w-16 rounded-full object-cover"
                  />
                )}
                <PhotoUpload hasPhoto={hasPhoto} />
              </div>
            </div>

            <p className="mt-6 rounded-lg bg-paper2 px-4 py-3 text-xs text-ink-soft">
              Dashboard (assignments, earnings, MIS) arrives in a later phase.
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-4 text-sm font-semibold text-ink-soft"
            >
              Sign out
            </button>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sage">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sage">{label}</dt>
      <dd className="flex flex-wrap justify-end gap-1.5">
        {values.map((v) => (
          <Pill key={v} tone="line">
            {v}
          </Pill>
        ))}
      </dd>
    </div>
  );
}
