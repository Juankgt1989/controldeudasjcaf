import { Navbar } from "@/components/Navbar";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/debts", label: "Deudas" },
  { href: "/payments", label: "Pagos" },
  { href: "/settings", label: "Configuración" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar links={links} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}
