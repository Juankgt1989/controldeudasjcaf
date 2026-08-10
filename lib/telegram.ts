import TelegramBot from "node-telegram-bot-api";
import { prisma } from "@/lib/prisma";
import { getInstallmentAmount, formatCurrency, formatDate } from "@/lib/utils";

const token = process.env.TELEGRAM_BOT_TOKEN;

export const bot = token ? new TelegramBot(token, { polling: true }) : null;

const globalForPolling = global as unknown as { pollingStarted?: boolean };

export function startTelegramPolling() {
  if (!bot || globalForPolling.pollingStarted) return;
  globalForPolling.pollingStarted = true;

  bot.on("callback_query", async (query) => {
    if (!query.data || !query.message) return;

    const data = query.data;
    const chatId = query.message.chat.id.toString();

    if (data.startsWith("confirm_")) {
      const notificationId = data.replace("confirm_", "");

      try {
        const notification = await prisma.installmentNotification.findUnique({
          where: { id: notificationId },
        });

        if (!notification) {
          bot.answerCallbackQuery(query.id, { text: "Notificación no encontrada" }).catch(() => {});
          return;
        }

        if (notification.confirmed) {
          bot.answerCallbackQuery(query.id, { text: "Ya estaba confirmada ✓" }).catch(() => {});
          return;
        }

        await prisma.installmentNotification.update({
          where: { id: notificationId },
          data: { confirmed: true },
        });

        bot.answerCallbackQuery(query.id, { text: "Notificación confirmada ✓" }).catch(() => {});

        await bot.editMessageText(
          "✅ *Recordatorio confirmado*\n\nHas confirmado la recepción de este recordatorio.",
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "Markdown",
          }
        ).catch(() => {});

        for (const msgId of notification.sentMessageIds) {
          if (msgId === query.message.message_id.toString()) continue;
          bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: parseInt(msgId, 10) }
          ).catch(() => {});
        }
      } catch (error) {
        console.error("Error handling callback query:", error);
        bot.answerCallbackQuery(query.id, { text: "Error al confirmar" }).catch(() => {});
      }
    } else if (data.startsWith("payyes_")) {
      const notificationId = data.replace("payyes_", "");

      try {
        const notification = await prisma.installmentNotification.findUnique({
          where: { id: notificationId },
          include: {
            debt: { include: { payments: { select: { amount: true } } } },
          },
        });

        if (!notification) {
          bot.answerCallbackQuery(query.id, { text: "Notificación no encontrada" }).catch(() => {});
          return;
        }

        const debt = notification.debt;

        const alreadyRegistered = await prisma.payment.findFirst({
          where: { debtId: debt.id, notes: { contains: `notif:${notificationId}` } },
        });
        if (alreadyRegistered) {
          bot.answerCallbackQuery(query.id, { text: "Este pago ya fue registrado ✓" }).catch(() => {});
          return;
        }

        const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(debt.totalAmount) - paid;
        const installment = getInstallmentAmount(
          Number(debt.totalAmount),
          debt.startDate,
          debt.endDate,
          debt.paymentFrequency,
          debt.dueDay
        );
        const amount = Math.min(installment, Math.max(balance, 0));

        if (amount <= 0) {
          bot.answerCallbackQuery(query.id, { text: "La deuda ya está al día" }).catch(() => {});
          await bot.editMessageText(
            `✅ *Deuda al día*\n\n*Deuda:* ${debt.name}\nNo se registró ningún pago.`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: "Markdown",
            }
          ).catch(() => {});
          return;
        }

        await prisma.payment.create({
          data: {
            debtId: debt.id,
            amount,
            paymentDate: new Date(),
            notes: `Pago desde Telegram (notif:${notificationId})`,
          },
        });

        if (paid + amount >= Number(debt.totalAmount)) {
          await prisma.debt.update({
            where: { id: debt.id },
            data: { status: "PAID" },
          });
        }

        if (!notification.confirmed) {
          await prisma.installmentNotification.update({
            where: { id: notificationId },
            data: { confirmed: true },
          });
        }

        bot.answerCallbackQuery(query.id, { text: `Pago de ${formatCurrency(amount)} registrado ✓` }).catch(() => {});

        await bot.editMessageText(
          `✅ *Pago registrado*\n\n*Deuda:* ${debt.name}\n*Cuota:* ${formatDate(notification.dueDate)}\n*Monto:* ${formatCurrency(amount)}\n\n_El pago quedó registrado en la aplicación._`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "Markdown",
          }
        ).catch(() => {});

        for (const msgId of notification.sentMessageIds) {
          if (msgId === query.message.message_id.toString()) continue;
          bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: parseInt(msgId, 10) }
          ).catch(() => {});
        }
      } catch (error) {
        console.error("Error handling payment callback:", error);
        bot.answerCallbackQuery(query.id, { text: "Error al registrar el pago" }).catch(() => {});
      }
    } else if (data.startsWith("payno_")) {
      bot.answerCallbackQuery(query.id, { text: "Pago cancelado" }).catch(() => {});
      await bot.editMessageText(
        "❌ *Registro de pago cancelado*",
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "Markdown",
        }
      ).catch(() => {});
    } else if (data.startsWith("pay_")) {
      const notificationId = data.replace("pay_", "");

      try {
        const notification = await prisma.installmentNotification.findUnique({
          where: { id: notificationId },
          include: {
            debt: { include: { payments: { select: { amount: true } } } },
          },
        });

        if (!notification) {
          bot.answerCallbackQuery(query.id, { text: "Notificación no encontrada" }).catch(() => {});
          return;
        }

        const debt = notification.debt;
        const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(debt.totalAmount) - paid;
        const installment = getInstallmentAmount(
          Number(debt.totalAmount),
          debt.startDate,
          debt.endDate,
          debt.paymentFrequency,
          debt.dueDay
        );
        const amount = Math.min(installment, Math.max(balance, 0));

        bot.answerCallbackQuery(query.id, { text: "Confirmar" }).catch(() => {});

        await bot.editMessageText(
          `💳 *Confirmar registro de pago*\n\n*Deuda:* ${debt.name}\n*Cuota:* ${formatDate(notification.dueDate)}\n*Monto:* ${formatCurrency(amount)}\n\n_¿Registrar este pago en la aplicación?_`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Sí, registrar", callback_data: `payyes_${notificationId}` }],
                [{ text: "✖️ Cancelar", callback_data: `payno_${notificationId}` }],
              ],
            },
          }
        ).catch(() => {});
      } catch (error) {
        console.error("Error handling payment callback:", error);
        bot.answerCallbackQuery(query.id, { text: "Error al registrar el pago" }).catch(() => {});
      }
    }
  });

  console.log("Telegram polling started for callbacks");
}

export async function sendTelegramMessage(chatId: string, message: string) {
  if (!bot || !chatId) {
    console.log("Telegram not configured");
    return;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
}

export async function sendTelegramMessageWithConfirm(
  chatId: string,
  message: string,
  notificationId: string,
  extraButtons: { text: string; callbackData: string }[] = []
) {
  if (!bot || !chatId) {
    console.log("Telegram not configured");
    return;
  }

  try {
    const inlineKeyboard = [
      [{ text: "✅ Confirmar recepción", callback_data: `confirm_${notificationId}` }],
      ...extraButtons.map((b) => [{ text: b.text, callback_data: b.callbackData }]),
    ];

    const result = await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });

    await prisma.installmentNotification.update({
      where: { id: notificationId },
      data: { sentMessageIds: { push: result.message_id.toString() } },
    });
  } catch (error) {
    console.error("Failed to send Telegram message with confirm:", error);
  }
}
