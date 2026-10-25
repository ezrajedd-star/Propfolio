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
  /** Don't email demo addresses (`.test`, `example.com` …). Set on hosted test/production servers. */
  MAIL_SKIP_TEST_DOMAINS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Secret for signing short-lived download links (≥ 32 characters). Required in production. */
  APP_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32).optional()),
  /** Where uploaded documents are kept: `local` (a private folder) or `s3` (S3-compatible bucket). */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("ap-southeast-1"),
  /** Only for S3-compatible services other than AWS (e.g. DigitalOcean Spaces, MinIO). */
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Test (UAT) version: shows the "Test version" banner and the "Send feedback" button. */
  UAT_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Signing secret. Development and tests fall back to a fixed value; production must set one. */
export function appSecret(): string {
  const e = env();
  if (e.APP_SECRET) return e.APP_SECRET;
  if (e.NODE_ENV === "production") throw new Error("APP_SECRET is not set");
  return "development-only-secret-not-for-production-use";
}

/** Cookies get the Secure flag (and the __Host- prefix) whenever the app is served over HTTPS. */
export function isSecureDeployment(): boolean {
  return env().APP_URL.startsWith("https://");
}
