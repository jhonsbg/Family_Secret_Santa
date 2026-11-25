"use client";

import * as Alert from "@radix-ui/react-alert-dialog";
import { CircleCheck, Gift, Mail, Settings2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/use-reduced-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "./ui/button";

const links = [
  { href: "/", title: "Invitación", Icon: Mail },
  { href: "/participante", title: "Mi partida", Icon: Gift },
  { href: "/organizador", title: "Organizador", Icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const reduced = useReducedMotion();
  const privateAccess = ["/acceso", "/partidas", "/invitacion"].some((route) => path === route || path.startsWith(route + "/"));
  if (path === "/presentacion") return <main id="contenido">{children}</main>;
  return <>
    <a className="skip" href="#contenido">Saltar al contenido</a>
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand"><span className="brand-icon"><Gift size={20} /></span> Amigo Secreto</Link>
        <nav aria-label="Navegación principal">
          {(privateAccess ? [
            { href: "/partidas", title: "Partidas", Icon: Gift },
            { href: "/acceso/cuenta", title: "Mi acceso", Icon: Mail },
            { href: "/", title: "Ver demo", Icon: Sparkles },
          ] : [...links, { href: "/partidas", title: "Partida real", Icon: Sparkles }]).map(({ href, title, Icon }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
            {path === href && <motion.span className="nav-highlight" layoutId={reduced ? undefined : "active-route"} transition={{ duration: .22 }} />}
            <Icon size={16} aria-hidden="true" /><span>{title}</span>
          </Link>)}
        </nav>
        <span className="demo-label">{privateAccess ? "Partidas reales" : "Datos ficticios"}</span>
      </div>
    </header>
    <main id="contenido" tabIndex={-1} className={path === "/display" ? "display-wrap" : "container"}>{children}</main>
    <footer className="footer"><Gift size={16} aria-hidden="true" /> Amigo Secreto {!privateAccess && <span>Demostración E1.1 · Los cambios se pierden al recargar.</span>}</footer>
  </>;
}

export function RevealStage({ title, children }: { title: string; children: ReactNode }) {
  return <section className="reveal-stage" aria-live="polite">
    <div className="stage-ornament" aria-hidden="true"><Sparkles size={37} /></div>
    <p className="hero-kicker">{title}</p>
    {children}
  </section>;
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

export function DemoLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link href={href} className={buttonVariants({ variant: secondary ? "secondary" : "default" })}>{children}</Link>;
}
