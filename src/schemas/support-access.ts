import { z } from "zod";

import { SUPPORT_ACCESS_DURATIONS } from "@/domain/auth/support-access";

export const grantSupportAccessSchema = z.object({
  duration: z.enum(SUPPORT_ACCESS_DURATIONS, { error: "Choose how long." }),
});
