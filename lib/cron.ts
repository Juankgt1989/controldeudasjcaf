import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { daysOverdue, formatCurrency, formatFrequency } from "@/lib/utils";

const globalForCron = global as unknown as { cronStarted?: boolean };

export function startReminderCron() {
  if (globalForCron.cronStarted) {
    return;
  }

  globalForCron.cronStarted = true;

  cron.schedule("0 8 * * *", async () => {
    console.log("Running reminder cron job");

    const user = await prisma.user.findFirst({
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) {
      console.log("No Telegram chat ID configured");
      return;
    }

    const debts = await prisma.debt.findMany({
      where: { status: { not: "PAID" } },
      include: {
        payments: { select: { amount: true } },
      },
    });

    for (const debt of debts) {
      const days = daysOverdue(
        debt.startDate,
        debt.endDate,
        debt.paymentFrequency,
        debt.dueDay ?? undefined
      );

      if (days >= 5) {
        const paid = debt.payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        );
        const balance = Number(debt.totalAmount) - paid;

        if (balance > 0) {
          const message = [
            "⏰ *Recordatorio de deuda vencida*",
            "",
            `*Deuda:* ${debt.name}`,
            `*Total:* ${formatCurrency(Number(debt.totalAmount))}`,
            `*Saldo pendiente:* ${formatCurrency(balance)}`,
            `*Días de retraso:* ${days}`,
            `*Frecuencia:* ${formatFrequency(debt.paymentFrequency)}`,
            `*Periodo:* ${debt.startDate.toLocaleDateString("es-GT")} - ${debt.endDate.toLocaleDateString("es-GT")}`,
          ].join("\n");

          await sendTelegramMessage(user.telegramChatId, message);
        }
      }
    }
  });

  console.log("Reminder cron job started");
}
