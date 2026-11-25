import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { AppShell } from "@/components/christmas";
import { DemoProvider } from "@/features/demo/state";

export const metadata: Metadata = {
  title: "Amigo Secreto · Una Navidad llena de secretos",
  description: "Prototipo de una celebración familiar de amigo secreto con datos ficticios.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CO"><body><DemoProvider><AppShell>{children}</AppShell></DemoProvider></body></html>;
}
