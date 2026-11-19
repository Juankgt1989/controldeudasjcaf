import crypto from "node:crypto";
import { PaymentFrequency } from "@prisma/client";
import {
  escapeTelegramMarkdown,
  formatCurrency,
  formatDate,
  getDueDates,
  getPaidInstallments,
} from "./utils";

const GUATEMALA_TZ = "America/Guatemala";
const BALANCE_TOLERANCE = 0.005;
const PENDING_TTL_MS = 5 * 60 * 1000;

const gtDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GUATEMALA_TZ,
});

const gtMonthLabelFormatter = new Intl.DateTimeFormat("es-GT", {
  month: "long",
  year: "numeric",
  timeZone: GUATEMALA_TZ,
});

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramDebtRecord {
  id: string;
  name: string;
  totalAmount: number | string | { toString(): string };
  startDate: Date;
  endDate: Date;
  paymentFrequency: PaymentFrequency;
  dueDay: number | null;
  numberOfInstallments: number | null;
  status: string;
  payments: Array<{ amount: number | string | { toString(): string } }>;
}

export interface RecordPaymentInput {
  debtId: string;
  amount: number;
  paymentDate: Date;
  notes: string;
  markPaid: boolean;
}

export interface TelegramCommandDeps {
  isAuthorizedChat: (chatId: string) => Promise<boolean>;
  getUnpaidDebts: () => Promise<TelegramDebtRecord[]>;
  getDebtById: (debtId: string) => Promise<TelegramDebtRecord | null>;
  recordPayment: (input: RecordPaymentInput) => Promise<void>;
  sendMessage: (
    chatId: string,
    text: string,
    buttons?: InlineButton[][]
  ) => Promise<void>;
  editMessage: (
    chatId: string,
    messageId: number,
    text: string,
    buttons?: InlineButton[][]
  ) => Promise<void>;
  answerCallback: (queryId: string, text?: string) => Promise<void>;
  now?: () => Date;
}

export const TELEGRAM_BOT_COMMANDS = [
  { command: "resumen", description: "Resumen de deudas pendientes" },
  { command: "vencidas", description: "Cuotas vencidas y días de retraso" },
  { command: "mes", description: "Cuotas que vencen este mes" },
  { command: "pagar", description: "Registrar un pago (cuota o monto libre)" },
  { command: "ayuda", description: "Ver comandos disponibles" },
];

export function parseTelegramCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const firstToken = trimmed.split(/\s+/)[0];
  const withoutSlash = firstToken.slice(1);
  if (!withoutSlash) return null;
  const command = withoutSlash.split("@")[0].toLowerCase();
  return command || null;
}

