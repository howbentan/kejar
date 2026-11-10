### Task 2: QR helpers for Bomoh

**Files:**
- Modify: `app/shared/ids.ts` (add next to `datoQr`/`isDatoQr`/`datoCodeFromQr`)
- Test: `app/shared/ids.test.ts`

**Interfaces:**
- Produces: `bomohQr(code: string): string` (returns `` `KEJAR:BOMOH:${code}` ``), `isBomohQr(text: string): boolean` (regex `/^KEJAR:BOMOH(:|$)/`), `bomohCodeFromQr(text: string): string | null` (regex `/^KEJAR:BOMOH:([A-Za-z0-9_-]{1,64})$/`).

- [ ] **Step 1: Write the failing tests**

Mirror the existing `datoQr`/`isDatoQr`/`datoCodeFromQr` test cases in `ids.test.ts` (round-trip, rejects a Dato QR as not-Bomoh and vice versa, rejects malformed codes) for the three new functions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ids.test`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement `bomohQr`, `isBomohQr`, `bomohCodeFromQr` in `app/shared/ids.ts`**

Copy `datoQr`/`isDatoQr`/`datoCodeFromQr`'s bodies verbatim with `DATO` → `BOMOH`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ids.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/ids.ts app/shared/ids.test.ts
git commit -m "feat: add bomohQr/isBomohQr/bomohCodeFromQr"
```

---

