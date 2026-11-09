import { Navbar } from "@/components/Navbar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/debts", label: "Deudas" },
  { href: "/payments", label: "Pagos" },
  { href: "/settings", label: "Configuración" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <Navbar links={links} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}
