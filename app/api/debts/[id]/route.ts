import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentFrequency } from "@prisma/client";

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

    const debt = await prisma.debt.update({
      where: { id },
      data: {
        name: name || undefined,
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        paymentFrequency: paymentFrequency || undefined,
        dueDay:
          dueDay !== undefined
            ? dueDay
              ? parseInt(dueDay, 10)
              : null
            : undefined,
        status: status || undefined,
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
