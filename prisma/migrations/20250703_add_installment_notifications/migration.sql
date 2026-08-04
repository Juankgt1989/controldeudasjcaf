-- CreateTable
CREATE TABLE "InstallmentNotification" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "fiveDaySent" BOOLEAN NOT NULL DEFAULT false,
    "dailyLastSent" TIMESTAMP(3),
    "dueDateSent" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "lastOverdueSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentNotification_debtId_dueDate_key" ON "InstallmentNotification"("debtId", "dueDate");

-- AddForeignKey
ALTER TABLE "InstallmentNotification" ADD CONSTRAINT "InstallmentNotification_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
