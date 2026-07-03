import { PaymentsManager } from "@/components/PaymentsManager";

export const dynamic = "force-dynamic";

export default function PaymentsPage() {
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

      <PaymentsManager />
    </div>
  );
}
