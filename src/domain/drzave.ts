/** Države za odabir (ISO 3166-1 alpha-2) — EU prve, zatim susjedne i česte. */
export const DRZAVE: { kod: string; naziv: string }[] = [
  { kod: "HR", naziv: "Hrvatska" },
  { kod: "AT", naziv: "Austrija" },
  { kod: "BE", naziv: "Belgija" },
  { kod: "BG", naziv: "Bugarska" },
  { kod: "CY", naziv: "Cipar" },
  { kod: "CZ", naziv: "Češka" },
  { kod: "DK", naziv: "Danska" },
  { kod: "EE", naziv: "Estonija" },
  { kod: "FI", naziv: "Finska" },
  { kod: "FR", naziv: "Francuska" },
  { kod: "GR", naziv: "Grčka" },
  { kod: "IE", naziv: "Irska" },
  { kod: "IT", naziv: "Italija" },
  { kod: "LV", naziv: "Latvija" },
  { kod: "LT", naziv: "Litva" },
  { kod: "LU", naziv: "Luksemburg" },
  { kod: "HU", naziv: "Mađarska" },
  { kod: "MT", naziv: "Malta" },
  { kod: "DE", naziv: "Njemačka" },
  { kod: "NL", naziv: "Nizozemska" },
  { kod: "PL", naziv: "Poljska" },
  { kod: "PT", naziv: "Portugal" },
  { kod: "RO", naziv: "Rumunjska" },
  { kod: "SK", naziv: "Slovačka" },
  { kod: "SI", naziv: "Slovenija" },
  { kod: "ES", naziv: "Španjolska" },
  { kod: "SE", naziv: "Švedska" },
  { kod: "AL", naziv: "Albanija" },
  { kod: "BA", naziv: "Bosna i Hercegovina" },
  { kod: "ME", naziv: "Crna Gora" },
  { kod: "XK", naziv: "Kosovo" },
  { kod: "MK", naziv: "Sjeverna Makedonija" },
  { kod: "RS", naziv: "Srbija" },
  { kod: "CH", naziv: "Švicarska" },
  { kod: "NO", naziv: "Norveška" },
  { kod: "GB", naziv: "Ujedinjeno Kraljevstvo" },
  { kod: "TR", naziv: "Turska" },
  { kod: "UA", naziv: "Ukrajina" },
  { kod: "US", naziv: "SAD" },
  { kod: "CA", naziv: "Kanada" },
  { kod: "CN", naziv: "Kina" },
  { kod: "JP", naziv: "Japan" },
];

export function jeDrzava(kod: string): boolean {
  return DRZAVE.some((d) => d.kod === kod);
}

export function nazivDrzave(kod: string): string {
  return DRZAVE.find((d) => d.kod === kod)?.naziv ?? kod;
}
