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
    timeZone: "UTC",
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

// Las fechas de vencimiento son fechas de calendario, no instantes. Prisma las
// devuelve como medianoche UTC (@db.Date), asi que toda la aritmetica se hace en
// UTC para que el resultado no dependa de la zona horaria del contenedor.
function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function clampToMonth(year: number, month: number, day: number): Date {
  return calendarDate(year, month, Math.min(day, daysInMonth(year, month)));
}

function addMonthsClamped(
  date: Date,
  months: number,
  anchorDay: number
): Date {
  return clampToMonth(date.getUTCFullYear(), date.getUTCMonth() + months, anchorDay);
}

export function calculateEndDate(
  startDate: Date | string,
  frequency: PaymentFrequency,
  numberOfInstallments: number
): Date {
  const start = new Date(startDate);

  if (frequency === "MONTHLY") {
    return addMonthsClamped(start, numberOfInstallments - 1, start.getUTCDate());
  }

  const days = frequency === "WEEKLY" ? 7 : 15;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (numberOfInstallments - 1) * days);
  return end;
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
    const anchorDay = dueDay ?? start.getUTCDate();
    let current = clampToMonth(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      anchorDay
    );
    if (current < start) {
      current = addMonthsClamped(start, 1, anchorDay);
    }
    while (current <= end) {
      dates.push(new Date(current));
      current = addMonthsClamped(current, 1, anchorDay);
    }
  } else {
    const days = frequency === "WEEKLY" ? 7 : 15;
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + days);
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

export function getPaidInstallments(
  paid: number,
  totalAmount: number | string,
  dueDatesLength: number
): number {
  if (dueDatesLength <= 0) return 0;
  const total =
    typeof totalAmount === "string" ? parseFloat(totalAmount) : Number(totalAmount);
  const installment = total / dueDatesLength;
  if (installment <= 0) return 0;
  return Math.min(dueDatesLength, Math.floor(paid / installment + 1e-9));
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
  dueDay?: number | null,
  paidInstallments: number = 0
): Date | null {
  const today = new Date();
  const dates = getDueDates(startDate, endDate, frequency, dueDay);
  const remaining = dates.slice(paidInstallments);

  for (const date of remaining) {
    if (date > today) {
      return date;
    }
  }

  return remaining[remaining.length - 1] ?? null;
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

const gtDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
});

function utcDateKey(date: Date | string): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function guatemalaTodayKey(): string {
  return gtDateFormatter.format(new Date());
}

export function computeDebtStatus(args: {
  status: string;
  totalAmount: number | string;
  startDate: Date | string;
  endDate: Date | string;
  paymentFrequency: PaymentFrequency;
  dueDay?: number | null;
  paid: number;
}): string {
  const {
    status,
    totalAmount,
    startDate,
    endDate,
    paymentFrequency,
    dueDay,
    paid,
  } = args;
  const total = Number(totalAmount);

  if (status === "PAID" || paid >= total) return "PAID";

  const todayKey = guatemalaTodayKey();
  const dates = getDueDates(startDate, endDate, paymentFrequency, dueDay);

  if (dates.length === 0) {
    return utcDateKey(endDate) < todayKey ? "PENDING" : "ACTIVE";
  }

  const passedDates = dates.filter((d) => utcDateKey(d) <= todayKey);

  if (passedDates.length === 0) {
    return paid > 0 ? "ON_TIME" : "ACTIVE";
  }

  const installment = getInstallmentAmount(
    totalAmount,
    startDate,
    endDate,
    paymentFrequency,
    dueDay
  );
  const expected = installment * passedDates.length;

  if (paid < expected) return "PENDING";

  return paid > 0 ? "ON_TIME" : "ACTIVE";
}
