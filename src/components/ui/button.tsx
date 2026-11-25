"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "motion/react";
import { useReducedMotion } from "@/components/use-reduced-motion";

// Patrón Button de shadcn/ui, con variantes del sistema visual del proyecto.
export const buttonVariants = cva("button", {
  variants: { variant: { default: "button-primary", secondary: "button-secondary", danger: "button-danger" } },
  defaultVariants: { variant: "default" },
});

export function Button({ variant, className, type = "button", ...props }: HTMLMotionProps<"button"> & VariantProps<typeof buttonVariants>) {
  const reduced = useReducedMotion();
  return <motion.button
    type={type}
    className={buttonVariants({ variant, className })}
    whileHover={reduced || props.disabled ? undefined : { scale: 1.015 }}
    whileTap={reduced || props.disabled ? undefined : { scale: .98 }}
    transition={{ duration: .13 }}
    {...props}
  />;
}
