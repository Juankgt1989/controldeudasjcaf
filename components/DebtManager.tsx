"use client";

import { useState, useEffect } from "react";
import {
  formatCurrency,
  formatDate,
  formatShortDate,
  formatFrequency,
  getDueDates,
  getInstallmentAmount,
  getNextDueDate,
  getOverdueInstallments,
  getPaidInstallments,
  calculateEndDate,
  postponeEndDate,
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
  numberOfInstallments: number | null;
  status: string;
  payments: Payment[];
}

const frequencyOptions = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
];

const statusStyles: Record<string, string> = {
  PAID: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  ON_TIME: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400",
  ACTIVE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

const statusLabels: Record<string, string> = {
  PAID: "Pagada",
  OVERDUE: "Vencida",
  PENDING: "Pendiente de pago",
  ON_TIME: "Al día",
  ACTIVE: "Activa",
};

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
  const [postponeDebt, setPostponeDebt] = useState<Debt | null>(null);
  const [postponing, setPostponing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    totalAmount: "",
    startDate: "",
    endDate: "",
    paymentFrequency: "MONTHLY",
    dueDay: "",
    numberOfInstallments: "",
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
    let effectiveEndDate = draft.endDate;
    const installments = draft.numberOfInstallments
      ? parseInt(draft.numberOfInstallments, 10)
      : undefined;

    if (
      !effectiveEndDate &&
      installments &&
      installments > 0 &&
      draft.startDate &&
      draft.paymentFrequency
    ) {
      const calculated = calculateEndDate(
        draft.startDate,
        draft.paymentFrequency as PaymentFrequency,
        installments,
        draft.dueDay ? parseInt(draft.dueDay, 10) : null
      );
      effectiveEndDate = calculated.toISOString().split("T")[0];
    }

    if (draft.startDate && effectiveEndDate) {
      const dates = getDueDates(
        draft.startDate,
        effectiveEndDate,
        draft.paymentFrequency as PaymentFrequency,
        draft.dueDay ? parseInt(draft.dueDay, 10) : undefined,
        installments
      );
      setPreviewDates(dates);
    } else {
      setPreviewDates([]);
    }
  };

  const getEffectiveEndDate = () => {
    if (form.endDate) {
      return form.endDate;
    }
    if (form.numberOfInstallments && form.startDate && form.paymentFrequency) {
      const n = parseInt(form.numberOfInstallments, 10);
      if (n > 0) {
        return calculateEndDate(
          form.startDate,
          form.paymentFrequency as PaymentFrequency,
          n,
          form.dueDay ? parseInt(form.dueDay, 10) : null
        )
          .toISOString()
          .split("T")[0];
      }
    }
    return form.endDate;
  };

  const setFormValue = (key: keyof typeof form, value: string) => {
    const draft = { ...form, [key]: value };

    if (
      (key === "numberOfInstallments" ||
        key === "startDate" ||
        key === "paymentFrequency" ||
        key === "dueDay") &&
      draft.numberOfInstallments &&
      draft.startDate &&
      draft.paymentFrequency
    ) {
      const n = parseInt(draft.numberOfInstallments, 10);
      if (n > 0) {
        const calculated = calculateEndDate(
          draft.startDate,
          draft.paymentFrequency as PaymentFrequency,
          n,
          draft.dueDay ? parseInt(draft.dueDay, 10) : null
        );
        draft.endDate = calculated.toISOString().split("T")[0];
      }
    }

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
      numberOfInstallments: "",
    });
    setPreviewDates([]);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (debt: Debt) => {
    setEditing(debt);
    const draft = {
      name: debt.name,
      totalAmount: debt.totalAmount,
      startDate: debt.startDate.split("T")[0],
      endDate: debt.endDate.split("T")[0],
      paymentFrequency: debt.paymentFrequency,
      dueDay: debt.dueDay?.toString() || "",
      numberOfInstallments: debt.numberOfInstallments?.toString() || "",
    };
    setForm(draft);
    setShowForm(true);
    updatePreview(draft);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const effectiveEndDate = getEffectiveEndDate();
    const payload = {
      ...form,
      endDate: effectiveEndDate,
    };

    const url = editing ? `/api/debts/${editing.id}` : "/api/debts";
    const method = editing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  const handlePostpone = async () => {
    if (!postponeDebt) return;
    setPostponing(true);
    const res = await fetch(`/api/debts/${postponeDebt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: 1 }),
    });
    setPostponing(false);

    if (res.ok) {
      setPostponeDebt(null);
      fetchDebts();
    } else {
      alert("Error al aplazar el pago");
    }
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
      debt.dueDay ?? undefined,
      debt.numberOfInstallments
    );
    return `${dates.length} cuota${dates.length !== 1 ? "s" : ""}`;
  };

  const getInstallment = (debt: Debt) => {
    return getInstallmentAmount(
      debt.totalAmount,
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      debt.numberOfInstallments
    );
  };

  const getNextDue = (debt: Debt) => {
    const paid = debt.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );
    const dates = getDueDates(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      debt.numberOfInstallments
    );
    const paidInstallments = getPaidInstallments(
      paid,
      debt.totalAmount,
      dates.length
    );
    return getNextDueDate(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      paidInstallments,
      debt.numberOfInstallments
    );
  };

  const getOverdueDates = (debt: Debt) => {
    if (debt.status === "PAID") return [];
    const paid = debt.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );
    return getOverdueInstallments({
      totalAmount: debt.totalAmount,
      startDate: debt.startDate,
      endDate: debt.endDate,
      paymentFrequency: debt.paymentFrequency,
      dueDay: debt.dueDay,
      numberOfInstallments: debt.numberOfInstallments,
      paid,
    });
  };

  const getPostponePreview = (debt: Debt) => {
    const paid = debt.payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0
    );
    const currentDates = getDueDates(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      debt.numberOfInstallments
    );
    const installmentsCount =
      debt.numberOfInstallments && debt.numberOfInstallments > 0
        ? debt.numberOfInstallments
        : currentDates.length;
    const paidInstallments = getPaidInstallments(
      paid,
      debt.totalAmount,
      currentDates.length
    );
    const newEndDate = postponeEndDate(
      debt.startDate,
      debt.endDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      1
    );
    const newDates = getDueDates(
      debt.startDate,
      newEndDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      installmentsCount
    );
    const newPendingDates = newDates.slice(paidInstallments);
    const newNextDue = getNextDueDate(
      debt.startDate,
      newEndDate,
      debt.paymentFrequency,
      debt.dueDay ?? undefined,
      paidInstallments,
      installmentsCount
    );
    return {
      currentNextDue: getNextDue(debt),
      newNextDue,
      newEndDate,
      newPendingDates,
      installmentAmount: getInstallment(debt),
    };
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
              <label className={labelClass}>Número de plazos</label>
              <input
                type="number"
                min="1"
                value={form.numberOfInstallments}
                onChange={(e) => setFormValue("numberOfInstallments", e.target.value)}
                placeholder="Ej. 6"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha final</label>
              <input
                type="date"
                required
                value={getEffectiveEndDate()}
                onChange={(e) => setFormValue("endDate", e.target.value)}
                readOnly={!!form.numberOfInstallments}
                className={`${inputClass} ${form.numberOfInstallments ? "cursor-not-allowed opacity-60" : ""}`}
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
                        getEffectiveEndDate(),
                        form.paymentFrequency as PaymentFrequency,
                        form.dueDay ? parseInt(form.dueDay, 10) : undefined,
                        form.numberOfInstallments
                          ? parseInt(form.numberOfInstallments, 10)
                          : undefined
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

      <>
        <div className="hidden rounded-xl border border-zinc-200 bg-white shadow-sm lg:block dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full table-auto divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Nombre
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Total
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Saldo
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Cuota
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Próximo pago
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Atrasadas
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Periodo
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Estado
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {debts.map((debt) => (
                <tr key={debt.id}>
                  <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {debt.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(debt.totalAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(getBalance(debt))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(getInstallment(debt))}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatFrequency(debt.paymentFrequency)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {debt.status === "PAID" ? (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500">
                        Completado
                      </p>
                    ) : getNextDue(debt) ? (
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {formatShortDate(getNextDue(debt)!)}
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500">
                        Sin fechas
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {(() => {
                      const overdue = getOverdueDates(debt);
                      if (overdue.length === 0) {
                        return (
                          <span className="text-sm text-zinc-400 dark:text-zinc-500">
                            0
                          </span>
                        );
                      }
                      const overdueAmount = Math.min(
                        overdue.length * getInstallment(debt),
                        Math.max(getBalance(debt), 0)
                      );
                      return (
                        <div>
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                            {overdue.length}{" "}
                            {overdue.length === 1 ? "atrasada" : "atrasadas"}
                          </span>
                          <p className="mt-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            {formatCurrency(overdueAmount)}
                          </p>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="text-xs text-zinc-900 dark:text-zinc-100">
                      {formatShortDate(debt.startDate)} -{" "}
                      {formatShortDate(debt.endDate)}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {getDueDatesLabel(debt)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        statusStyles[debt.status] || statusStyles.ACTIVE
                      }`}
                    >
                      {statusLabels[debt.status] || "Activa"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        onClick={() => setPaymentDebt(debt)}
                        className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-600 transition-colors hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                      >
                        Pago
                      </button>
                      {debt.status !== "PAID" && (
                        <button
                          onClick={() => setPostponeDebt(debt)}
                          title="Aplazar pago por 1 mes"
                          className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
                        >
                          Aplazar
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(debt)}
                        className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(debt.id)}
                        className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
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
                    colSpan={9}
                    className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No hay deudas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {debts.length === 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              No hay deudas registradas
            </div>
          )}
          {debts.map((debt) => (
            <div
              key={debt.id}
              className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {debt.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(debt.startDate)} - {formatDate(debt.endDate)} · {getDueDatesLabel(debt)}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    statusStyles[debt.status] || statusStyles.ACTIVE
                  }`}
                >
                  {statusLabels[debt.status] || "Activa"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
                  <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(debt.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Saldo</p>
                  <p className="mt-1 font-medium text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(getBalance(debt))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Cuota</p>
                  <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(getInstallment(debt))}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatFrequency(debt.paymentFrequency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Próximo pago</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {debt.status === "PAID"
                      ? "Completado"
                      : getNextDue(debt)
                      ? formatDate(getNextDue(debt)!)
                      : "Sin fechas"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Cuotas atrasadas
                  </p>
                  {(() => {
                    const overdue = getOverdueDates(debt);
                    if (overdue.length === 0) {
                      return (
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          0 (Al día)
                        </p>
                      );
                    }
                    const overdueAmount = Math.min(
                      overdue.length * getInstallment(debt),
                      Math.max(getBalance(debt), 0)
                    );
                    return (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                          {overdue.length}{" "}
                          {overdue.length === 1 ? "cuota atrasada" : "cuotas atrasadas"}
                        </span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          ({formatCurrency(overdueAmount)})
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
                <button
                  onClick={() => setPaymentDebt(debt)}
                  className="flex-1 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                >
                  Registrar pago
                </button>
                {debt.status !== "PAID" && (
                  <button
                    onClick={() => setPostponeDebt(debt)}
                    className="flex-1 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
                  >
                    Aplazar 1 mes
                  </button>
                )}
                <button
                  onClick={() => startEdit(debt)}
                  className="flex-1 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(debt.id)}
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </>

      {paymentDebt && (
        <PaymentModal
          debt={paymentDebt}
          suggestedAmount={getInstallment(paymentDebt)}
          onClose={() => setPaymentDebt(null)}
          onSaved={fetchDebts}
        />
      )}

      {postponeDebt && (() => {
        const preview = getPostponePreview(postponeDebt);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Aplazar pago por 1 mes
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {postponeDebt.name} · Saldo pendiente:{" "}
                {formatCurrency(getBalance(postponeDebt))}
              </p>

              <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                {preview.currentNextDue && preview.newNextDue && (
                  <div>
                    <p className="text-xs font-medium uppercase text-amber-800 dark:text-amber-300">
                      Próximo pago
                    </p>
                    <p className="mt-0.5 font-semibold text-amber-950 dark:text-amber-100">
                      {formatDate(preview.currentNextDue)} →{" "}
                      {formatDate(preview.newNextDue)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium uppercase text-amber-800 dark:text-amber-300">
                    Nueva fecha final
                  </p>
                  <p className="mt-0.5 font-semibold text-amber-950 dark:text-amber-100">
                    {formatDate(postponeDebt.endDate)} →{" "}
                    {formatDate(preview.newEndDate)}
                  </p>
                </div>
                {preview.newPendingDates.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase text-amber-800 dark:text-amber-300">
                      Nuevos plazos pendientes ({preview.newPendingDates.length}{" "}
                      de {formatCurrency(preview.installmentAmount)})
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {preview.newPendingDates.slice(0, 6).map((d, i) => (
                        <span
                          key={i}
                          className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-900 shadow-sm dark:bg-zinc-800 dark:text-amber-200"
                        >
                          {formatDate(d)}
                        </span>
                      ))}
                      {preview.newPendingDates.length > 6 && (
                        <span className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-900 shadow-sm dark:bg-zinc-800 dark:text-amber-200">
                          +{preview.newPendingDates.length - 6} más
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPostponeDebt(null)}
                  disabled={postponing}
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePostpone}
                  disabled={postponing}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                >
                  {postponing ? "Aplazando..." : "Confirmar prórroga"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
