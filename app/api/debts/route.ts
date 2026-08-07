import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentFrequency, DebtStatus } from "@prisma/client";
import { calculateEndDate } from "@/lib/utils";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const debts = await prisma.debt.findMany({
    include: {
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(debts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      totalAmount,
      startDate,
      endDate,
      paymentFrequency,
      dueDay,
      numberOfInstallments,
      status,
    } = body;

    if (!name || !totalAmount || !startDate || !paymentFrequency) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!Object.values(PaymentFrequency).includes(paymentFrequency)) {
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

    const installments = numberOfInstallments
      ? parseInt(numberOfInstallments, 10)
      : null;

    const calculatedEndDate =
      installments && installments > 0
        ? calculateEndDate(startDate, paymentFrequency, installments)
        : endDate
          ? new Date(endDate)
          : null;

    if (!calculatedEndDate) {
      return NextResponse.json(
        { error: "endDate or numberOfInstallments is required" },
        { status: 400 }
      );
    }

    const debt = await prisma.debt.create({
      data: {
        name,
        totalAmount: parseFloat(totalAmount),
        startDate: new Date(startDate),
        endDate: calculatedEndDate,
        paymentFrequency,
        dueDay: dueDay ? parseInt(dueDay, 10) : null,
        numberOfInstallments: installments,
        status: status || undefined,
      },
    });

    return NextResponse.json(debt, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create debt" },
      { status: 500 }
    );
  }
}
