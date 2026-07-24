import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@bya/ui";
import { auth, usingEmulator } from "../lib/firebase.js";
import { ErrorNote, Field, Panel, TextInput } from "../components/ui.js";

export function SignIn() {
  const nav = useNavigate();
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (usingEmulator) return; // emulator needs no reCAPTCHA
    if (verifier.current === null) {
      verifier.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
    return () => {
      verifier.current?.clear();
      verifier.current = null;
    };
  }, []);

  const sendOtp = async () => {
    setErr("");
    const clean = phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setErr("Enter a valid 10-digit Indian mobile.");
      return;
    }
    setBusy(true);
    try {
      // Under the emulator a dummy verifier is accepted; on the real project the
      // invisible reCAPTCHA above is used.
      const appVerifier =
        verifier.current ??
        new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, `+91${clean}`, appVerifier);
      setStage("otp");
    } catch (error) {
      setErr(
        error instanceof Error ? error.message.replace("Firebase: ", "") : "Could not send OTP.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setErr("");
    if (!/^\d{6}$/.test(otp)) {
      setErr("Enter the 6-digit code.");
      return;
    }
    if (confirmation.current === null) {
      setErr("Request a code first.");
      return;
    }
    setBusy(true);
    try {
      await confirmation.current.confirm(otp);
      void nav("/onboarding", { replace: true });
    } catch {
      setErr("Wrong or expired code. Try again.");
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
              <Button onClick={() => void verifyOtp()} isLoading={busy} className="w-full">
                Verify &amp; continue
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStage("phone");
                  setOtp("");
                  setErr("");
                }}
                className="mt-3 w-full text-sm font-semibold text-ink-soft"
              >
                Change number
              </button>
            </>
          )}
        </Panel>
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}
