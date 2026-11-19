import { prisma } from "@/lib/prisma";
import { computeDebtStatus } from "@/lib/utils";
import { DebtManager, type DebtItem } from "@/components/DebtManager";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const debts = await prisma.debt.findMany({
    include: {
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const initialDebts: DebtItem[] = debts.map((debt) => {
    const paid = debt.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      id: debt.id,
      name: debt.name,
      totalAmount: debt.totalAmount.toString(),
      startDate: debt.startDate.toISOString(),
      endDate: debt.endDate.toISOString(),
      paymentFrequency: debt.paymentFrequency,
      dueDay: debt.dueDay,
      numberOfInstallments: debt.numberOfInstallments,
      status: computeDebtStatus({
        status: debt.status,
        totalAmount: Number(debt.totalAmount),
        startDate: debt.startDate,
        endDate: debt.endDate,
        paymentFrequency: debt.paymentFrequency,
        dueDay: debt.dueDay,
        numberOfInstallments: debt.numberOfInstallments,
        paid,
      }),
      payments: debt.payments.map((p) => ({ amount: p.amount.toString() })),
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Deudas
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Administra tus deudas y registra pagos
        </p>
      </div>

      <DebtManager initialDebts={initialDebts} />
    </div>
  );
}
