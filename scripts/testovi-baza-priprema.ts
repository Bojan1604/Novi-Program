import "dotenv/config";
import { adresaTestneBaze } from "./lib/testna-baza";

// Testovi nad bazom uvijek rade na testnoj bazi, nikad na DATABASE_URL.
process.env["DATABASE_URL"] = adresaTestneBaze();
