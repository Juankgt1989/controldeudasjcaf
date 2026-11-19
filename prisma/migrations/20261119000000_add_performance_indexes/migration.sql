-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_telegramChatId_idx" ON "User"("telegramChatId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Debt_status_idx" ON "Debt"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Debt_createdAt_idx" ON "Debt"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_debtId_idx" ON "Payment"("debtId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx" ON "Payment"("paymentDate");
