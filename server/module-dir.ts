import path from "path";

/**
 * Каталог, относительно которого ищутся `public/` (статика) и `.env*`.
 *
 * Берётся от запускаемого файла, а не от `__dirname`/`import.meta.url`:
 * esbuild в CJS-бандле подставляет в `__dirname` пустую строку, а
 * `import.meta.url` в CJS недоступен — оба варианта ломали запуск на Layero.
 *
 * - продакшен: `node dist/index.js` → argv[1] = dist/index.js → каталог `dist`,
 *   где лежит собранный `public/`;
 * - разработка: `tsx server/index.ts` → argv[1] = server/index.ts → каталог
 *   `server`, откуда видны `../client` и корневые `.env*`.
 */
export const moduleDir = process.argv[1]
  ? path.dirname(path.resolve(process.argv[1]))
  : process.cwd();