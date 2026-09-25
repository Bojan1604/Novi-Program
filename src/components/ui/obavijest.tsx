import type { ReactNode } from "react";

const VRSTE = {
  greska: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  uspjeh: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  upozorenje: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
} as const;

export function Obavijest({ vrsta = "info", children }: { vrsta?: keyof typeof VRSTE; children: ReactNode }) {
  return (
    <div role={vrsta === "greska" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${VRSTE[vrsta]}`}>
      {children}
    </div>
  );
}
