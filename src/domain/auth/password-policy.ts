export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// A short list of passwords that pass the length rule but are still trivially guessed.
const COMMON = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "password123",
  "password1234",
  "qwertyuiop",
  "1q2w3e4r5t",
  "iloveyou123",
  "welcome123",
  "changeme123",
  "propfolio123",
  "administrator",
  "letmein1234",
  "aaaaaaaaaa",
]);

export type PasswordProblem = "too_short" | "too_long" | "too_common" | "contains_email";

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  too_common: "This password is too easy to guess. Try a short sentence instead.",
  contains_email: "Don't use your email address in your password.",
};

/** Returns the first problem with the password, or null if it is acceptable. */
export function checkPassword(password: string, email?: string): PasswordProblem | null {
  // Count characters, not UTF-16 code units, so emoji and accented letters count once.
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";

  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "too_common";

  if (email) {
    const local = email.toLowerCase().split("@")[0] ?? "";
    if (local.length >= 4 && lower.includes(local)) return "contains_email";
  }
  return null;
}
