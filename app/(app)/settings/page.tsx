import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TelegramSettings } from "@/components/TelegramSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { telegramChatId: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Configuración
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Configura el bot de Telegram para recibir recordatorios
        </p>
      </div>

      <TelegramSettings initialChatId={user?.telegramChatId || ""} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">
          ¿Cómo configurar Telegram?
        </h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-blue-800 dark:text-blue-400">
          <li>
            Crea un bot con <strong>@BotFather</strong> en Telegram y obtén el
            token.
          </li>
          <li>Envía un mensaje a tu bot para activarlo.</li>
          <li>Obtén tu chat ID usando @userinfobot o similar.</li>
          <li>
            Guarda el chat ID aquí y configura el token en las variables de
            entorno del servidor (TELEGRAM_BOT_TOKEN).
          </li>
        </ol>
      </div>
    </div>
  );
}
