import type { CreateAccountantInput, ExamPaper, ExamResult, ExamSubmission } from "@bya/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError } from "./api.js";

interface AccountantView {
  firebaseUid: string;
  name: string;
  city: string;
  state: string;
  qualifications: string[];
  specialties: string[];
  languages: string[];
  experienceYears: number;
  verified: boolean;
  examScore?: number;
  examTotal?: number;
}

/** Bootstraps the caller's user record. A 409 means it already exists — which
 * is success for our purposes (the identity is set up). */
export async function bootstrapUser(phone?: string): Promise<void> {
  try {
    await api.post("/v1/users", { role: "accountant", ...(phone === undefined ? {} : { phone }) });
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") return;
    throw error;
  }
}

export const startExam = (): Promise<ExamPaper> =>
  api.post<{ exam: ExamPaper }>("/v1/exam/start").then((r) => r.exam);

export const submitExam = (submission: ExamSubmission): Promise<ExamResult> =>
  api.post<{ result: ExamResult }>("/v1/exam/submit", submission).then((r) => r.result);

export const createProfile = (input: CreateAccountantInput): Promise<AccountantView> =>
  api.post<{ accountant: AccountantView }>("/v1/accountants", input).then((r) => r.accountant);

/** The current accountant's own profile, or null if none exists yet (404). */
export function useAccountant(uid: string | undefined): UseQueryResult<AccountantView | null> {
  return useQuery({
    queryKey: ["accountant", uid],
    enabled: uid !== undefined,
    queryFn: async (): Promise<AccountantView | null> => {
      try {
        const r = await api.get<{ accountant: AccountantView }>(`/v1/accountants/${uid ?? ""}`);
        return r.accountant;
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

export type { AccountantView };
