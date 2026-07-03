"use client";

import { useState, useEffect } from "react";
import {
  formatCurrency,
  formatDate,
  formatFrequency,
  getDueDates,
  getInstallmentAmount,
  getNextDueDate,
} from "@/lib/utils";
import { PaymentFrequency } from "@prisma/client";
import { PaymentModal } from "./PaymentModal";

interface Payment {
  amount: string;
}

interface Debt {
  id: string;
  name: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
  paymentFrequency: PaymentFrequency;
  dueDay: number | null;
  status: string;
  payments: Payment[];
}

const frequencyOptions = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
];

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const labelClass =
  "block text-sm font-medium text-zinc-900 dark:text-zinc-100";

export function DebtManager() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [form, setForm] = useState({
    name: "",
    totalAmount: "",
    startDate: "",
    endDate: "",
    paymentFrequency: "MONTHLY",
    dueDay: "",
  });
  const [previewDates, setPreviewDates] = useState<Date[]>([]);

  const fetchDebts = async () => {
    const res = await fetch("/api/debts");
    const data = await res.json();
    setDebts(data);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDebts();
  }, []);

  const updatePreview = (draft: typeof form) => {
    if (draft.startDate && draft.endDate) {
      const dates = getDueDates(
        draft.startDate,
        draft.endDate,
        draft.paymentFrequency as PaymentFrequency,
        draft.dueDay ? parseInt(draft.dueDay, 10) : undefined
      );
      setPreviewDates(dates);
    } else {
      setPreviewDates([]);
    }
  };

  const setFormValue = (key: keyof typeof form, value: string) => {
    const draft = { ...form, [key]: value };
    setForm(draft);
    updatePreview(draft);
  };

  const resetForm = () => {
    setForm({
      name: "",
      totalAmount: "",
      startDate: "",
      endDate: "",
      paymentFrequency: "MONTHLY",
      dueDay: "",
    });
    setPreviewDates([]);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (debt: Debt) => {
    setEditing(debt);
    setForm({
      name: debt.name,
      totalAmount: debt.totalAmount,
      startDate: debt.startDate.split("T")[0],
      endDate: debt.endDate.split("T")[0],
      paymentFrequency: debt.paymentFrequency,
      dueDay: debt.dueDay?.toString() || "",
    });
    setShowForm(true);
    updatePreview({
      name: debt.name,
      totalAmount: debt.totalAmount,
      startDate: debt.startDate.split("T")[0],
      endDate: debt.endDate.split("T")[0],
      paymentFrequency: debt.paymentFrequency,
      dueDay: debt.dueDay?.toString() || "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editing ? `/api/debts/${editing.id}` : "/api/debts";
    const method = editing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      resetForm();
      fetchDebts();
    } else {
      alert("Error al guardar la deuda");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta deuda y todos sus pagos?")) return;
    const res = await fetch(`/api/debts/${id}`, { method: "DELETE" });
    if (res.ok) fetchDebts();
  };

  const getBalance = (debt: Debt) => {
    const paid = debt.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );
    return parseFloat(debt.totalAmount) - paid;
  };

  const getDueDatesLabel = (debt: Debt) => {
    const dates = getDueDates(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined
    );
    return `${dates.length} cuota${dates.length !== 1 ? "s" : ""}`;
  };

  const getInstallment = (debt: Debt) => {
    return getInstallmentAmount(
      debt.totalAmount,
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined
    );
  };

  const getNextDue = (debt: Debt) => {
    return getNextDueDate(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined
    );
  };

  if (loading) return <p className="text-zinc-600 dark:text-zinc-400">Cargando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Deudas
        </h2>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          {showForm ? "Cancelar" : "Nueva deuda"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {editing ? "Editar deuda" : "Nueva deuda"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Nombre / Descripción</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setFormValue("name", e.target.value)}
                placeholder="Ej. Diego Córdoba"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Monto total (GTQ)</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.totalAmount}
                onChange={(e) => setFormValue("totalAmount", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha de inicio</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setFormValue("startDate", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha final</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setFormValue("endDate", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Frecuencia de pago</label>
              <select
                required
                value={form.paymentFrequency}
                onChange={(e) =>
                  setFormValue("paymentFrequency", e.target.value)
                }
                className={inputClass}
              >
                {frequencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                {form.paymentFrequency === "MONTHLY"
                  ? "Día de vencimiento (1-31)"
                  : "Día de referencia (opcional)"}
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(e) => setFormValue("dueDay", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {previewDates.length > 0 && (
            <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {previewDates.length} cuota{previewDates.length !== 1 ? "s" : ""} de{" "}
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(
                      getInstallmentAmount(
                        form.totalAmount || 0,
                        form.startDate,
                        form.endDate,
                        form.paymentFrequency as PaymentFrequency,
                        form.dueDay ? parseInt(form.dueDay, 10) : undefined
                      )
                    )}
                  </span>{" "}
                  {formatFrequency(form.paymentFrequency as PaymentFrequency).toLowerCase()}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {previewDates.slice(0, 12).map((date, i) => (
                  <span
                    key={i}
                    className="inline-flex rounded-full bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm dark:bg-zinc-700 dark:text-zinc-300"
                  >
                    {formatDate(date)}
                  </span>
                ))}
                {previewDates.length > 12 && (
                  <span className="inline-flex rounded-full bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm dark:bg-zinc-700 dark:text-zinc-300">
                    +{previewDates.length - 12} más
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            {editing ? "Guardar cambios" : "Guardar deuda"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Total
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Saldo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Cuota
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Próximo pago
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Periodo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {debts.map((debt) => (
              <tr key={debt.id}>
                <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">
                  {debt.name}
                </td>
                <td className="px-6 py-4 text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(debt.totalAmount)}
                </td>
                <td className="px-6 py-4 font-medium text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(getBalance(debt))}
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(getInstallment(debt))}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatFrequency(debt.paymentFrequency)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  {debt.status === "PAID" ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      Completado
                    </p>
                  ) : getNextDue(debt) ? (
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {formatDate(getNextDue(debt)!)}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      Sin fechas
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100">
                    {formatDate(debt.startDate)} - {formatDate(debt.endDate)}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {getDueDatesLabel(debt)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      debt.status === "PAID"
                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : debt.status === "OVERDUE"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    }`}
                  >
                    {debt.status === "PAID"
                      ? "Pagada"
                      : debt.status === "OVERDUE"
                      ? "Vencida"
                      : "Activa"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setPaymentDebt(debt)}
                      className="rounded-md bg-green-50 px-3 py-1 text-xs font-semibold text-green-600 transition-colors hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                    >
                      Pago
                    </button>
                    <button
                      onClick={() => startEdit(debt)}
                      className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(debt.id)}
                      className="rounded-md bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {debts.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No hay deudas registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paymentDebt && (
        <PaymentModal
          debt={paymentDebt}
          onClose={() => setPaymentDebt(null)}
          onSaved={fetchDebts}
        />
      )}
    </div>
  );
}
