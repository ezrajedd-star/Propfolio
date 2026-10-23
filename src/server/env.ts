import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  /** Public base URL used in email links, e.g. https://leases.example.com */
  APP_URL: z.url().default("http://localhost:3000"),
  /** smtp: send through SMTP. log: don't send; record subject/recipient count only (dev/test). */
  MAIL_TRANSPORT: z.enum(["smtp", "log"]).default("smtp"),
  MAIL_FROM: z.string().min(3).default("Propfolio <no-reply@propfolio.local>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Cookies get the Secure flag (and the __Host- prefix) whenever the app is served over HTTPS. */
export function isSecureDeployment(): boolean {
  return env().APP_URL.startsWith("https://");
}
