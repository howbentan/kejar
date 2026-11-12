# New deck cards mockup (Plan E1)

Cheese Ais, Nasi Lemak KFC and Tuch and Ga, drawn by the real app components with sample data.

- `new-deck-cards.html` is the built, self-contained page. Open it in a browser as it is. It's the same page as the private artifact.
- `index.html`, `main.tsx`, `vite.config.ts` and `build.mjs` are its source. The imports expect the files to sit in `app/mockups/e1/`, so to rebuild:
  1. Copy these four files into `app/mockups/e1/`.
  2. From `app/`, run `node mockups/e1/build.mjs`.
  3. It writes a fresh `app/mockups/e1/new-deck-cards.html`. Copy it back here, then delete `app/mockups/e1/` (it isn't part of the app).
- The map section is a drawing made with the sizes and colours from `app/src/game/Map.tsx`, because the live map needs internet tiles.
