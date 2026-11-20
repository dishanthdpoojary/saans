import { connection } from "next/server";
import { providerStatus } from "@/lib/server/service";
import { json } from "@/lib/server/guard";

export async function GET() {
  await connection(); // evaluate env at request time, not at build time
  return json({ providers: providerStatus() });
}