export function parseAmountInput(text: string): number | null {
  const cleaned = text.trim().replace(/^[qQ]\s*/, "").replace(/\s+/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    // Assume comma is thousands separator: 1,250.50
    normalized = normalized.replace(/,/g, "");
  } else if (hasComma) {
    // Allow decimal comma (e.g. 150,75) or thousands comma (1,250)
    const parts = normalized.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export function getGuatemalaTodayUTCDate(now: Date = new Date()): Date {
  const [year, month, day] = gtDateFormatter.format(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysUntilDueDate(dueDate: Date, now: Date): number {
  const todayMs = getGuatemalaTodayUTCDate(now).getTime();
  const dueMs = Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate()
  );
  return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}

function analyzeDebt(debt: TelegramDebtRecord) {
  const total = Number(debt.totalAmount);
  const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = Math.max(total - paid, 0);
  const dueDates = getDueDates(
    debt.startDate,
    debt.endDate,
    debt.paymentFrequency,
    debt.dueDay,
    debt.numberOfInstallments
  );
  const installment = dueDates.length > 0 ? total / dueDates.length : balance;
  const paidCount = getPaidInstallments(paid, total, dueDates.length);
  const unpaidDates = dueDates.slice(paidCount);
  const standardPayAmount =
    Math.round(Math.min(installment, balance) * 100) / 100;

  return {
    total,
    paid,
    balance,
    dueDates,
    installment,
    paidCount,
    unpaidDates,
    standardPayAmount,
  };
}

function formatRelativeDays(days: number): string {
  if (days < 0) return `vencida hace ${Math.abs(days)} día(s)`;
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `en ${days} día(s)`;
}

export function formatHelpMessage(): string {
  return [
    "🤖 *Comandos disponibles*",
    "",
    "/resumen — Resumen de todas tus deudas pendientes",
    "/vencidas — Cuotas vencidas y días de retraso",
    "/mes — Cuotas que vencen este mes",
    "/pagar — Registrar un pago (cuota o monto libre)",
    "/cancelar — Cancelar un registro de pago en curso",
    "/ayuda — Mostrar esta lista de comandos",
  ].join("\n");
}

export function formatSummaryMessage(
  debts: TelegramDebtRecord[],
  now: Date = new Date()
): string {
  const bloques: string[] = [];
  let totalPendiente = 0;

  for (const debt of debts) {
    const info = analyzeDebt(debt);
    if (info.balance <= BALANCE_TOLERANCE || info.unpaidDates.length === 0) {
      continue;
    }

    const proxima = info.unpaidDates[0];
    const dias = daysUntilDueDate(proxima, now);

    totalPendiente += info.balance;
    bloques.push(
      `*${escapeTelegramMarkdown(debt.name)}*\n` +
        `   ${info.unpaidDates.length} cuota(s) pendiente(s) de ${formatCurrency(info.standardPayAmount)}\n` +
        `   Próxima: ${formatDate(proxima)} (${formatRelativeDays(dias)})\n` +
        `   Saldo: ${formatCurrency(info.balance)}`
    );
  }

  if (bloques.length === 0) {
    return "✅ *Resumen de deudas*\n\nNo tienes deudas pendientes.";
  }

  return [
    "📊 *Resumen de deudas*",
    `_${formatDate(getGuatemalaTodayUTCDate(now))}_`,
    "",
    bloques.join("\n\n"),
    "",
    `*Total pendiente:* ${formatCurrency(totalPendiente)}`,
  ].join("\n");
}

export function formatOverdueMessage(
  debts: TelegramDebtRecord[],
  now: Date = new Date()
): string {
  const bloques: string[] = [];
  let totalVencido = 0;

  for (const debt of debts) {
    const info = analyzeDebt(debt);
    if (info.balance <= BALANCE_TOLERANCE || info.unpaidDates.length === 0) {
      continue;
    }

    const overdueDates = info.unpaidDates.filter(
      (d) => daysUntilDueDate(d, now) < 0
    );
    if (overdueDates.length === 0) continue;

    const oldest = overdueDates[0];
    const oldestDaysLate = Math.abs(daysUntilDueDate(oldest, now));
    const overdueAmount = Math.min(
      overdueDates.length * info.installment,
      info.balance
    );

    totalVencido += overdueAmount;
    bloques.push(
      `*${escapeTelegramMarkdown(debt.name)}*\n` +
        `   ${overdueDates.length} cuota(s) vencida(s) · ${formatCurrency(overdueAmount)}\n` +
        `   Más antigua: ${formatDate(oldest)} (${oldestDaysLate} día(s) de retraso)\n` +
        `   Saldo total: ${formatCurrency(info.balance)}`
    );
  }

  if (bloques.length === 0) {
    return "✅ *Cuotas vencidas*\n\nNo tienes cuotas vencidas.";
  }

  return [
    "🚨 *Cuotas vencidas*",
    `_${formatDate(getGuatemalaTodayUTCDate(now))}_`,
    "",
    bloques.join("\n\n"),
    "",
    `*Total vencido:* ${formatCurrency(totalVencido)}`,
  ].join("\n");
}

export function formatMonthMessage(
  debts: TelegramDebtRecord[],
  now: Date = new Date()
): string {
  const todayGT = getGuatemalaTodayUTCDate(now);
  const currentYear = todayGT.getUTCFullYear();
  const currentMonth = todayGT.getUTCMonth();
  const monthLabel = gtMonthLabelFormatter.format(now);

  const items: Array<{
    debtName: string;
    dueDate: Date;
    amount: number;
    days: number;
  }> = [];

  for (const debt of debts) {
    const info = analyzeDebt(debt);
    if (info.balance <= BALANCE_TOLERANCE || info.unpaidDates.length === 0) {
      continue;
    }

    let remaining = info.balance;
    for (const dueDate of info.unpaidDates) {
      const installmentAmount = Math.min(info.installment, remaining);
      remaining = Math.max(remaining - installmentAmount, 0);

      if (
        dueDate.getUTCFullYear() === currentYear &&
        dueDate.getUTCMonth() === currentMonth
      ) {
        items.push({
          debtName: debt.name,
          dueDate,
          amount: installmentAmount,
          days: daysUntilDueDate(dueDate, now),
        });
      }
    }
  }

  items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  if (items.length === 0) {
    return `📅 *Cuotas de ${monthLabel}*\n\nNo tienes cuotas pendientes para este mes.`;
  }

  const totalMes = items.reduce((sum, item) => sum + item.amount, 0);
  const bloques = items.map(
    (item) =>
      `• *${escapeTelegramMarkdown(item.debtName)}*\n` +
      `   ${formatDate(item.dueDate)} (${formatRelativeDays(item.days)}) · ${formatCurrency(item.amount)}`
  );

  return [
    `📅 *Cuotas de ${monthLabel}*`,
    "",
    bloques.join("\n\n"),
    "",
    `*Total pendiente del mes:* ${formatCurrency(totalMes)}`,
  ].join("\n");
}

interface PendingCustomAmount {
  debtId: string;
  debtName: string;
  expiresAt: number;
}

interface PendingPaymentConfirmation {
  chatId: string;
  debtId: string;
  amount: number;
  expiresAt: number;
}

export function createTelegramCommandHandler(deps: TelegramCommandDeps) {
  const pendingCustomByChat = new Map<string, PendingCustomAmount>();
  const pendingConfirmByToken = new Map<string, PendingPaymentConfirmation>();

  const getNow = () => (deps.now ? deps.now() : new Date());

  function pruneExpired(nowMs: number) {
    for (const [chatId, entry] of pendingCustomByChat) {
      if (nowMs >= entry.expiresAt) pendingCustomByChat.delete(chatId);
    }
    for (const [token, entry] of pendingConfirmByToken) {
      if (nowMs >= entry.expiresAt) pendingConfirmByToken.delete(token);
    }
  }

  function createConfirmToken(
    chatId: string,
    debtId: string,
    amount: number
  ): string {
    const nowMs = getNow().getTime();
    pruneExpired(nowMs);
    const token = crypto.randomBytes(6).toString("hex");
    pendingConfirmByToken.set(token, {
      chatId,
      debtId,
      amount,
      expiresAt: nowMs + PENDING_TTL_MS,
    });
    return token;
  }

  async function handleMessage(chatId: string, text: string): Promise<void> {
    const now = getNow();
    pruneExpired(now.getTime());

    const command = parseTelegramCommand(text);
    const pendingCustom = pendingCustomByChat.get(chatId);

    // Ignore regular chat messages if no command and no active custom-amount flow
    if (!command && !pendingCustom) {
      return;
    }

    const authorized = await deps.isAuthorizedChat(chatId);
    if (!authorized) {
      pendingCustomByChat.delete(chatId);
      await deps.sendMessage(chatId, "No autorizado.");
      return;
    }

    if (command === "cancelar") {
      pendingCustomByChat.delete(chatId);
      await deps.sendMessage(chatId, "❌ Registro de pago cancelado.");
      return;
    }

    if (command) {
      // Starting any new command clears an unfinished custom-amount prompt
      pendingCustomByChat.delete(chatId);

      if (command === "start" || command === "ayuda" || command === "help") {
        await deps.sendMessage(chatId, formatHelpMessage());
        return;
      }

      if (command === "resumen") {
        const debts = await deps.getUnpaidDebts();
        await deps.sendMessage(chatId, formatSummaryMessage(debts, now));
        return;
      }

      if (command === "vencidas") {
        const debts = await deps.getUnpaidDebts();
        await deps.sendMessage(chatId, formatOverdueMessage(debts, now));
        return;
      }

      if (command === "mes") {
        const debts = await deps.getUnpaidDebts();
        await deps.sendMessage(chatId, formatMonthMessage(debts, now));
        return;
      }

      if (command === "pagar") {
        const debts = await deps.getUnpaidDebts();
        const activeDebts = debts.filter(
          (d) => analyzeDebt(d).balance > BALANCE_TOLERANCE
        );

        if (activeDebts.length === 0) {
          await deps.sendMessage(
            chatId,
            "✅ No tienes deudas pendientes por pagar."
          );
          return;
        }

        const buttons: InlineButton[][] = activeDebts.map((debt) => {
          const info = analyzeDebt(debt);
          return [
            {
              text: `${debt.name} (${formatCurrency(info.balance)})`,
              callback_data: `cmdpay_sel_${debt.id}`,
            },
          ];
        });
        buttons.push([{ text: "✖️ Cancelar", callback_data: "cmdpay_cancel" }]);

        await deps.sendMessage(
          chatId,
          "💰 *Registrar pago*\n\nSelecciona la deuda a la que deseas abonar:",
          buttons
        );
        return;
      }

      await deps.sendMessage(
        chatId,
        "Comando no reconocido. Usa /ayuda para ver los comandos disponibles."
      );
      return;
    }

    // Handle custom amount text reply
    if (pendingCustom) {
      const amount = parseAmountInput(text);
      if (amount === null) {
        await deps.sendMessage(
          chatId,
          "⚠️ Monto inválido. Escribe un número positivo (ej. `250` o `250.50`), o envía /cancelar."
        );
        return;
      }

      const debt = await deps.getDebtById(pendingCustom.debtId);
      if (!debt || debt.status === "PAID") {
        pendingCustomByChat.delete(chatId);
        await deps.sendMessage(
          chatId,
          "⚠️ Esa deuda ya no está disponible o fue liquidada."
        );
        return;
      }

      const info = analyzeDebt(debt);
      if (info.balance <= BALANCE_TOLERANCE) {
        pendingCustomByChat.delete(chatId);
        await deps.sendMessage(chatId, "✅ Esta deuda ya está al día.");
        return;
      }

      if (amount > info.balance + BALANCE_TOLERANCE) {
        await deps.sendMessage(
          chatId,
          `⚠️ El monto (${formatCurrency(amount)}) supera el saldo pendiente de ${formatCurrency(info.balance)}. Escribe un monto menor o igual, o envía /cancelar.`
        );
        return;
      }

      pendingCustomByChat.delete(chatId);
      const token = createConfirmToken(chatId, debt.id, amount);

      await deps.sendMessage(
        chatId,
        `💳 *Confirmar registro de pago*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Monto:* ${formatCurrency(amount)}\n*Saldo después del pago:* ${formatCurrency(Math.max(info.balance - amount, 0))}\n\n_¿Registrar este pago en la aplicación?_`,
        [
          [{ text: "✅ Sí, registrar", callback_data: `cmdpay_ok_${token}` }],
          [{ text: "✖️ Cancelar", callback_data: "cmdpay_cancel" }],
        ]
      );
    }
  }

  async function handleCallback(
    queryId: string,
    chatId: string,
    messageId: number,
    data: string
  ): Promise<boolean> {
    if (!data.startsWith("cmdpay_")) {
      return false;
    }

    const now = getNow();
    pruneExpired(now.getTime());

    const authorized = await deps.isAuthorizedChat(chatId);
    if (!authorized) {
      await deps.answerCallback(queryId, "No autorizado");
      return true;
    }

    if (data === "cmdpay_cancel") {
      pendingCustomByChat.delete(chatId);
      await deps.answerCallback(queryId, "Cancelado");
      await deps.editMessage(
        chatId,
        messageId,
        "❌ *Registro de pago cancelado*"
      );
      return true;
    }

    if (data.startsWith("cmdpay_sel_")) {
      const debtId = data.slice("cmdpay_sel_".length);
      const debt = await deps.getDebtById(debtId);

      if (!debt || debt.status === "PAID") {
        await deps.answerCallback(queryId, "Deuda no disponible");
        await deps.editMessage(
          chatId,
          messageId,
          "⚠️ La deuda seleccionada ya no está disponible."
        );
        return true;
      }

      const info = analyzeDebt(debt);
      if (info.balance <= BALANCE_TOLERANCE) {
        await deps.answerCallback(queryId, "La deuda ya está al día");
        await deps.editMessage(
          chatId,
          messageId,
          `✅ *Deuda al día*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}`
        );
        return true;
      }

      await deps.answerCallback(queryId, "Selecciona el monto");
      await deps.editMessage(
        chatId,
        messageId,
        `💰 *Registrar pago*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Saldo pendiente:* ${formatCurrency(info.balance)}\n*Cuota estándar:* ${formatCurrency(info.standardPayAmount)}\n\n¿Qué monto deseas registrar?`,
        [
          [
            {
              text: `💵 Pagar cuota (${formatCurrency(info.standardPayAmount)})`,
              callback_data: `cmdpay_inst_${debt.id}`,
            },
          ],
          [
            {
              text: "✏️ Monto personalizado",
              callback_data: `cmdpay_custom_${debt.id}`,
            },
          ],
          [{ text: "✖️ Cancelar", callback_data: "cmdpay_cancel" }],
        ]
      );
      return true;
    }

    if (data.startsWith("cmdpay_inst_")) {
      const debtId = data.slice("cmdpay_inst_".length);
      const debt = await deps.getDebtById(debtId);

      if (!debt || debt.status === "PAID") {
        await deps.answerCallback(queryId, "Deuda no disponible");
        return true;
      }

      const info = analyzeDebt(debt);
      if (info.standardPayAmount <= 0 || info.balance <= BALANCE_TOLERANCE) {
        await deps.answerCallback(queryId, "La deuda ya está al día");
        return true;
      }

      const token = createConfirmToken(chatId, debt.id, info.standardPayAmount);
      await deps.answerCallback(queryId, "Confirmar pago");
      await deps.editMessage(
        chatId,
        messageId,
        `💳 *Confirmar registro de pago*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Monto:* ${formatCurrency(info.standardPayAmount)}\n*Saldo después del pago:* ${formatCurrency(Math.max(info.balance - info.standardPayAmount, 0))}\n\n_¿Registrar este pago en la aplicación?_`,
        [
          [{ text: "✅ Sí, registrar", callback_data: `cmdpay_ok_${token}` }],
          [{ text: "✖️ Cancelar", callback_data: "cmdpay_cancel" }],
        ]
      );
      return true;
    }

    if (data.startsWith("cmdpay_custom_")) {
      const debtId = data.slice("cmdpay_custom_".length);
      const debt = await deps.getDebtById(debtId);

      if (!debt || debt.status === "PAID") {
        await deps.answerCallback(queryId, "Deuda no disponible");
        return true;
      }

      const info = analyzeDebt(debt);
      pendingCustomByChat.set(chatId, {
        debtId: debt.id,
        debtName: debt.name,
        expiresAt: now.getTime() + PENDING_TTL_MS,
      });

      await deps.answerCallback(queryId, "Escribe el monto en el chat");
      await deps.editMessage(
        chatId,
        messageId,
        `✏️ *Monto personalizado*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Saldo pendiente:* ${formatCurrency(info.balance)}\n\nEscribe el monto a registrar (ej. \`250\` o \`250.50\`) o envía /cancelar.`
      );
      return true;
    }

    if (data.startsWith("cmdpay_ok_")) {
      const token = data.slice("cmdpay_ok_".length);
      const pending = pendingConfirmByToken.get(token);

      if (!pending || pending.chatId !== chatId) {
        await deps.answerCallback(queryId, "Esta confirmación expiró");
        await deps.editMessage(
          chatId,
          messageId,
          "⏰ *Confirmación expirada*\n\nUsa /pagar para iniciar nuevamente."
        );
        return true;
      }

      pendingConfirmByToken.delete(token);

      const debt = await deps.getDebtById(pending.debtId);
      if (!debt || debt.status === "PAID") {
        await deps.answerCallback(queryId, "La deuda ya está liquidada");
        await deps.editMessage(
          chatId,
          messageId,
          "✅ *Deuda al día*\n\nNo se registró ningún pago."
        );
        return true;
      }

      const info = analyzeDebt(debt);
      if (info.balance <= BALANCE_TOLERANCE) {
        await deps.answerCallback(queryId, "La deuda ya está al día");
        await deps.editMessage(
          chatId,
          messageId,
          `✅ *Deuda al día*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}`
        );
        return true;
      }

      if (pending.amount > info.balance + BALANCE_TOLERANCE) {
        await deps.answerCallback(queryId, "El saldo cambió");
        await deps.editMessage(
          chatId,
          messageId,
          `⚠️ El saldo pendiente cambió (${formatCurrency(info.balance)}). Usa /pagar para reintentar.`
        );
        return true;
      }

      const paymentDate = getGuatemalaTodayUTCDate(now);
      const newBalance = Math.max(info.balance - pending.amount, 0);
      const markPaid = info.paid + pending.amount >= info.total - BALANCE_TOLERANCE;

      await deps.recordPayment({
        debtId: debt.id,
        amount: pending.amount,
        paymentDate,
        notes: "Pago desde Telegram (/pagar)",
        markPaid,
      });

      await deps.answerCallback(
        queryId,
        `Pago de ${formatCurrency(pending.amount)} registrado ✓`
      );
      await deps.editMessage(
        chatId,
        messageId,
        `✅ *Pago registrado*\n\n*Deuda:* ${escapeTelegramMarkdown(debt.name)}\n*Fecha:* ${formatDate(paymentDate)}\n*Monto:* ${formatCurrency(pending.amount)}\n*Saldo restante:* ${formatCurrency(newBalance)}${markPaid ? "\n\n🎉 *¡Deuda liquidada!*" : ""}`
      );
      return true;
    }

    return false;
  }

  return {
    handleMessage,
    handleCallback,
  };
}
