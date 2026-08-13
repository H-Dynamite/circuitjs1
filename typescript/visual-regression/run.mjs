import { run } from "./verified-runner.mjs";

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
