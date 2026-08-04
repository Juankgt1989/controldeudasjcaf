export async function register() {
  const { startReminderCron } = await import("@/lib/cron");
  startReminderCron();
}
