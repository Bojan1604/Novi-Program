import { Znacka } from "@/components/ui/stranica";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export function Jamstvo({ jamstvoDo, dan }: { jamstvoDo: Date | null; dan: string }) {
  if (!jamstvoDo) return <Znacka>bez jamstva</Znacka>;
  return jamstvoDo.toISOString().slice(0, 10) >= dan ? (
    <Znacka boja="zelena">jamstvo do {datum.format(jamstvoDo)}</Znacka>
  ) : (
    <Znacka>jamstvo isteklo {datum.format(jamstvoDo)}</Znacka>
  );
}
