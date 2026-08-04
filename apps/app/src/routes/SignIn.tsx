import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@bya/ui";
import { ApiError } from "../lib/api-error";
import { requestOtp, verifyOtp } from "../lib/auth-client";
import { establishSession } from "../lib/session";
import { ErrorNote, Field, Panel, TextInput } from "../components/ui";

/** Maps the verify endpoint's statuses to copy the user can act on. The
 * server's message is the fallback for anything unanticipated. */
function verifyErrorMessage(error: ApiError): string {
  switch (error.status) {
    case 401:
      return "Wrong code. Check the SMS and try again.";
    case 410:
      return "That code has expired. Tap “Resend code” to get a new one.";
    case 429:
      return "Too many wrong attempts. Wait a bit, then request a new code.";
    default:
      return error.message;
  }
}

export function SignIn() {
  const nav = useNavigate();
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /** Seconds until "Resend code" unlocks, from the server's resendAfterSec. */
  const [resendIn, setResendIn] = useState(0);
  /** Dev only: the server echoes the OTP so local runs work without SMS. */
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Ticks the resend cooldown down once a second while it is positive.
  useEffect(() => {
    if (stage !== "otp" || resendIn <= 0) return;
    const timer = setTimeout(() => {
      setResendIn((s) => s - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [stage, resendIn]);

  const cleanPhone = phone.replace(/\D/g, "");

  const sendOtp = async () => {
    setErr("");
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErr("Enter a valid 10-digit Indian mobile.");
      return;
    }
    setBusy(true);
    try {
      const result = await requestOtp(`+91${cleanPhone}`);
      setStage("otp");
      setOtp("");
      setResendIn(result.resendAfterSec);
      setDevOtp(result.devOtp ?? null);
    } catch (error) {
      if (error instanceof ApiError) {
        setErr(
          error.status === 429
            ? "Too many codes requested. Wait a little, then try again."
            : error.message,
        );
      } else {
        setErr("Could not send the code. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    setErr("");
    if (!/^\d{6}$/.test(otp)) {
      setErr("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const tokens = await verifyOtp(`+91${cleanPhone}`, otp);
      establishSession(tokens, `+91${cleanPhone}`);
      void nav("/onboarding", { replace: true });
    } catch (error) {
      setErr(
        error instanceof ApiError ? verifyErrorMessage(error) : "Could not verify. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper px-6 py-16 font-body">
      <div className="mx-auto max-w-md">
        <Panel
          title={stage === "phone" ? "Sign in with mobile" : "Enter the code"}
          sub={stage === "phone" ? "We'll text you a 6-digit code." : `Sent to +91 ${phone}.`}
        >
          {err !== "" && <ErrorNote>{err}</ErrorNote>}
          {stage === "phone" ? (
            <>
              <Field label="Mobile number">
                <TextInput
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  className="font-mono tracking-widest"
                />
              </Field>
              <Button onClick={() => void sendOtp()} isLoading={busy} className="w-full">
                Send OTP
              </Button>
            </>
          ) : (
            <>
              {import.meta.env.DEV && devOtp !== null && (
                <p className="mb-3 rounded-lg bg-paper2 px-3 py-2 text-center font-mono text-xs text-sage">
                  Dev code: {devOtp}
                </p>
              )}
              <Field label="6-digit code">
                <TextInput
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="123456"
                  className="text-center font-mono text-xl tracking-[0.4em]"
                />
              </Field>
              <Button onClick={() => void submitOtp()} isLoading={busy} className="w-full">
                Verify &amp; continue
              </Button>
              <button
                type="button"
                disabled={resendIn > 0 || busy}
                onClick={() => void sendOtp()}
                className="mt-3 w-full text-sm font-semibold text-ink-soft disabled:text-sage"
              >
                {resendIn > 0 ? `Resend code in ${String(resendIn)}s` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage("phone");
                  setOtp("");
                  setErr("");
                  setDevOtp(null);
                }}
                className="mt-2 w-full text-sm font-semibold text-ink-soft"
              >
                Change number
              </button>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
