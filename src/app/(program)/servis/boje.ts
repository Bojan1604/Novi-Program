import { jeOtvoren } from "@/domain/servis";

export function bojaStatusa(s: string): "siva" | "zelena" | "crvena" | "plava" | "zuta" {
  return s === "GOTOV" ? "zelena" : s === "CEKA_DIJELOVE" ? "zuta" : s === "OTPISAN" ? "crvena" : jeOtvoren(s) ? "plava" : "siva";
}
