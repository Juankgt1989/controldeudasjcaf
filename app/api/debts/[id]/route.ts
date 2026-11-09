import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentFrequency, DebtStatus } from "@prisma/client";
import {
  calculateEndDate,
  getDueDates,
  getPaidInstallments,
  postponeEndDate,
} from "@/lib/utils";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      totalAmount,
      startDate,
      endDate,
      paymentFrequency,
      dueDay,
      status,
      numberOfInstallments,
    } = body;

    if (
      paymentFrequency &&
      !Object.values(PaymentFrequency).includes(paymentFrequency)
    ) {
      return NextResponse.json(
        { error: "Invalid payment frequency" },
        { status: 400 }
      );
    }

    if (status && !Object.values(DebtStatus).includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const installments =
      numberOfInstallments !== undefined
        ? numberOfInstallments
          ? parseInt(numberOfInstallments, 10)
          : null
        : undefined;

    let calculatedEndDate: Date | undefined;
    if (endDate) {
      calculatedEndDate = new Date(endDate);
    } else if (installments && installments > 0) {
      const freq = paymentFrequency || undefined;
      if (freq) {
        calculatedEndDate = calculateEndDate(
          startDate || new Date().toISOString(),
          freq,
          installments,
          dueDay ? parseInt(dueDay, 10) : null
        );
      }
    }

    const debt = await prisma.debt.update({
      where: { id },
      data: {
        name: name || undefined,
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: calculatedEndDate,
        paymentFrequency: paymentFrequency || undefined,
        dueDay:
          dueDay !== undefined
            ? dueDay
              ? parseInt(dueDay, 10)
              : null
            : undefined,
        status: status || undefined,
        numberOfInstallments: installments,
      },
    });

    return NextResponse.json(debt);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to update debt" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const months =
      typeof body.months === "number" && body.months > 0
        ? Math.floor(body.months)
        : 1;

    const existing = await prisma.debt.findUnique({
      where: { id },
      include: { payments: { select: { amount: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Debt not found" }, { status: 404 });
    }

    const currentDates = getDueDates(
      existing.startDate,
      existing.endDate,
      existing.paymentFrequency,
      existing.dueDay,
      existing.numberOfInstallments
    );

    const installmentsCount =
      existing.numberOfInstallments && existing.numberOfInstallments > 0
        ? existing.numberOfInstallments
        : currentDates.length;

    const paid = existing.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    const paidInstallments = getPaidInstallments(
      paid,
      Number(existing.totalAmount),
      currentDates.length
    );
    const firstUnpaidDate = currentDates[paidInstallments];

    const newEndDate = postponeEndDate(
      existing.startDate,
      existing.endDate,
      existing.paymentFrequency,
      existing.dueDay,
      months
    );

    const debt = await prisma.debt.update({
      where: { id },
      data: {
        endDate: newEndDate,
        numberOfInstallments:
          installmentsCount > 0
            ? installmentsCount
            : existing.numberOfInstallments,
      },
    });

    if (firstUnpaidDate) {
      await prisma.installmentNotification.deleteMany({
        where: {
          debtId: id,
          dueDate: { gte: firstUnpaidDate },
        },
      });
    }

    return NextResponse.json(debt);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to postpone debt" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.debt.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to delete debt" },
      { status: 500 }
    );
  }
}
