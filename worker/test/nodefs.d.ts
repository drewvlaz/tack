// Minimal node:fs surface used by vitest.config.ts. The worker tsconfig
// deliberately omits @types/node (src/ targets the workers runtime), so the
// config file's Node-side imports are declared here instead.
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
