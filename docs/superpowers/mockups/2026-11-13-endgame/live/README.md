# Endgame mockup, live version

This folder holds the endgame mockup: the four logos, the full-screen reveals, the chip on the chase screen and Hang Hebat's wanted poster. It's drawn with the real app components and sample data. `../index.html` is a copy of the built page.

- `endgame.html` is the built page. It's self-contained, so it opens in a browser as it is. It's the same page as the private artifact.
- `index.html`, `main.tsx`, `vite.config.ts` and `build.mjs` are its source. `keris.mjs` is a one-off script that drew the keris logo into `main.tsx`. The imports expect these files to sit in `app/mockups/endgame/`, so to rebuild:
  1. Copy the source files into `app/mockups/endgame/`.
  2. From `app/`, run `node mockups/endgame/build.mjs`.
  3. Copy the fresh `endgame.html` back here.
  4. Delete `app/mockups/endgame/`, since it isn't part of the app.
- In the source, Hang Hebat's key is still `jebat` (its first name); only the shown text says Hang Hebat.
