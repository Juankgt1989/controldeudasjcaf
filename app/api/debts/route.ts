import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentFrequency } from "@prisma/client";

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
    const { name, totalAmount, startDate, endDate, paymentFrequency, dueDay } =
      body;

    if (!name || !totalAmount || !startDate || !endDate || !paymentFrequency) {
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

    const debt = await prisma.debt.create({
      data: {
        name,
        totalAmount: parseFloat(totalAmount),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        paymentFrequency,
        dueDay: dueDay ? parseInt(dueDay, 10) : null,
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
