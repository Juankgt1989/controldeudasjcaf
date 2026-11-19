import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TELEGRAM_BOT_COMMANDS,
  parseTelegramCommand,
  parseAmountInput,
  getGuatemalaTodayUTCDate,
  formatSummaryMessage,
  formatOverdueMessage,
  formatMonthMessage,
  formatHelpMessage,
  createTelegramCommandHandler,
  type TelegramDebtRecord,
  type TelegramCommandDeps,
} from "./telegram-commands";

function makeDebt(overrides: Partial<TelegramDebtRecord> = {}): TelegramDebtRecord {
  return {
    id: "debt-1",
    name: "Tarjeta Banco",
    totalAmount: 1200,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-04-15T00:00:00.000Z"),
    paymentFrequency: "MONTHLY",
    dueDay: 15,
    numberOfInstallments: 4,
    status: "ACTIVE",
    payments: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<TelegramCommandDeps> = {}) {
  const sentMessages: Array<{
    chatId: string;
    text: string;
    buttons?: Array<Array<{ text: string; callback_data: string }>>;
  }> = [];
  const editedMessages: Array<{
    chatId: string;
    messageId: number;
    text: string;
    buttons?: Array<Array<{ text: string; callback_data: string }>>;
  }> = [];
  const callbackAnswers: Array<{ queryId: string; text?: string }> = [];
  const recordedPayments: Array<{
    debtId: string;
    amount: number;
    paymentDate: Date;
    notes: string;
    markPaid: boolean;
  }> = [];

  const defaultDebts: TelegramDebtRecord[] = [
    makeDebt({
      id: "debt-1",
      name: "Préstamo_Auto",
      totalAmount: 1200,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      dueDay: 15,
      numberOfInstallments: 4,
      payments: [{ amount: 300 }],
    }),
    makeDebt({
      id: "debt-2",
      name: "Seguro Médico",
      totalAmount: 600,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      endDate: new Date("2026-04-25T00:00:00.000Z"),
      dueDay: 25,
      numberOfInstallments: 3,
      payments: [],
    }),
  ];

  let now = new Date("2026-03-20T15:00:00.000Z");

  const deps: TelegramCommandDeps = {
    isAuthorizedChat: async (chatId) => chatId === "12345",
    getUnpaidDebts: async () => defaultDebts,
    getDebtById: async (debtId) => defaultDebts.find((d) => d.id === debtId) ?? null,
    recordPayment: async (input) => {
      recordedPayments.push(input);
    },
    sendMessage: async (chatId, text, buttons) => {
      sentMessages.push({ chatId, text, buttons });
    },
    editMessage: async (chatId, messageId, text, buttons) => {
      editedMessages.push({ chatId, messageId, text, buttons });
    },
    answerCallback: async (queryId, text) => {
      callbackAnswers.push({ queryId, text });
    },
    now: () => now,
    ...overrides,
  };

  return {
    deps,
    sentMessages,
    editedMessages,
    callbackAnswers,
    recordedPayments,
    setNow: (next: Date) => {
      now = next;
    },
  };
}

describe("telegram-commands helpers", () => {
  it("parses commands with optional bot mention and ignores non-commands", () => {
    assert.equal(parseTelegramCommand("/resumen"), "resumen");
    assert.equal(parseTelegramCommand("  /Vencidas@mi_bot_deudas  "), "vencidas");
    assert.equal(parseTelegramCommand("/pagar extra"), "pagar");
    assert.equal(parseTelegramCommand("hola"), null);
    assert.equal(parseTelegramCommand(""), null);
  });

  it("parses valid positive amounts and rejects invalid inputs", () => {
    assert.equal(parseAmountInput("250"), 250);
    assert.equal(parseAmountInput("Q 1,250.50"), 1250.5);
    assert.equal(parseAmountInput("150,75"), 150.75);
    assert.equal(parseAmountInput("0"), null);
    assert.equal(parseAmountInput("-50"), null);
    assert.equal(parseAmountInput("abc"), null);
    assert.equal(parseAmountInput("12.345"), null);
  });

  it("computes Guatemala calendar date in UTC even after 18:00 GT (next day in UTC)", () => {
    // 2026-03-21T02:30:00Z is 2026-03-20 20:30 in America/Guatemala (UTC-6)
    const lateEveningGT = new Date("2026-03-21T02:30:00.000Z");
    const gtDate = getGuatemalaTodayUTCDate(lateEveningGT);
    assert.equal(gtDate.toISOString(), "2026-03-20T00:00:00.000Z");
  });

  it("exposes Telegram bot command definitions", () => {
    const names = TELEGRAM_BOT_COMMANDS.map((c) => c.command);
    assert.deepEqual(names, ["resumen", "vencidas", "mes", "pagar", "ayuda"]);
  });
});

describe("telegram-commands formatters", () => {
  it("formats /resumen with escaped markdown, balances, and total", () => {
    const now = new Date("2026-03-20T15:00:00.000Z");
    const debts = [
      makeDebt({
        name: "Préstamo_Auto",
        totalAmount: 1200,
        payments: [{ amount: 300 }],
      }),
    ];
    const msg = formatSummaryMessage(debts, now);
    assert.match(msg, /Resumen de deudas/);
    assert.match(msg, /Préstamo\\_Auto/);
    assert.match(msg, /3 cuota\(s\) pendiente\(s\)/);
    assert.match(msg, /Total pendiente:/);
  });

  it("formats /vencidas showing only overdue installments and days late", () => {
    const now = new Date("2026-03-20T15:00:00.000Z");
    const debts = [
      // Installments: Jan 15 (paid), Feb 15 (overdue 33d), Mar 15 (overdue 5d), Apr 15 (upcoming)
      makeDebt({
        name: "Auto",
        totalAmount: 1200,
        payments: [{ amount: 300 }],
      }),
      // First installment is Mar 25 -> not overdue
      makeDebt({
        id: "debt-2",
        name: "Futura",
        totalAmount: 300,
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-25T00:00:00.000Z"),
        dueDay: 25,
        numberOfInstallments: 1,
        payments: [],
      }),
    ];
    const msg = formatOverdueMessage(debts, now);
    assert.match(msg, /Cuotas vencidas/);
    assert.match(msg, /\*Auto\*/);
    assert.match(msg, /2 cuota\(s\) vencida\(s\)/);
    assert.doesNotMatch(msg, /Futura/);
  });

  it("formats /vencidas when there are no overdue installments", () => {
    const now = new Date("2026-01-10T15:00:00.000Z");
    const msg = formatOverdueMessage([makeDebt()], now);
    assert.match(msg, /No tienes cuotas vencidas/);
  });

  it("formats /mes showing only unpaid installments in the current Guatemala month", () => {
    const now = new Date("2026-03-20T15:00:00.000Z");
    const debts = [
      makeDebt({
        id: "d1",
        name: "Auto",
        totalAmount: 1200,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-04-15T00:00:00.000Z"),
        dueDay: 15,
        numberOfInstallments: 4,
        payments: [{ amount: 600 }], // Jan & Feb paid -> Mar 15 unpaid (overdue 5d), Apr 15 not in March
      }),
      makeDebt({
        id: "d2",
        name: "Seguro",
        totalAmount: 600,
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: new Date("2026-04-25T00:00:00.000Z"),
        dueDay: 25,
        numberOfInstallments: 3,
        payments: [{ amount: 200 }], // Feb paid -> Mar 25 unpaid (in 5d)
      }),
    ];
    const msg = formatMonthMessage(debts, now);
    assert.match(msg, /Cuotas de marzo de 2026/i);
    assert.match(msg, /Auto/);
    assert.match(msg, /Seguro/);
    assert.match(msg, /Total pendiente del mes:/);
  });

  it("formats /ayuda with all commands", () => {
    const msg = formatHelpMessage();
    assert.match(msg, /\/resumen/);
    assert.match(msg, /\/vencidas/);
    assert.match(msg, /\/mes/);
    assert.match(msg, /\/pagar/);
  });
});

describe("telegram command handler", () => {
  it("rejects unauthorized chats for both messages and callbacks", async () => {
    const { deps, sentMessages, callbackAnswers } = makeDeps();
    const handler = createTelegramCommandHandler(deps);

    await handler.handleMessage("99999", "/resumen");
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /No autorizado/);

    const handled = await handler.handleCallback("q-1", "99999", 10, "cmdpay_cancel");
    assert.equal(handled, true);
    assert.equal(callbackAnswers[0].text, "No autorizado");
  });

  it("handles /resumen, /vencidas, /mes, and /ayuda for authorized chat", async () => {
    const { deps, sentMessages } = makeDeps();
    const handler = createTelegramCommandHandler(deps);

    await handler.handleMessage("12345", "/resumen");
    await handler.handleMessage("12345", "/vencidas");
    await handler.handleMessage("12345", "/mes");
    await handler.handleMessage("12345", "/ayuda");

    assert.equal(sentMessages.length, 4);
    assert.match(sentMessages[0].text, /Resumen de deudas/);
    assert.match(sentMessages[1].text, /Cuotas vencidas/);
    assert.match(sentMessages[2].text, /Cuotas de marzo de 2026/i);
    assert.match(sentMessages[3].text, /Comandos disponibles/);
  });

  it("supports full interactive /pagar -> select debt -> custom amount -> confirm flow", async () => {
    const { deps, sentMessages, editedMessages, recordedPayments } = makeDeps();
    const handler = createTelegramCommandHandler(deps);

    // 1. /pagar lists unpaid debts with inline buttons
    await handler.handleMessage("12345", "/pagar");
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].buttons);
    const selectBtn = sentMessages[0].buttons![0][0];
    assert.equal(selectBtn.callback_data, "cmdpay_sel_debt-1");

    // 2. User selects debt-1
    await handler.handleCallback("q-1", "12345", 42, "cmdpay_sel_debt-1");
    assert.equal(editedMessages.length, 1);
    assert.match(editedMessages[0].text, /Préstamo\\_Auto/);
    const customBtn = editedMessages[0].buttons!.flat().find((b) =>
      b.callback_data.startsWith("cmdpay_custom_")
    );
    assert.ok(customBtn);

    // 3. User clicks custom amount
    await handler.handleCallback("q-2", "12345", 42, customBtn.callback_data);
    assert.equal(editedMessages.length, 2);
    assert.match(editedMessages[1].text, /Escribe el monto/);

    // 4. User enters invalid amount first -> gets error, state stays active
    await handler.handleMessage("12345", "no-es-numero");
    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[1].text, /Monto inválido/);

    // 5. User enters overpayment (> 900 remaining balance) -> rejected
    await handler.handleMessage("12345", "950");
    assert.equal(sentMessages.length, 3);
    assert.match(sentMessages[2].text, /supera el saldo pendiente/);

    // 6. User enters valid partial amount (150.50) -> gets confirmation buttons
    await handler.handleMessage("12345", "150.50");
    assert.equal(sentMessages.length, 4);
    assert.match(sentMessages[3].text, /Confirmar registro de pago/);
    const confirmBtn = sentMessages[3].buttons!.flat().find((b) =>
      b.callback_data.startsWith("cmdpay_ok_")
    );
    assert.ok(confirmBtn);

    // 7. User confirms -> payment recorded with Guatemala UTC date
    await handler.handleCallback("q-3", "12345", 43, confirmBtn.callback_data);
    assert.equal(recordedPayments.length, 1);
    assert.equal(recordedPayments[0].debtId, "debt-1");
    assert.equal(recordedPayments[0].amount, 150.5);
    assert.equal(recordedPayments[0].paymentDate.toISOString(), "2026-03-20T00:00:00.000Z");
    assert.equal(recordedPayments[0].markPaid, false);
    assert.match(editedMessages[2].text, /Pago registrado/);
  });

  it("marks debt as PAID when paying full remaining balance via standard installment button", async () => {
    const singleDebt = makeDebt({
      id: "debt-last",
      name: "Última Cuota",
      totalAmount: 300,
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-25T00:00:00.000Z"),
      dueDay: 25,
      numberOfInstallments: 1,
      payments: [],
    });

    const { deps, editedMessages, recordedPayments } = makeDeps({
      getUnpaidDebts: async () => [singleDebt],
      getDebtById: async (id) => (id === "debt-last" ? singleDebt : null),
    });
    const handler = createTelegramCommandHandler(deps);

    await handler.handleCallback("q-1", "12345", 50, "cmdpay_inst_debt-last");
    const confirmBtn = editedMessages[0].buttons!.flat().find((b) =>
      b.callback_data.startsWith("cmdpay_ok_")
    );
    assert.ok(confirmBtn);

    await handler.handleCallback("q-2", "12345", 50, confirmBtn.callback_data);
    assert.equal(recordedPayments.length, 1);
    assert.equal(recordedPayments[0].amount, 300);
    assert.equal(recordedPayments[0].markPaid, true);
  });

  it("cancels pending custom amount prompt with /cancelar", async () => {
    const { deps, sentMessages } = makeDeps();
    const handler = createTelegramCommandHandler(deps);

    await handler.handleCallback("q-1", "12345", 60, "cmdpay_custom_debt-1");
    await handler.handleMessage("12345", "/cancelar");

    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /cancelado/i);

    // Subsequent plain text should be ignored (no active pending payment)
    await handler.handleMessage("12345", "200");
    assert.equal(sentMessages.length, 1);
  });

  it("expires pending custom payment after TTL", async () => {
    const { deps, sentMessages, setNow } = makeDeps();
    const handler = createTelegramCommandHandler(deps);

    await handler.handleCallback("q-1", "12345", 70, "cmdpay_custom_debt-1");

    // Advance 6 minutes (> 5 min TTL)
    setNow(new Date("2026-03-20T15:06:00.000Z"));
    await handler.handleMessage("12345", "100");
    assert.equal(sentMessages.length, 0);
  });
});
