import { runInvestmentCli } from "#src/investment/index.js";

runInvestmentCli(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
