// Lets `node --test` run our TypeScript sources directly (Node strips types natively):
// maps the "@/..." alias to src/ and resolves extensionless relative imports to .ts files.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(import.meta.url), "../../src");

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    let target = null;
    if (specifier.startsWith("@/")) target = path.join(SRC, specifier.slice(2));
    else if (specifier.startsWith(".") && /.tsx?$/.test(context.parentURL ?? ""))
      target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (target && !path.extname(target)) {
      for (const cand of [target + ".ts", target + ".tsx", path.join(target, "index.ts")])
        if (existsSync(cand)) return next(pathToFileURL(cand).href, context);
    }
    if (target) return next(pathToFileURL(target).href, context);
    return next(specifier, context);
  },
});
