/** npm run parse:once [platform] — разовый прогон парсеров для проверки */
import { parsers, runParser } from './index.js';

const only = process.argv[2];
for (const p of parsers) {
  if (only && p.id !== only) continue;
  if (!p.enabled()) {
    console.log(`${p.id}: disabled`);
    continue;
  }
  console.log(p.id, await runParser(p));
}
process.exit(0);
