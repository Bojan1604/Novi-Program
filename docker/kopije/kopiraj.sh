#!/bin/sh
# Svaku noć u KOPIJE_SAT (zadano 03:15, Europe/Zagreb): pg_dump cijele baze u /kopije (čuva KOPIJE_DANA, zadano 30),
# pa, ako je postavljen KOPIJE_CILJ (npr. "s3kopije:erp-kopije" ili "sftp:kopije"), kopija izvan poslužitelja rcloneom.
# Postavke rclonea iz okoline (RCLONE_CONFIG_<IME>_TYPE…) — vidi docs/INSTALACIJA.md.
# `kopiraj.sh sada` napravi kopiju odmah (za provjeru).
set -eu
SAT="${KOPIJE_SAT:-03:15}"
DANA="${KOPIJE_DANA:-30}"

kopija() {
  ime="/kopije/erp-$(date +%Y-%m-%d-%H%M).dump"
  echo "$(date '+%F %T') kopija → $ime"
  # „set -e“ ne vrijedi unutar funkcije pozvane s || — svaka greška se provjerava izričito
  if ! PGPASSWORD="$BAZA_LOZINKA" pg_dump -h baza -U erp -d erp_wms -Fc -f "$ime.tmp"; then
    rm -f "$ime.tmp"; echo "$(date '+%F %T') GREŠKA: pg_dump nije uspio"; return 1
  fi
  # kopija mora biti čitljiva (popis sadržaja) prije nego što zamijeni stare
  if ! pg_restore -l "$ime.tmp" >/dev/null; then
    rm -f "$ime.tmp"; echo "$(date '+%F %T') GREŠKA: kopija nije ispravna"; return 1
  fi
  mv "$ime.tmp" "$ime"
  # stare se brišu tek kad nova uspije, i uvijek ostaje barem 7 zadnjih
  ls -1t /kopije/erp-*.dump 2>/dev/null | tail -n +8 | while read -r stara; do
    find "$stara" -mtime +"$DANA" -delete
  done
  if [ -n "${KOPIJE_CILJ:-}" ]; then
    rclone copy /kopije "$KOPIJE_CILJ" --include 'erp-*.dump' --max-age 48h && echo "$(date '+%F %T') poslano: $KOPIJE_CILJ" \
      || echo "$(date '+%F %T') GREŠKA: slanje izvan poslužitelja nije uspjelo"
  fi
}

if [ "${1:-}" = "sada" ]; then kopija; exit 0; fi
while true; do
  sada=$(date +%s)
  cilj=$(date -d "today $SAT" +%s)
  [ "$cilj" -le "$sada" ] && cilj=$(date -d "tomorrow $SAT" +%s)
  sleep $((cilj - sada))
  kopija || echo "$(date '+%F %T') GREŠKA: kopija nije uspjela — prethodne kopije su sačuvane"
done
