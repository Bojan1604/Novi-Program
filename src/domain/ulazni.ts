/** Statusi ulaznih računa (ručni: evidentiran/storniran; eRačun: čeka prihvat, prihvaćen, odbijen). */
export const STATUSI_ULAZNIH: Record<string, string> = {
  EVIDENTIRAN: "Evidentiran",
  PRIMLJEN: "Čeka prihvat",
  PRIHVACEN: "Prihvaćen",
  ODBIJEN: "Odbijen",
  STORNIRAN: "Storniran",
};
