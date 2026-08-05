import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, sendTelegramMessageWithConfirm, startTelegramPolling } from "@/lib/telegram";
import { getDueDates, formatCurrency, formatFrequency, formatDate } from "@/lib/utils";
import { PaymentFrequency } from "@prisma/client";

const globalForCron = global as unknown as { cronStarted?: boolean };

const HOURS_BETWEEN_OVERDUE = 5;

const gtDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
});

function guatemalaDateString(date: Date): string {
  return gtDateFormatter.format(date);
}

function daysUntilDueDate(dueDate: Date, now: Date): number {
  const [year, month, day] = guatemalaDateString(now).split("-").map(Number);
  const todayMs = Date.UTC(year, month - 1, day);
  const dueMs = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}

function hoursBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60));
}

function isSameDay(a: Date, b: Date): boolean {
  return guatemalaDateString(a) === guatemalaDateString(b);
}

function getGuatemalaHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Guatemala",
      hourCycle: "h23",
      hour: "numeric",
    }).format(now)
  );
}

export function startReminderCron() {
  if (globalForCron.cronStarted) {
    return;
  }
  globalForCron.cronStarted = true;

  startTelegramPolling();

  cron.schedule("0 * * * *", async () => {
    console.log("Running reminder cron job:", new Date().toISOString());

    const now = new Date();
    const gtHour = getGuatemalaHour(now);
    if (gtHour < 9 || gtHour > 20) {
      console.log(`Outside notification window (9 AM - 8 PM Guatemala time), current hour: ${gtHour}`);
      return;
    }

    try {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: { not: null } },
        select: { telegramChatId: true },
      });

      if (!user?.telegramChatId) {
        console.log("No Telegram chat ID configured");
        return;
      }

      const chatId = user.telegramChatId;

      const debts = await prisma.debt.findMany({
        where: { status: { not: "PAID" } },
        include: {
          payments: { select: { amount: true } },
          installmentNotifications: true,
        },
      });

      for (const debt of debts) {
        const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(debt.totalAmount) - paid;

        if (balance <= 0) continue;

        const dueDates = getDueDates(
          debt.startDate,
          debt.endDate,
          debt.paymentFrequency as PaymentFrequency,
          debt.dueDay ?? undefined
        );

        if (dueDates.length === 0) continue;

        const upcomingDates = dueDates.filter((d) => daysUntilDueDate(d, now) >= 0);
        const targetDates = upcomingDates.length > 0 ? upcomingDates : [dueDates[dueDates.length - 1]];

        for (const dueDate of targetDates) {
          const daysUntilDue = daysUntilDueDate(dueDate, now);
          const isOverdue = daysUntilDue < 0;
          const isDueToday = daysUntilDue === 0;

          let notification = debt.installmentNotifications.find(
            (n) => n.dueDate.toISOString().split("T")[0] === dueDate.toISOString().split("T")[0]
          );

          if (!notification) {
            notification = await prisma.installmentNotification.create({
              data: {
                debtId: debt.id,
                dueDate: dueDate,
              },
            });
          }

          if (notification.confirmed) continue;

          const baseMessage = [
            `*Deuda:* ${debt.name}`,
            `*Cuota:* ${formatDate(dueDate)}`,
            `*Saldo pendiente:* ${formatCurrency(balance)}`,
            `*Frecuencia:* ${formatFrequency(debt.paymentFrequency)}`,
          ].join("\n");

          if (isOverdue) {
            const hoursSinceLast = notification.lastOverdueSent
              ? hoursBetween(notification.lastOverdueSent, now)
              : Infinity;

            if (hoursSinceLast >= HOURS_BETWEEN_OVERDUE) {
              const overdueDays = Math.abs(daysUntilDue);
              const message = [
                "🚨 *Pago vencido*",
                "",
                baseMessage,
                `*Días de retraso:* ${overdueDays}`,
                "",
                "_Confirma que leíste este mensaje_",
              ].join("\n");

              await sendTelegramMessageWithConfirm(chatId, message, notification.id);
              await prisma.installmentNotification.update({
                where: { id: notification.id },
                data: { lastOverdueSent: now },
              });
            }
          } else if (isDueToday) {
            if (!notification.dueDateSent) {
              const message = [
                "📅 *Vence hoy*",
                "",
                baseMessage,
                "",
                "_Confirma que leíste este mensaje_",
              ].join("\n");

              await sendTelegramMessageWithConfirm(chatId, message, notification.id);
              await prisma.installmentNotification.update({
                where: { id: notification.id },
                data: { dueDateSent: true },
              });
            } else {
              const hoursSinceLast = notification.lastOverdueSent
                ? hoursBetween(notification.lastOverdueSent, now)
                : Infinity;

              if (hoursSinceLast >= HOURS_BETWEEN_OVERDUE) {
                const message = [
                  "⏰ *Recordatorio - Vence hoy*",
                  "",
                  baseMessage,
                  "",
                  "_Confirma que leíste este mensaje_",
                ].join("\n");

                await sendTelegramMessageWithConfirm(chatId, message, notification.id);
                await prisma.installmentNotification.update({
                  where: { id: notification.id },
                  data: { lastOverdueSent: now },
                });
              }
            }
          } else if (daysUntilDue === 5) {
            if (!notification.fiveDaySent) {
              const message = [
                "📋 *Recordatorio anticipado*",
                "",
                baseMessage,
                `*Días restantes:* 5`,
              ].join("\n");

              await sendTelegramMessage(chatId, message);
              await prisma.installmentNotification.update({
                where: { id: notification.id },
                data: { fiveDaySent: true },
              });
            }
          } else if (daysUntilDue >= 1 && daysUntilDue <= 4) {
            const alreadySentToday =
              notification.dailyLastSent && isSameDay(notification.dailyLastSent, now);

            if (!alreadySentToday) {
              const message = [
                "⏰ *Recordatorio de pago*",
                "",
                baseMessage,
                `*Días restantes:* ${daysUntilDue}`,
              ].join("\n");

              await sendTelegramMessage(chatId, message);
              await prisma.installmentNotification.update({
                where: { id: notification.id },
                data: { dailyLastSent: now },
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Cron job error:", error);
    }
  });

  console.log("Reminder cron job started (hourly)");
}
