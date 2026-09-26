import { notFound, redirect } from "next/navigation";
import { normalizirajSerijski } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";

/** Odredište QR koda s naljepnice: /uredaji/sn/<serijski> → kartica uređaja. */
export default async function PoSerijskom({ params }: PageProps<"/uredaji/sn/[serijski]">) {
  const k = await pristupStranici("/uredaji");
  const serijski = normalizirajSerijski(decodeURIComponent((await params).serijski)).slice(0, 100);
  const u = await k.db.uredaj.findFirst({ where: { firmaId: k.firmaId, serijski }, select: { id: true } });
  if (!u) notFound();
  redirect(`/uredaji/${u.id}`);
}
