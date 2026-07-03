import TelegramBot from "node-telegram-bot-api";

const token = process.env.TELEGRAM_BOT_TOKEN;

export const bot = token ? new TelegramBot(token, { polling: false }) : null;

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