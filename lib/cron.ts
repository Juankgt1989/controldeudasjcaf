import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramMessageWithConfirm,
  startTelegramPolling,
} from "@/lib/telegram";
import {
  getDueDates,
  formatCurrency,
  formatFrequency,
  formatDate,
  escapeTelegramMarkdown,
} from "@/lib/utils";
import { PaymentFrequency } from "@prisma/client";

const globalForCron = global as unknown as { cronStarted?: boolean };

const GUATEMALA_TZ = "America/Guatemala";
// Lunes 09:00 hora Guatemala
const WEEKLY_SUMMARY_CRON = "0 9 * * 1";
// Recordatorio de cierre para cuotas que vencen hoy (18:00 hora Guatemala)
const DUE_TODAY_FOLLOWUP_HOUR = 18;
// Frecuencia en días para cuotas vencidas ya confirmadas
const CONFIRMED_OVERDUE_INTERVAL_DAYS = 3;

const gtDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GUATEMALA_TZ,
});

function guatemalaDateString(date: Date): string {
  return gtDateFormatter.format(date);
}

function guatemalaDayMs(date: Date): number {
  const [year, month, day] = guatemalaDateString(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysUntilDueDate(dueDate: Date, now: Date): number {
  const todayMs = guatemalaDayMs(now);
  const dueMs = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate()
  );
  return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}

function daysBetweenGuatemalaDates(from: Date, to: Date): number {
  return Math.round(
    (guatemalaDayMs(to) - guatemalaDayMs(from)) / (1000 * 60 * 60 * 24)
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return guatemalaDateString(a) === guatemalaDateString(b);
}

function getGuatemalaHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: GUATEMALA_TZ,
      hourCycle: "h23",
      hour: "numeric",
    }).format(now)
  );
}

