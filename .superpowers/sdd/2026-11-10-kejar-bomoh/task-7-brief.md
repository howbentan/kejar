### Task 7: Map rendering — purple reveal ring and Bomoh's hint zone

**Files:**
- Modify: `app/src/game/Map.tsx`:
  - Find and mirror `legendaryYellow()` as `legendaryPurple()`, reading `--bomoh-1/2/3` instead of `--legendary-1/2/3`
  - Add a `bomoh-legendary`/`bomoh-legendary-fill`/`bomoh-legendary-line` source+layers (mirror lines 270-272), and a `bomoh-legendary-marker` HTML marker (mirror lines 470-479)
  - Add a `bomoh-reveal-ring` layer (mirror lines 380-391) filtered on `['==', ['get', 'revealedBy'], 'bomoh']`, coloured with `legendaryPurple()` instead of `VOLT`
  - `GameMap`'s props: add `bomohZone: LegendaryZone | null` alongside the existing `legendaryZone` prop
- Modify: `app/src/game/ChaseLayout.tsx:88`: pass `bomohZone={view.bomohZone}` alongside `legendaryZone={view.legendaryZone}`
- Test: `app/src/game/Map.test.tsx`

**Interfaces:**
- Consumes: `View.bomohZone` (Task 6), `MapDot.revealedBy` including `'bomoh'` (Task 6).

- [ ] **Step 1: Write the failing tests**

Mirror the existing `legendaryZone`/`reveal-ring` tests in `Map.test.tsx`: rendering with a `bomohZone` prop adds the `bomoh-legendary` source/layers at the given coordinates, distinct from a simultaneously-rendered `legendaryZone`; a dot with `revealedBy: 'bomoh'` in the `points`/`dots` data appears in the `bomoh-reveal-ring` layer's filtered data, and a `revealedBy: 'focus'` dot does not.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Map.test`
Expected: FAIL

- [ ] **Step 3: Implement the purple color helper, sources, layers, and marker**

Mirror the Dato zone/marker code exactly, substituting the purple palette and the `bomoh` prefix throughout. Keep the same `?` marker glyph (the colour and position already distinguish it from Dato's zone; no need for a second glyph).

- [ ] **Step 4: Add the `bomoh-reveal-ring` layer and the `bomohZone` prop + effect**

Mirror `reveal-ring`'s layer definition and the `zoneKey`/`useEffect` pair that keeps the zone source and marker in sync with the prop (lines 463-479).

- [ ] **Step 5: Wire `bomohZone` through `ChaseLayout.tsx`**

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- Map.test`
Expected: PASS

- [ ] **Step 7: Manually verify in the dev server**

Start the `kejar-dev` preview, join a Full-mode game as organiser with a `bomoh_stash` seeded via the test harness (or temporarily via direct DB edit), confirm the purple hint zone and marker render distinctly from a simultaneous Dato zone, and that a manually-flagged `revealedBy: 'bomoh'` dot shows the purple ring. Compare against `docs/superpowers/mockups/2026-10-31-chaser-legendary/3-bomoh-reveal-effect.html` for the intended look.

- [ ] **Step 8: Commit**

```bash
git add app/src/game/Map.tsx app/src/game/Map.test.tsx app/src/game/ChaseLayout.tsx
git commit -m "feat: render Bomoh's purple reveal ring and hint zone on the map"
```

---

