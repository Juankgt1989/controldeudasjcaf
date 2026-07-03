import { DebtManager } from "@/components/DebtManager";

export const dynamic = "force-dynamic";

export default function DebtsPage() {
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

      <DebtManager />
    </div>
  );
}
