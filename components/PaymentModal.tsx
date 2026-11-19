"use client";

import { useState, useMemo, useEffect } from "react";
import {
  formatCurrency,
  formatDate,
  getDueDates,
  getGuatemalaTodayISO,
} from "@/lib/utils";
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
    numberOfInstallments?: number | null;
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

export function PaymentModal({
  debt,
  suggestedAmount,
  onClose,
  onSaved,
}: PaymentModalProps) {
  const {
    balance,
    positiveBalance,
    installment,
    pendingDates,
    pendingCount,
    pendingSum,
    suggestedCapped,
    defaultAmount,
  } = useMemo(() => {
    const paid = debt.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const bal = parseFloat(debt.totalAmount) - paid;
    const posBal = Math.max(bal, 0);

    const dueDates = getDueDates(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      debt.numberOfInstallments
    );
    const inst =
      dueDates.length > 0 ? parseFloat(debt.totalAmount) / dueDates.length : 0;

    const pending = dueDates.filter((_, i) => paid < inst * (i + 1));
    const count = pending.length;
    const sum = Math.min(inst * count, posBal);

    const suggested = suggestedAmount ?? 0;
    const capped = Math.min(suggested, posBal);

    return {
      balance: bal,
      positiveBalance: posBal,
      installment: inst,
      pendingDates: pending,
      pendingCount: count,
      pendingSum: sum,
      suggestedCapped: capped,
      defaultAmount: sum > 0 ? sum : capped,
    };
  }, [debt, suggestedAmount]);

  const [amount, setAmount] = useState(
    defaultAmount > 0 ? defaultAmount.toFixed(2) : ""
  );
  const [paymentDate, setPaymentDate] = useState(() => getGuatemalaTodayISO());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
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

      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al registrar el pago");
      }
    } catch {
      setError("Error de conexión al registrar el pago");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
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
                <li>y {pendingCount - MAX_LISTED} más...</li>
              )}
            </ul>
            {pendingCount > 1 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                El monto se cargó con la suma de todas. Si pagás una sola, las
                demás seguirán pendientes y continuarán los recordatorios.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Monto (GTQ)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
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
              maxLength={500}
              className={inputClass}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
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
