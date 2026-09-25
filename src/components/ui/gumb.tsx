import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type Varijanta = "primarni" | "sekundarni" | "opasni" | "tihi";

const VARIJANTE: Record<Varijanta, string> = {
  primarni: "bg-primarna text-primarna-tekst hover:bg-primarna-tamnija border border-transparent",
  sekundarni:
    "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
  opasni: "border border-transparent bg-red-700 text-white hover:bg-red-800",
  tihi: "border border-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
};

export function klaseGumba(varijanta: Varijanta = "sekundarni", malen = false): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primarna disabled:cursor-not-allowed disabled:opacity-60",
    malen ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
    VARIJANTE[varijanta],
  ].join(" ");
}

export function Gumb({
  varijanta = "sekundarni",
  malen = false,
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { varijanta?: Varijanta; malen?: boolean }) {
  return <button type={type} className={`${klaseGumba(varijanta, malen)} ${className}`} {...props} />;
}

export function GumbVeza({
  varijanta = "sekundarni",
  malen = false,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { varijanta?: Varijanta; malen?: boolean; children: ReactNode }) {
  return (
    <Link className={`${klaseGumba(varijanta, malen)} ${className}`} {...props}>
      {children}
    </Link>
  );
}
