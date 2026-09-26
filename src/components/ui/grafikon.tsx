/** Stupčasti grafikon (SVG, bez vanjskih biblioteka): mjeseci × kategorije, složeni stupci. */
const BOJE = ["#0f766e", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#65a30d", "#db2777", "#475569", "#ca8a04"];

export function StupcaniGrafikon({
  oznake,
  serije,
  vrijednosti,
  opis,
  format,
}: {
  oznake: string[];
  serije: string[];
  /** [oznaka][serija] */
  vrijednosti: number[][];
  opis: string;
  format: (n: number) => string;
}) {
  const ukupno = vrijednosti.map((r) => r.reduce((a, b) => a + Math.max(0, b), 0));
  const max = Math.max(1, ...ukupno);
  const W = 640;
  const H = 220;
  const sirina = W / Math.max(1, oznake.length);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full" role="img" aria-label={opis}>
        {oznake.map((o, i) => {
          let y = H;
          return (
            <g key={o}>
              {serije.map((s, j) => {
                const v = Math.max(0, vrijednosti[i]![j] ?? 0);
                const h = (v / max) * (H - 10);
                y -= h;
                return v ? (
                  <rect key={s} x={i * sirina + sirina * 0.15} y={y} width={sirina * 0.7} height={h} fill={BOJE[j % BOJE.length]}>
                    <title>{`${o} · ${s}: ${format(v)}`}</title>
                  </rect>
                ) : null;
              })}
              <text x={i * sirina + sirina / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="currentColor">
                {o}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-xs">
        {serije.map((s, j) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: BOJE[j % BOJE.length] }} aria-hidden />
            {s}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
