import type { Notifier } from "../../platform/notifications.js";
import type { AccountantDocument } from "./accountants.schema.js";

/**
 * Fires `accountant_verified`, fire-and-forget, at both moments an
 * accountant becomes verified — `accountants.service.ts`'s `createProfile`
 * born-verified branch and its `verifyAccountant` admin path. Both call this
 * with their own injected `notifier` right after the verification commits.
 *
 * `notifier.notify` itself never rejects and logs its own failures (see
 * `platform/notifications.ts`), which is what makes the `void` here safe: a
 * notification must never fail or delay the action that triggered it.
 */
export function notifyVerified(
  notifier: Notifier,
  doc: Pick<AccountantDocument, "email" | "phone" | "name">,
): void {
  void notifier.notify({
    event: "accountant_verified",
    to: {
      ...(doc.email ? { email: doc.email } : {}),
      ...(doc.phone ? { phone: doc.phone } : {}),
    },
    data: { name: doc.name },
  });
}
