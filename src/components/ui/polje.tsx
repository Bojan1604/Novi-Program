import { useId, type ComponentProps, type ReactNode } from "react";

export const klaseUnosa =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primarna focus:ring-2 focus:ring-primarna/30 disabled:bg-neutral-100 disabled:text-neutral-500 aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-800 sm:text-sm";

type Okvir = { oznaka: ReactNode; greska?: string | undefined; opis?: ReactNode; className?: string };

function OkvirPolja({ id, oznaka, greska, opis, className = "", children }: Okvir & { id: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {oznaka}
      </label>
      {children}
      {opis && !greska && <p className="text-xs text-neutral-500 dark:text-neutral-400">{opis}</p>}
      {greska && (
        <p id={`${id}-greska`} className="text-sm text-red-700 dark:text-red-400">
          {greska}
        </p>
      )}
    </div>
  );
}

export function Polje({ oznaka, greska, opis, className, ...props }: Okvir & Omit<ComponentProps<"input">, "className">) {
  const id = useId();
  return (
    <OkvirPolja id={id} oznaka={oznaka} greska={greska} opis={opis} className={className}>
      <input
        id={id}
        aria-invalid={greska ? true : undefined}
        aria-describedby={greska ? `${id}-greska` : undefined}
        className={klaseUnosa}
        {...props}
      />
    </OkvirPolja>
  );
}

export function Odabir({ oznaka, greska, opis, className, children, ...props }: Okvir & Omit<ComponentProps<"select">, "className">) {
  const id = useId();
  return (
    <OkvirPolja id={id} oznaka={oznaka} greska={greska} opis={opis} className={className}>
      <select id={id} aria-invalid={greska ? true : undefined} className={klaseUnosa} {...props}>
        {children}
      </select>
    </OkvirPolja>
  );
}

export function Kvacica({
  oznaka,
  className = "",
  ...props
}: { oznaka: ReactNode; className?: string } & Omit<ComponentProps<"input">, "type" | "className">) {
  return (
    <label className={`inline-flex min-h-9 items-center gap-2 text-sm ${className}`}>
      <input type="checkbox" className="size-4 accent-primarna" {...props} />
      {oznaka}
    </label>
  );
}
