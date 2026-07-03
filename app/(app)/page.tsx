import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  formatCurrency,
  formatDate,
  formatFrequency,
  isOverdue,
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

  const totalDebt = debts.reduce((sum, d) => sum + Number(d.totalAmount), 0);
  const totalPaid = debts.reduce(
    (sum, d) =>
      sum + d.payments.reduce((pSum, p) => pSum + Number(p.amount), 0),
    0
  );
  const totalPending = totalDebt - totalPaid;
  const overdueDebts = debts
    .map((d) => ({
      ...d,
      paid: d.payments.reduce((s, p) => s + Number(p.amount), 0),
      overdue: isOverdue(
        d.startDate,
        d.endDate,
        d.paymentFrequency,
        d.dueDay ?? undefined
      ),
    }))
    .filter((d) => d.overdue && d.status !== "PAID");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Resumen general de tus deudas
        </p>
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
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Total pagado
          </p>
          <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-500">
            {formatCurrency(totalPaid)}
          </p>
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
            Deudas vencidas
          </p>
          <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-500">
            {overdueDebts.length}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Deudas vencidas
          </h2>
        </div>
        {overdueDebts.length === 0 ? (
          <p className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-400">
            No hay deudas vencidas
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {overdueDebts.map((debt) => {
              const balance = Number(debt.totalAmount) - debt.paid;
              return (
                <li key={debt.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {debt.name}
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {formatFrequency(debt.paymentFrequency)} -{" "}
                        {formatDate(debt.startDate)} a {formatDate(debt.endDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-red-600 dark:text-red-500">
                        Saldo: {formatCurrency(balance)}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
