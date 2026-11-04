-- Plans, limits and the trial: "your trial ends soon" emails, sent once per trial end and lead time.
-- Reversible: prisma/rollback/20261104090000_trial_reminders.down.sql

-- CreateTable
CREATE TABLE "TrialReminder" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "trialEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialReminder_accountId_trialEndsAt_daysBefore_key" ON "TrialReminder"("accountId", "trialEndsAt", "daysBefore");

-- AddForeignKey
ALTER TABLE "TrialReminder" ADD CONSTRAINT "TrialReminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Propfolio's own record: never reachable from customer work.
ALTER TABLE "TrialReminder" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TrialReminder" FROM propfolio_tenant;
