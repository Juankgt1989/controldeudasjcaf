import TelegramBot from "node-telegram-bot-api";
import { prisma } from "@/lib/prisma";

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
  notificationId: string
) {
  if (!bot || !chatId) {
    console.log("Telegram not configured");
    return;
  }

  try {
    const result = await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmar recepción", callback_data: `confirm_${notificationId}` }],
        ],
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
