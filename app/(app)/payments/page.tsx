import { prisma } from "@/lib/prisma";
import { PaymentsManager, type PaymentItem } from "@/components/PaymentsManager";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const payments = await prisma.payment.findMany({
    include: {
      debt: {
        select: { id: true, name: true },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  const initialPayments: PaymentItem[] = payments.map((p) => ({
    id: p.id,
    amount: p.amount.toString(),
    paymentDate: p.paymentDate.toISOString(),
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    debt: p.debt,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Pagos
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Historial de pagos registrados
        </p>
      </div>

      <PaymentsManager initialPayments={initialPayments} />
    </div>
  );
}
