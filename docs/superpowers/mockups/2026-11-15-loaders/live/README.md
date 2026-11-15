# Loaders mockup, live version

This folder holds the mockup of the running-j loaders (option A): the full home logo with Malaysian-flavoured captions on screens with nothing to show yet, a small j in busy buttons, a small j beside long waits, and the optional map loader. It is drawn with the real app components (HomeLogo and its stride) and sample screens. `../index.html` is a copy of the built page.

- `loaders.html` is the built page. It is self-contained (the logo's letters are inlined), so it opens in a browser as it is. It is the same page as the private artifact.
- `index.html`, `main.tsx`, `vite.config.ts` and `build.mjs` are its source. The imports expect these files to sit in `app/mockups/loaders/`, so to rebuild:
  1. Copy the source files into `app/mockups/loaders/`.
  2. From `app/`, run `node mockups/loaders/build.mjs`.
  3. Copy the fresh `loaders.html` back here.
  4. Delete `app/mockups/loaders/`, since it isn't part of the app.
- `main.tsx` still holds the earlier A/B/C comparison components (`JoinScreen`, `LobbyScreen`) unused; the page now shows option A across all 17 places.
