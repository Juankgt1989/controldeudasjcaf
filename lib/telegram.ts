import TelegramBot from "node-telegram-bot-api";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentAmount,
  formatCurrency,
  formatDate,
  escapeTelegramMarkdown,
} from "@/lib/utils";
import {
  TELEGRAM_BOT_COMMANDS,
  createTelegramCommandHandler,
} from "@/lib/telegram-commands";

const token = process.env.TELEGRAM_BOT_TOKEN;

export const bot = token ? new TelegramBot(token, { polling: true }) : null;

const globalForPolling = global as unknown as { pollingStarted?: boolean };

export function startTelegramPolling() {
  if (!bot || globalForPolling.pollingStarted) return;
  globalForPolling.pollingStarted = true;

  const activeBot = bot;

  activeBot.setMyCommands(TELEGRAM_BOT_COMMANDS).catch((error) => {
    console.error("Failed to register Telegram bot commands:", error);
  });

  const commandHandler = createTelegramCommandHandler({
    isAuthorizedChat: async (chatId) => {
      const authorizedUser = await prisma.user.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true },
      });
      return Boolean(authorizedUser);
    },
    getUnpaidDebts: async () =>
      prisma.debt.findMany({
        where: { status: { not: "PAID" } },
        include: { payments: { select: { amount: true } } },
        orderBy: { name: "asc" },
      }),
    getDebtById: async (debtId) =>
      prisma.debt.findUnique({
        where: { id: debtId },
        include: { payments: { select: { amount: true } } },
      }),
    recordPayment: async ({ debtId, amount, paymentDate, notes, markPaid }) => {
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            debtId,
            amount,
            paymentDate,
            notes,
          },
        });

        if (markPaid) {
          await tx.debt.update({
            where: { id: debtId },
            data: { status: "PAID" },
          });
        }
      });
    },
    sendMessage: async (chatId, text, buttons) => {
      await activeBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
      });
    },
    editMessage: async (chatId, messageId, text, buttons) => {
      await activeBot
        .editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
        })
        .catch(() => {});
    },
    answerCallback: async (queryId, text) => {
      await activeBot
        .answerCallbackQuery(queryId, text ? { text } : undefined)
        .catch(() => {});
    },
  });

  activeBot.on("message", async (msg) => {
    if (!msg.text || !msg.chat) return;
    const chatId = msg.chat.id.toString();

    try {
      await commandHandler.handleMessage(chatId, msg.text);
    } catch (error) {
      console.error("Error handling Telegram message:", error);
      activeBot
        .sendMessage(chatId, "⚠️ Ocurrió un error al procesar tu solicitud.")
        .catch(() => {});
    }
  });

  activeBot.on("callback_query", async (query) => {
    if (!query.data || !query.message) return;

    const data = query.data;
    const chatId = query.message.chat.id.toString();

    if (data.startsWith("cmdpay_")) {
      try {
        await commandHandler.handleCallback(
          query.id,
          chatId,
          query.message.message_id,
          data
        );
      } catch (error) {
        console.error("Error handling Telegram command callback:", error);
        activeBot
          .answerCallbackQuery(query.id, { text: "Error al procesar la acción" })
          .catch(() => {});
      }
      return;
    }

    const authorizedUser = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
      select: { id: true },
    });

    if (!authorizedUser) {
      bot
        .answerCallbackQuery(query.id, { text: "No autorizado" })
        .catch(() => {});
      return;
    }

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
    } else if (data.startsWith("snooze_")) {
      const notificationId = data.replace("snooze_", "");

      try {
        const notification = await prisma.installmentNotification.findUnique({
          where: { id: notificationId },
          include: { debt: { select: { name: true } } },
        });

        if (!notification) {
          bot.answerCallbackQuery(query.id, { text: "Notificación no encontrada" }).catch(() => {});
          return;
        }

        const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.installmentNotification.update({
          where: { id: notificationId },
          data: {
            remindersSuppressedUntil: until,
            confirmed: true,
          },
        });

        bot.answerCallbackQuery(query.id, { text: "Silenciado por 7 días 🔕" }).catch(() => {});

        await bot.editMessageText(
          `🔕 *Recordatorios silenciados por 7 días*\n\n*Deuda:* ${escapeTelegramMarkdown(notification.debt.name)}\n*Cuota:* ${formatDate(notification.dueDate)}\n*Se reactivará:* ${formatDate(until)}\n\n_Si la cuota sigue impaga después de esa fecha, los avisos volverán automáticamente._`,
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
        console.error("Error handling snooze callback:", error);
        bot.answerCallbackQuery(query.id, { text: "Error al silenciar" }).catch(() => {});
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

        const recentPayment = await prisma.payment.findFirst({
          where: {
            debtId: debt.id,
            notes: { contains: `notif:${notificationId}` },
            createdAt: { gte: new Date(Date.now() - 60_000) },
          },
        });
        if (recentPayment) {
          bot.answerCallbackQuery(query.id, { text: "Espera un momento entre pagos" }).catch(() => {});
          return;
        }

        const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Number(debt.totalAmount) - paid;
        const installment = getInstallmentAmount(
          Number(debt.totalAmount),
          debt.startDate,
          debt.endDate,
          debt.paymentFrequency,
          debt.dueDay,
          debt.numberOfInstallments
        );
        const amount = Math.min(installment, Math.max(balance, 0));

        if (amount <= 0) {
          bot.answerCallbackQuery(query.id, { text: "La deuda ya está al día" }).catch(() => {});
          await bot.editMessageText(
            `✅ *Deuda al día*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\nNo se registró ningún pago.`,
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
          `✅ *Pago registrado*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Cuota:* ${formatDate(notification.dueDate)}\n*Monto:* ${formatCurrency(amount)}\n\n_El pago quedó registrado en la aplicación._`,
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
          debt.dueDay,
          debt.numberOfInstallments
        );
        const amount = Math.min(installment, Math.max(balance, 0));

        bot.answerCallbackQuery(query.id, { text: "Confirmar" }).catch(() => {});

        await bot.editMessageText(
          `💳 *Confirmar registro de pago*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Cuota:* ${formatDate(notification.dueDate)}\n*Monto:* ${formatCurrency(amount)}\n\n_¿Registrar este pago en la aplicación?_`,
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

export async function sendTelegramMessage(
  chatId: string,
  message: string
): Promise<boolean> {
  if (!bot || !chatId) {
    console.log("Telegram not configured");
    return false;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    return true;
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return false;
  }
}

export async function sendTelegramMessageWithButtons(
  chatId: string,
  message: string,
  notificationId: string,
  buttons: { text: string; callbackData: string }[]
): Promise<boolean> {
  if (!bot || !chatId) {
    console.log("Telegram not configured");
    return false;
  }

  try {
    const inlineKeyboard = buttons.map((b) => [
      { text: b.text, callback_data: b.callbackData },
    ]);

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
    return true;
  } catch (error) {
    console.error("Failed to send Telegram message with buttons:", error);
    return false;
  }
}

export async function sendTelegramMessageWithConfirm(
  chatId: string,
  message: string,
  notificationId: string,
  extraButtons: { text: string; callbackData: string }[] = []
): Promise<boolean> {
  return sendTelegramMessageWithButtons(chatId, message, notificationId, [
    { text: "✅ Confirmar recepción", callbackData: `confirm_${notificationId}` },
    ...extraButtons,
  ]);
}
