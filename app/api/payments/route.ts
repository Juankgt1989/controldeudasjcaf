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

    const debt = await prisma.debt.findUnique({
      where: { id: debtId },
      include: {
        payments: { select: { amount: true } },
      },
    });

    if (!debt) {
      return NextResponse.json({ error: "Debt not found" }, { status: 404 });
    }

    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount" },
        { status: 400 }
      );
    }

    const parsedDate = new Date(paymentDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid payment date" },
        { status: 400 }
      );
    }

    const cleanedNotes = notes ? String(notes).trim() : undefined;
    if (cleanedNotes && cleanedNotes.length > 500) {
      return NextResponse.json(
        { error: "Notes must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    const previouslyPaid = debt.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    const totalAmount = Number(debt.totalAmount);
    const remainingBalance = Math.max(totalAmount - previouslyPaid, 0);

    if (debt.status === "PAID" || remainingBalance <= 0.005) {
      return NextResponse.json(
        { error: "Esta deuda ya está pagada" },
        { status: 400 }
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          debtId,
          amount: numericAmount,
          paymentDate: parsedDate,
          notes: cleanedNotes,
        },
      });

      if (previouslyPaid + numericAmount >= totalAmount - 0.005) {
        await tx.debt.update({
          where: { id: debtId },
          data: { status: "PAID" },
        });
      }

      return created;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to register payment" },
      { status: 500 }
    );
  }
}
