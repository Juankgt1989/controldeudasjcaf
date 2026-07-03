"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Debt {
  id: string;
  name: string;
}

interface Payment {
  id: string;
  amount: string;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
  debt: Debt;
}

export function PaymentsManager() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDebt, setFilterDebt] = useState("ALL");

  const fetchPayments = async () => {
    const res = await fetch("/api/payments");
    const data = await res.json();
    setPayments(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPayments();
  }, []);

  const debtNames = Array.from(
    new Set(payments.map((p) => p.debt.name))
  ).sort();

  const filtered =
    filterDebt === "ALL"
      ? payments
      : payments.filter((p) => p.debt.name === filterDebt);

  if (loading)
    return <p className="text-zinc-600 dark:text-zinc-400">Cargando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Historial de pagos
        </h2>
        <select
          value={filterDebt}
          onChange={(e) => setFilterDebt(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="ALL">Todas las deudas</option>
          {debtNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Deuda
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Monto
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Notas
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((payment) => (
              <tr key={payment.id}>
                <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                  {payment.debt.name}
                </td>
                <td className="px-6 py-4 font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(payment.amount)}
                </td>
                <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {formatDate(payment.paymentDate)}
                </td>
                <td className="px-6 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                  {payment.notes || "-"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No hay pagos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
