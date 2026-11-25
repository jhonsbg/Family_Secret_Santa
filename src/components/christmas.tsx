"use client";

import * as Alert from "@radix-ui/react-alert-dialog";
import { CircleCheck, Gift, House, Settings2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

const links = [
  { href: "/", title: "Inicio", Icon: House },
  { href: "/acceso/cuenta", title: "Mi partida", Icon: Gift },
  { href: "/partidas/organizar", title: "Organizar", Icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduced = useReducedMotion();
  if (path === "/presentacion") return <main id="contenido">{children}</main>;
  const active = path.startsWith("/acceso") ? "/acceso/cuenta" : path;
  return <>
    <a className="skip" href="#contenido">Saltar al contenido</a>
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand"><span className="brand-icon"><Gift size={20} aria-hidden="true" /></span> Amigo Secreto</Link>
        <nav aria-label="Navegación principal">
          {links.map(({ href, title, Icon }) => <Link key={href} href={href} aria-current={active === href ? "page" : undefined}>
            {active === href && <motion.span className="nav-highlight" layoutId={reduced ? undefined : "active-route"} transition={{ duration: .22 }} />}
            <Icon size={16} aria-hidden="true" /><span>{title}</span>
          </Link>)}
        </nav>
      </div>
    </header>
    <main id="contenido" tabIndex={-1} className="container">{children}</main>
    <footer className="footer"><Gift size={16} aria-hidden="true" /> Amigo Secreto</footer>
  </>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.section initial={reduced ? false : { y: 8 }} animate={{ y: 0 }} transition={{ duration: reduced ? 0 : .22 }} className={`card ${className}`}>{children}</motion.section>;
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill"><CircleCheck size={15} aria-hidden="true" /> {children}</span>;
}

export function Confirm({ label, title, children, onConfirm, secondary = false, disabled = false }: {
  label: string; title: string; children: ReactNode; onConfirm: () => void; secondary?: boolean; disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  return <Alert.Root>
    <Alert.Trigger asChild><Button disabled={disabled} variant={secondary ? "secondary" : "default"}>{label}</Button></Alert.Trigger>
    <Alert.Portal>
      <Alert.Overlay className="overlay" />
      <Alert.Content asChild>
        <motion.div className="dialog card" initial={reduced ? false : { opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }}>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{children}</Alert.Description>
          <div className="actions"><Alert.Cancel asChild><Button variant="secondary">Cancelar</Button></Alert.Cancel><Alert.Action asChild><Button onClick={onConfirm}>Confirmar</Button></Alert.Action></div>
        </motion.div>
      </Alert.Content>
    </Alert.Portal>
  </Alert.Root>;
}

export function EnvelopeArt({ open = false, play = false }: { open?: boolean; play?: boolean }) {
  const opening = open && play;
  return <div className="envelope-art" data-open={open} aria-hidden="true">
    <motion.span className="envelope-fold" initial={opening ? { rotateX: 0 } : false}
      animate={{ rotateX: open ? 175 : 0 }} transition={{ duration: opening ? .46 : 0, delay: opening ? .12 : 0 }} />
    <motion.span className="envelope-seal"
      initial={opening ? { opacity: 1, scale: 1, x: "-50%", y: "-6%" } : false}
      animate={{ opacity: open ? 0 : 1, scale: open ? .65 : 1, x: "-50%", y: "-6%" }}
      transition={{ duration: opening ? .24 : 0 }}><Sparkles size={23} /></motion.span>
  </div>;
}

export function EnvelopeScene({ children, open = false, play = false }: { children?: ReactNode; open?: boolean; play?: boolean }) {
  return <div className="hero-art" aria-hidden={children ? undefined : true}>
    <span className="art-orbit" /><span className="art-orbit orbit-inner" />
    <span className="star star-one" aria-hidden="true">✧</span><span className="star star-two" aria-hidden="true">✦</span><span className="star star-three" aria-hidden="true">✧</span>
    <EnvelopeArt open={open} play={play} />
    {children}
  </div>;
}
