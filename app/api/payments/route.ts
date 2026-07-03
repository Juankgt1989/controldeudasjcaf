import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payments = await prisma.payment.findMany({
    include: {
      debt: {
        select: { id: true, name: true },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { debtId, amount, paymentDate, notes } = body;

    if (!debtId || !amount || !paymentDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const debt = await prisma.debt.findUnique({ where: { id: debtId } });

    if (!debt) {
      return NextResponse.json({ error: "Debt not found" }, { status: 404 });
    }

    const payment = await prisma.payment.create({
      data: {
        debtId,
        amount: parseFloat(amount),
        paymentDate: new Date(paymentDate),
        notes: notes || undefined,
      },
    });

    const debtWithPayments = await prisma.debt.findUnique({
      where: { id: debtId },
      include: {
        payments: { select: { amount: true } },
      },
    });

    if (debtWithPayments) {
      const paid = debtWithPayments.payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );
      if (paid >= Number(debtWithPayments.totalAmount)) {
        await prisma.debt.update({
          where: { id: debtId },
          data: { status: "PAID" },
        });
      }
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to register payment" },
      { status: 500 }
    );
  }
}
