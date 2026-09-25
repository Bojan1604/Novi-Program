import type { Promjena } from "@/domain/dnevnik";

/** Razlika prije/poslije iz dnevnika (vrijednosti već maskirane na poslužitelju). */
export function Promjene({ promjene }: { promjene: readonly Promjena[] }) {
  if (promjene.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-neutral-600 dark:text-neutral-400">{promjene.length} promjena</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-3 font-medium">Polje</th>
              <th className="py-1 pr-3 font-medium">Prije</th>
              <th className="py-1 font-medium">Poslije</th>
            </tr>
          </thead>
          <tbody>
            {promjene.map((p) => (
              <tr key={p.polje} className="border-t border-neutral-100 align-top dark:border-neutral-900">
                <td className="py-1 pr-3 whitespace-nowrap">{p.polje}</td>
                <td className="py-1 pr-3 break-all text-red-700 dark:text-red-400">{p.staro ?? "—"}</td>
                <td className="py-1 break-all text-green-700 dark:text-green-400">{p.novo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
