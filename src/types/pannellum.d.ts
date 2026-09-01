/**
 * M11 Phase 1 — `pannellum` ships no published ES-module types (its
 * build is a plain script that sets `window.pannellum`), and
 * `@types/pannellum` on DefinitelyTyped declares an ambient global
 * rather than a module, which doesn't fit this project's
 * `import("pannellum")` dynamic side-effect import (see
 * `src/components/tour/panorama-tour.tsx`). This minimal declaration is
 * enough to satisfy that one side-effect import; the actual runtime
 * shape used is separately, narrowly typed inline in
 * `panorama-tour.tsx` via `window as unknown as { pannellum?: ... }`,
 * not through this file.
 */
declare module "pannellum";
