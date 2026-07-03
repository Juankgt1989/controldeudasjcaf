import { PaymentFrequency } from "@prisma/client";

export function formatCurrency(amount: number | string | bigint) {
  const value = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
  }).format(value);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("es-GT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatFrequency(frequency: PaymentFrequency) {
  switch (frequency) {
    case "WEEKLY":
      return "Semanal";
    case "BIWEEKLY":
      return "Quincenal";
    case "MONTHLY":
      return "Mensual";
    default:
      return frequency;
  }
}

export function getDueDates(
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): Date[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: Date[] = [];

  if (frequency === "MONTHLY") {
    const day = dueDay ?? start.getDate();
    const current = new Date(start.getFullYear(), start.getMonth(), day);
    if (current < start) {
      current.setMonth(current.getMonth() + 1);
    }
    while (current <= end) {
      dates.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    const days = frequency === "WEEKLY" ? 7 : 15;
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + days);
    }
  }

  return dates;
}

export function getInstallmentAmount(
  totalAmount: number | string,
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): number {
  const dates = getDueDates(startDate, endDate, frequency, dueDay);
  if (dates.length === 0) return 0;
  const total =
    typeof totalAmount === "string" ? parseFloat(totalAmount) : Number(totalAmount);
  return total / dates.length;
}

export function getCurrentDueDate(
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): Date | null {
  const today = new Date();
  const dates = getDueDates(startDate, endDate, frequency, dueDay);

  if (dates.length === 0) return null;

  // Find the first due date that is today or in the future
  for (const date of dates) {
    if (date >= today) {
      return date;
    }
  }

  // All due dates passed; return the last one
  return dates[dates.length - 1];
}

export function getNextDueDate(
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): Date | null {
  const today = new Date();
  const dates = getDueDates(startDate, endDate, frequency, dueDay);

  for (const date of dates) {
    if (date > today) {
      return date;
    }
  }

  return dates[dates.length - 1] ?? null;
}

export function isOverdue(
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): boolean {
  const today = new Date();
  const currentDue = getCurrentDueDate(startDate, endDate, frequency, dueDay);

  if (!currentDue) return today > new Date(endDate);

  return today > currentDue;
}

export function daysOverdue(
  startDate: Date | string,
  endDate: Date | string,
  frequency: PaymentFrequency,
  dueDay?: number | null
): number {
  const today = new Date();
  const currentDue = getCurrentDueDate(startDate, endDate, frequency, dueDay);

  if (!currentDue) {
    const diff = today.getTime() - new Date(endDate).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const diff = today.getTime() - currentDue.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
