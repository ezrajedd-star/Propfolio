import { z } from "zod";

/** "Close this account": the Owner types the account's name to confirm. */
export const closeAccountSchema = z.object({
  confirmName: z.string().trim().min(1, "Type your account's name to confirm.").max(200),
});
export type CloseAccountInput = z.input<typeof closeAccountSchema>;