async function sendWeeklySummary() {
  console.log("Running weekly summary:", new Date().toISOString());

  try {
    const user = await prisma.user.findFirst({
      where: { telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) {
      console.log("No Telegram chat ID configured");
      return;
    }

    const debts = await prisma.debt.findMany({
      where: { status: { not: "PAID" } },
      include: { payments: { select: { amount: true } } },
      orderBy: { name: "asc" },
    });

    const ahora = new Date();
    const bloques: string[] = [];
    let totalPendiente = 0;

    for (const debt of debts) {
      const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Number(debt.totalAmount) - paid;
      if (balance <= 0) continue;

      const dueDates = getDueDates(
        debt.startDate,
        debt.endDate,
        debt.paymentFrequency as PaymentFrequency,
        debt.dueDay ?? undefined,
        debt.numberOfInstallments
      );
      if (dueDates.length === 0) continue;

      const installment = Number(debt.totalAmount) / dueDates.length;
      const unpaid = dueDates.filter((_d, i) => paid < installment * (i + 1));
      if (unpaid.length === 0) continue;

      const proxima = unpaid[0];
      const dias = daysUntilDueDate(proxima, ahora);
      const cuando =
        dias < 0
          ? `vencida hace ${Math.abs(dias)} día(s)`
          : dias === 0
            ? "vence hoy"
            : `en ${dias} día(s)`;

      totalPendiente += balance;
      bloques.push(
        `*${escapeTelegramMarkdown(debt.name)}*\n` +
          `   ${unpaid.length} cuota(s) pendiente(s) de ${formatCurrency(installment)}\n` +
          `   Próxima: ${formatDate(proxima)} (${cuando})\n` +
          `   Saldo: ${formatCurrency(balance)}`
      );
    }

    const cuerpo =
      bloques.length > 0
        ? bloques.join("\n\n")
        : "Sin cuotas pendientes esta semana.";

    const partes = [
      "📊 *Resumen semanal de deudas*",
      `_${formatDate(ahora)}_`,
      "",
      cuerpo,
    ];

    if (bloques.length > 0) {
      partes.push("", `*Total pendiente:* ${formatCurrency(totalPendiente)}`);
    }

    await sendTelegramMessage(user.telegramChatId, partes.join("\n"));
  } catch (error) {
    console.error("Weekly summary error:", error);
  }
}

function startWeeklySummary() {
  // 'timezone' (minuscula) es el nombre correcto en node-cron v4.
  cron.schedule(WEEKLY_SUMMARY_CRON, sendWeeklySummary, {
    timezone: GUATEMALA_TZ,
  });
  console.log("Weekly summary cron started (Mondays 9 AM Guatemala)");
}

interface UpcomingDigestItem {
  debtName: string;
  dueDate: Date;
  installment: number;
  balance: number;
  unpaidCount: number;
  daysUntilDue: number;
  notificationId: string;
  field: "fiveDaySent" | "dailyLastSent";
}

export function startReminderCron() {
  if (globalForCron.cronStarted) {
    return;
  }
  globalForCron.cronStarted = true;

  startTelegramPolling();
  startWeeklySummary();

  cron.schedule("0 * * * *", async () => {
    console.log("Running reminder cron job:", new Date().toISOString());

    const now = new Date();
    const gtHour = getGuatemalaHour(now);
    if (gtHour < 9 || gtHour > 20) {
      console.log(
        `Outside notification window (9 AM - 8 PM Guatemala time), current hour: ${gtHour}`
      );
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
        orderBy: { name: "asc" },
      });

      const upcomingDigest: UpcomingDigestItem[] = [];

      for (const debt of debts) {
        const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(debt.totalAmount) - paid;

        if (balance <= 0) continue;

        const dueDates = getDueDates(
          debt.startDate,
          debt.endDate,
          debt.paymentFrequency as PaymentFrequency,
          debt.dueDay ?? undefined,
          debt.numberOfInstallments
        );

        if (dueDates.length === 0) continue;

        const installment = Number(debt.totalAmount) / dueDates.length;

        const unpaidDates = dueDates.filter(
          (_d, i) => paid < installment * (i + 1)
        );

        if (unpaidDates.length === 0) continue;

        const upcomingDates = unpaidDates.filter(
          (d) => daysUntilDueDate(d, now) >= 0
        );

        const overdueDates = unpaidDates
          .filter((d) => daysUntilDueDate(d, now) < 0)
          .sort((a, b) => b.getTime() - a.getTime());

        let targetDates = [...upcomingDates];

        const latestOverdue = overdueDates[0];
        if (latestOverdue) {
          targetDates.unshift(latestOverdue);
        }

        if (targetDates.length === 0) {
          targetDates = [unpaidDates[unpaidDates.length - 1]];
        }

        for (const dueDate of targetDates) {
          const daysUntilDue = daysUntilDueDate(dueDate, now);
          const isOverdue = daysUntilDue < 0;
          const isDueToday = daysUntilDue === 0;

          // Solo procesamos fechas relevantes: vencidas, hoy, mañana (1 día) o en 3 días.
          if (
            !isOverdue &&
            !isDueToday &&
            daysUntilDue !== 1 &&
            daysUntilDue !== 3
          ) {
            continue;
          }

          let notification = debt.installmentNotifications.find(
            (n) =>
              n.dueDate.toISOString().split("T")[0] ===
              dueDate.toISOString().split("T")[0]
          );

          if (!notification) {
            notification = await prisma.installmentNotification.create({
              data: {
                debtId: debt.id,
                dueDate: dueDate,
              },
            });
          }

          // Cuota silenciada temporalmente: el cobro se gestiona fuera de la app.
          // Pasada la fecha, los avisos se reactivan solos.
          if (
            notification.remindersSuppressedUntil &&
            notification.remindersSuppressedUntil > now
          ) {
            continue;
          }

          if (notification.confirmed && !isOverdue) continue;

          const baseMessage = [
            `*Deuda:* ${escapeTelegramMarkdown(debt.name)}`,
            `*Cuota:* ${formatDate(dueDate)}`,
            `*Monto de cuota:* ${formatCurrency(Math.min(installment, balance))}`,
            `*Cuotas pendientes:* ${unpaidDates.length}`,
            `*Saldo pendiente:* ${formatCurrency(balance)}`,
            `*Frecuencia:* ${formatFrequency(debt.paymentFrequency)}`,
          ].join("\n");

          const actionButtons = [
            { text: "💰 Registrar pago", callbackData: `pay_${notification.id}` },
            {
              text: "🔕 Silenciar 7 días",
              callbackData: `snooze_${notification.id}`,
            },
          ];

          if (isOverdue) {
            // Sin confirmar: 1 aviso por día (9 AM).
            // Ya confirmada: 1 aviso cada 3 días para no generar ruido.
            const requiredDays = notification.confirmed
              ? CONFIRMED_OVERDUE_INTERVAL_DAYS
              : 1;
            const daysSinceLast = notification.lastOverdueSent
              ? daysBetweenGuatemalaDates(notification.lastOverdueSent, now)
              : Infinity;

            if (daysSinceLast >= requiredDays) {
              const overdueDays = Math.abs(daysUntilDue);
              const message = [
                "🚨 *Pago vencido*",
                "",
                baseMessage,
                `*Días de retraso:* ${overdueDays}`,
              ].join("\n");

              const sent = notification.confirmed
                ? await sendTelegramMessageWithButtons(
                    chatId,
                    message,
                    notification.id,
                    actionButtons
                  )
                : await sendTelegramMessageWithConfirm(
                    chatId,
                    `${message}\n\n_Confirma que leíste este mensaje o registra el pago_`,
                    notification.id,
                    actionButtons
                  );

              if (sent) {
                await prisma.installmentNotification.update({
                  where: { id: notification.id },
                  data: { lastOverdueSent: now },
                });
              }
            }
          } else if (isDueToday) {
            if (!notification.dueDateSent) {
              // Primer aviso del día (09:00 AM)
              const message = [
                "📅 *Vence hoy*",
                "",
                baseMessage,
                "",
                "_Confirma que leíste este mensaje o registra el pago_",
              ].join("\n");

              const sent = await sendTelegramMessageWithConfirm(
                chatId,
                message,
                notification.id,
                actionButtons
              );

              if (sent) {
                await prisma.installmentNotification.update({
                  where: { id: notification.id },
                  data: { dueDateSent: true, lastOverdueSent: now },
                });
              }
            } else if (gtHour >= DUE_TODAY_FOLLOWUP_HOUR) {
              // Un único recordatorio de cierre a las 18:00 si aún no se confirmó
              const alreadySentEvening =
                notification.lastOverdueSent &&
                isSameDay(notification.lastOverdueSent, now) &&
                getGuatemalaHour(notification.lastOverdueSent) >=
                  DUE_TODAY_FOLLOWUP_HOUR;

              if (!alreadySentEvening) {
                const message = [
                  "⏰ *Recordatorio — Vence hoy*",
                  "",
                  baseMessage,
                  "",
                  "_Último aviso de hoy. Confirma o registra el pago_",
                ].join("\n");

                const sent = await sendTelegramMessageWithConfirm(
                  chatId,
                  message,
                  notification.id,
                  actionButtons
                );

                if (sent) {
                  await prisma.installmentNotification.update({
                    where: { id: notification.id },
                    data: { lastOverdueSent: now },
                  });
                }
              }
            }
          } else if (daysUntilDue === 3) {
            if (!notification.fiveDaySent) {
              upcomingDigest.push({
                debtName: debt.name,
                dueDate,
                installment: Math.min(installment, balance),
                balance,
                unpaidCount: unpaidDates.length,
                daysUntilDue,
                notificationId: notification.id,
                field: "fiveDaySent",
              });
            }
          } else if (daysUntilDue === 1) {
            const alreadySentToday =
              notification.dailyLastSent &&
              isSameDay(notification.dailyLastSent, now);

            if (!alreadySentToday) {
              upcomingDigest.push({
                debtName: debt.name,
                dueDate,
                installment: Math.min(installment, balance),
                balance,
                unpaidCount: unpaidDates.length,
                daysUntilDue,
                notificationId: notification.id,
                field: "dailyLastSent",
              });
            }
          }
        }
      }

      // Enviar avisos anticipados (3 días / mañana) agrupados en un solo mensaje
      if (upcomingDigest.length > 0) {
        let digestMessage: string;

        if (upcomingDigest.length === 1) {
          const item = upcomingDigest[0];
          const header =
            item.daysUntilDue === 1
              ? "⏰ *Vence mañana*"
              : "📋 *Próximo vencimiento (en 3 días)*";
          digestMessage = [
            header,
            "",
            `*Deuda:* ${escapeTelegramMarkdown(item.debtName)}`,
            `*Cuota:* ${formatDate(item.dueDate)}`,
            `*Monto de cuota:* ${formatCurrency(item.installment)}`,
            `*Cuotas pendientes:* ${item.unpaidCount}`,
            `*Saldo pendiente:* ${formatCurrency(item.balance)}`,
          ].join("\n");
        } else {
          const bloques = upcomingDigest
            .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
            .map((item) => {
              const cuando =
                item.daysUntilDue === 1 ? "vence mañana" : "en 3 días";
              return (
                `• *${escapeTelegramMarkdown(item.debtName)}* (${cuando})\n` +
                `   Fecha: ${formatDate(item.dueDate)} · Cuota: ${formatCurrency(item.installment)}\n` +
                `   Saldo: ${formatCurrency(item.balance)}`
              );
            });

          digestMessage = [
            "📋 *Próximos vencimientos*",
            "",
            bloques.join("\n\n"),
          ].join("\n");
        }

        const sent = await sendTelegramMessage(chatId, digestMessage);
        if (sent) {
          for (const item of upcomingDigest) {
            await prisma.installmentNotification.update({
              where: { id: item.notificationId },
              data:
                item.field === "fiveDaySent"
                  ? { fiveDaySent: true }
                  : { dailyLastSent: now },
            });
          }
        }
      }
    } catch (error) {
      console.error("Cron job error:", error);
    }
  });

  console.log("Reminder cron job started (hourly smart cadence)");
}
