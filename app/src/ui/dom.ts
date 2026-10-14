export const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
export const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(s));
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
/** экспоненциальное сглаживание, не зависящее от частоты кадров */
export const damp = (cur: number, target: number, lambda: number, dtMs: number) => lerp(cur, target, 1 - Math.exp((-lambda * dtMs) / 1000));
export const rafOnce = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
