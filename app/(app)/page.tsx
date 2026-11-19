import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  daysUntilGuatemalaDate,
  formatCurrency,
  formatDate,
  formatFrequency,
  getDueDates,
  getNextDueDate,
  getOverdueInstallments,
  getPaidInstallments,
} from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const debts = await prisma.debt.findMany({
    include: {
      payments: { select: { amount: true } },
    },
  });

  const analyzed = debts.map((d) => {
    const total = Number(d.totalAmount);
    const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Math.max(total - paid, 0);

    const dates = getDueDates(
      d.startDate,
      d.endDate,
      d.paymentFrequency,
      d.dueDay,
      d.numberOfInstallments
    );
    const installment = dates.length > 0 ? total / dates.length : 0;
    const paidInstallments = getPaidInstallments(paid, total, dates.length);

    const overdueDates =
      d.status === "PAID" || balance <= 0
        ? []
        : getOverdueInstallments({
            totalAmount: total,
            startDate: d.startDate,
            endDate: d.endDate,
            paymentFrequency: d.paymentFrequency,
            dueDay: d.dueDay,
            numberOfInstallments: d.numberOfInstallments,
            paid,
            precomputedDates: dates,
          });
    const overdueAmount = Math.min(overdueDates.length * installment, balance);

    const nextDue =
      d.status === "PAID" || balance <= 0
        ? null
        : getNextDueDate(
            d.startDate,
            d.endDate,
            d.paymentFrequency,
            d.dueDay,
            paidInstallments,
            d.numberOfInstallments,
            dates
          );
    const daysUntilNext = nextDue ? daysUntilGuatemalaDate(nextDue) : null;

    return {
      ...d,
      total,
      paid,
      balance,
      installment,
      overdueCount: overdueDates.length,
      overdueAmount,
      nextDue,
      daysUntilNext,
    };
  });

  const totalDebt = analyzed.reduce((sum, d) => sum + d.total, 0);
  const totalPaid = analyzed.reduce((sum, d) => sum + d.paid, 0);

  const totalPending = Math.max(totalDebt - totalPaid, 0);
  const overallProgress =
    totalDebt > 0 ? Math.min(100, Math.round((totalPaid / totalDebt) * 100)) : 0;

  const overdueDebts = analyzed
    .filter((d) => d.overdueCount > 0 && d.status !== "PAID")
    .sort((a, b) => b.overdueCount - a.overdueCount);

  const upcomingDebts = analyzed
    .filter(
      (d) =>
        d.status !== "PAID" &&
        d.balance > 0 &&
        d.nextDue !== null &&
        d.daysUntilNext !== null &&
        d.daysUntilNext >= 0 &&
        d.daysUntilNext <= 15
    )
    .sort((a, b) => (a.daysUntilNext ?? 99) - (b.daysUntilNext ?? 99));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Dashboard
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Resumen general de tus deudas
          </p>
        </div>
        <Link
          href="/debts"
          className="inline-flex w-fit items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
        >
          Gestionar deudas
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Total adeudado
          </p>
          <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatCurrency(totalDebt)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Total pagado
            </p>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
              {overallProgress}%
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-500">
            {formatCurrency(totalPaid)}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Saldo pendiente
          </p>
          <p className="mt-2 text-3xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(totalPending)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Deudas con atraso
          </p>
          <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-500">
            {overdueDebts.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Deudas con cuotas atrasadas
            </h2>
            {overdueDebts.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                {overdueDebts.length}
              </span>
            )}
          </div>
          {overdueDebts.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500 sm:px-6 dark:text-zinc-400">
              No hay deudas con cuotas atrasadas
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {overdueDebts.map((debt) => (
                <li key={debt.id} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {debt.name}
                        </p>
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                          {debt.overdueCount}{" "}
                          {debt.overdueCount === 1
                            ? "cuota atrasada"
                            : "cuotas atrasadas"}{" "}
                          ({formatCurrency(debt.overdueAmount)})
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {formatFrequency(debt.paymentFrequency)} ·{" "}
                        {formatDate(debt.startDate)} a {formatDate(debt.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end">
                      <p className="font-medium text-red-600 dark:text-red-500">
                        Saldo: {formatCurrency(debt.balance)}
                      </p>
                      <Link
                        href="/debts"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                      >
                        Gestionar
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Próximos vencimientos (15 días)
            </h2>
            {upcomingDebts.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {upcomingDebts.length}
              </span>
            )}
          </div>
          {upcomingDebts.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500 sm:px-6 dark:text-zinc-400">
              Sin vencimientos en los próximos 15 días
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {upcomingDebts.map((debt) => (
                <li key={debt.id} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {debt.name}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            debt.daysUntilNext === 0
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          }`}
                        >
                          {debt.daysUntilNext === 0
                            ? "Vence hoy"
                            : debt.daysUntilNext === 1
                              ? "Vence mañana"
                              : `En ${debt.daysUntilNext} días`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {debt.nextDue ? formatDate(debt.nextDue) : ""} · Cuota:{" "}
                        {formatCurrency(debt.installment)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-end">
                      <p className="font-medium text-indigo-600 dark:text-indigo-400">
                        Saldo: {formatCurrency(debt.balance)}
                      </p>
                      <Link
                        href="/debts"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                      >
                        Registrar pago
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
