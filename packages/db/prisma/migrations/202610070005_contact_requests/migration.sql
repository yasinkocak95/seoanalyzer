CREATE TABLE "ContactRequest" ("id" TEXT PRIMARY KEY, "ownerHash" TEXT NOT NULL, "email" TEXT NOT NULL, "subject" TEXT NOT NULL, "message" TEXT NOT NULL, "handledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ContactRequest_handledAt_createdAt_idx" ON "ContactRequest"("handledAt", "createdAt");
