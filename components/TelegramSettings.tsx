"use client";

import { useState } from "react";

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const labelClass =
  "block text-sm font-medium text-zinc-900 dark:text-zinc-100";

export function TelegramSettings({ initialChatId }: { initialChatId: string }) {
  const [chatId, setChatId] = useState(initialChatId);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const res = await fetch("/api/settings/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramChatId: chatId }),
    });

    setLoading(false);

    if (res.ok) {
      setSaved(true);
    } else {
      alert("Error al guardar");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Chat ID de Telegram
      </h2>
      <div className="mt-4">
        <label className={labelClass}>Tu Chat ID</label>
        <input
          type="text"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Ej. 123456789"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Guardar"}
      </button>
      {saved && (
        <p className="mt-2 text-sm text-green-600 dark:text-green-400">
          Guardado correctamente
        </p>
      )}
    </form>
  );
}
