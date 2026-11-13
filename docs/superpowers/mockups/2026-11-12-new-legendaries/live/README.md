# New legendaries mockup (Plan E2), live version

This folder holds the mockup of Super Ring and Mak Kau Hijau, drawn by the real app components with sample data. It also keeps the earlier tap-screen and Safe-screen options for reference. (The static `../index.html` is the first mockup, made before building.)

- `new-legendaries.html` is the built page. It's self-contained, so you can open it in a browser as it is. It's the same page as the private artifact.
- `index.html`, `main.tsx`, `vite.config.ts` and `build.mjs` are its source. The imports expect these files to sit in `app/mockups/e2/`, so to rebuild:
  1. Copy the four source files into `app/mockups/e2/`.
  2. From `app/`, run `node mockups/e2/build.mjs`.
  3. Copy the fresh `new-legendaries.html` back here.
  4. Delete `app/mockups/e2/`, since it isn't part of the app.
- The maps need internet tiles, which the published page can't load, so their backgrounds may show blank.
