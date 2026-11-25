import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { AppShell } from "@/components/christmas";

export const metadata: Metadata = {
  title: "Amigo Secreto · Una Navidad llena de secretos",
  description: "Organiza el amigo secreto de tu familia y guíen juntos la revelación de los regalos.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CO"><body><AppShell>{children}</AppShell></body></html>;
}
