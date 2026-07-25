import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@bya/ui";
import { MAX_PHOTO_BYTES, uploadPhoto } from "../lib/queries.js";
import { ErrorNote } from "./ui.js";

/**
 * File-pick control for the accountant's profile photo — spec
 * `docs/specs/2026-07-25-s3-storage-slice.md`, "The real consumer".
 *
 * Runs `uploadPhoto`'s three-step flow (presign → direct PUT to S3 → PATCH
 * the profile) and, only on success, invalidates the queries that read the
 * result — the profile (for its new `photoKey`) and the presigned photo URL
 * — so `Accountant.tsx` re-fetches and shows the new photo without a manual
 * reload. A failed step leaves both caches untouched: nothing is invalidated
 * until `uploadPhoto` itself resolves.
 */
export function PhotoUpload({ hasPhoto }: { hasPhoto: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (file: File) => {
    setBusy(true);
    try {
      await uploadPhoto(file);
      await queryClient.invalidateQueries({ queryKey: ["accountant"] });
      await queryClient.invalidateQueries({ queryKey: ["accountantPhotoUrl"] });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not upload the photo.");
    } finally {
      setBusy(false);
    }
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be re-picked after an error
    if (file === undefined) return;

    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErr("Image must be 5 MB or smaller.");
      return;
    }

    setErr("");
    void submit(file);
  };

  return (
    <div>
      {err !== "" && <ErrorNote>{err}</ErrorNote>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onChange}
        className="hidden"
        aria-label="Profile photo"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        isLoading={busy}
        onClick={() => inputRef.current?.click()}
      >
        {hasPhoto ? "Change photo" : "Add a profile photo"}
      </Button>
    </div>
  );
}
