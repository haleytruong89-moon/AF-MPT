// O6: CI lint gate. Fails when ESLint errors/warnings exceed today's baseline.
// Same scope as `npm run lint` (src, .js/.jsx/.ts/.tsx). Lower the limits as debt is paid.
import { ESLint } from 'eslint';

const MAX_ERRORS = 2;
const MAX_WARNINGS = 32;

const eslint = new ESLint({ extensions: ['.js', '.jsx', '.ts', '.tsx'] });
const results = await eslint.lintFiles(['src']);
const errors = results.reduce((n, r) => n + r.errorCount, 0);
const warnings = results.reduce((n, r) => n + r.warningCount, 0);
console.log(`lint-gate: ${errors} errors (max ${MAX_ERRORS}), ${warnings} warnings (max ${MAX_WARNINGS})`);
if (errors > MAX_ERRORS || warnings > MAX_WARNINGS) {
  console.error('lint-gate: FAILED - lint debt increased');
  process.exit(1);
}
