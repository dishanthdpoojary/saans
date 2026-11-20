// `npm run dev`: Tailwind stylesheet watcher + Next dev server, in one command, on any OS.
import { spawn } from "node:child_process";

const opts = { stdio: "inherit", shell: true };
const tw = spawn("node scripts/tw-build.mjs --watch", opts);
const next = spawn("next dev", opts);
const stop = () => {
  tw.kill();
  next.kill();
};
next.on("exit", (code) => {
  tw.kill();
  process.exit(code ?? 0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
