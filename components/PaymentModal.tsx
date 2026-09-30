"use client";

import { useState } from "react";
import { formatCurrency, formatDate, getDueDates } from "@/lib/utils";
import type { PaymentFrequency } from "@prisma/client";

interface PaymentModalProps {
  debt: {
    id: string;
    name: string;
    totalAmount: string;
    startDate: string;
    endDate: string;
    paymentFrequency: PaymentFrequency;
    dueDay: number | null;
    payments: { amount: string }[];
  };
  suggestedAmount?: number;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const labelClass =
  "block text-sm font-medium text-zinc-900 dark:text-zinc-100";

const MAX_LISTED = 6;

export function PaymentModal({ debt, suggestedAmount, onClose, onSaved }: PaymentModalProps) {
  const paid = debt.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const balance = parseFloat(debt.totalAmount) - paid;
  const positiveBalance = Math.max(balance, 0);

  const dueDates = getDueDates(
    debt.startDate,
    debt.endDate,
    debt.paymentFrequency,
    debt.dueDay ?? undefined
  );
  const installment =
    dueDates.length > 0 ? parseFloat(debt.totalAmount) / dueDates.length : 0;

  const pendingDates = dueDates.filter((_, i) => paid < installment * (i + 1));
  const pendingCount = pendingDates.length;
  const pendingSum = Math.min(installment * pendingCount, positiveBalance);

  const suggested = suggestedAmount ?? 0;
  const suggestedCapped = Math.min(suggested, positiveBalance);
  const defaultAmount = pendingSum > 0 ? pendingSum : suggestedCapped;

  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : ""
  );
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debtId: debt.id,
        amount,
        paymentDate,
        notes,
      }),
    });

    setLoading(false);

    if (res.ok) {
      onSaved();
      onClose();
    } else {
      alert("Error al registrar el pago");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Registrar pago
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {debt.name} - Saldo pendiente: {formatCurrency(balance)}
        </p>

        {pendingCount > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {pendingCount === 1
                ? "1 cuota pendiente"
                : `${pendingCount} cuotas pendientes`}
            </p>
            <ul className="mt-1 space-y-0.5 text-amber-800 dark:text-amber-300">
              {pendingDates.slice(0, MAX_LISTED).map((d) => (
                <li key={d.toISOString()}>
                  {formatDate(d)} - {formatCurrency(installment)}
                </li>
              ))}
              {pendingCount > MAX_LISTED && (
                <li>y {pendingCount - MAX_LISTED} m&aacute;s...</li>
              )}
            </ul>
            {pendingCount > 1 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                El monto se carg&oacute; con la suma de todas. Si pag&aacute;s
                una sola, la dem&aacute;s seguir&aacute; pendiente y continuar&aacute;n
                los recordatorios.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Monto (GTQ)</label>
            <input
              type="number"
              step="0.01"
              required
              max={positiveBalance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedCapped > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(suggestedCapped.toFixed(2))}
                  className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
                >
                  1 cuota: {formatCurrency(suggestedCapped)}
                </button>
              )}
              {pendingCount > 1 && pendingSum > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(pendingSum.toFixed(2))}
                  className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                >
                  {pendingCount} cuotas: {formatCurrency(pendingSum)}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAmount(positiveBalance.toFixed(2))}
                className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Saldo total: {formatCurrency(positiveBalance)}
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Fecha de pago</label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Registrar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
