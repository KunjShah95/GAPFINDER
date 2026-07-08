# LLM Cache Production Readiness Fixes

## Files to modify
- `server/src/lib/llm-cache.ts` (main implementation)
- `server/src/lib/llm-cache.test.ts` (tests)

## Changes

### 1. Fix text normalization (line 58-64)
**What:** Change regex from `/[^\w\s]/g` to `/[^\w\s\+\#\.]/g` to preserve `+`, `#`, `.` inside words.
**Why:** "C++" currently becomes "c", "Node.js" becomes "nodejs", "#python" becomes "python".
**Where:** `normalizeText()` function, line 61.

### 2. Fix semantic matching — HASH-based n-gram index
**What:** Replace SCAN + individual GETs with a single Redis HASH per provider+model.
**How:**
- New key pattern: `llm:cache:ngrams:{provider}:{model}`
- Each field in the HASH is an n-gram (bigram) string
- Each field value is a JSON array of cache key hashes containing that n-gram
- On store: compute bigrams of normalized text, `HSET` each bigram → append cache key hash to the array
- On lookup: compute query bigrams, `HEXISTS` for each → collect candidates → rank by overlap count vs threshold
- On delete: look up the entry's bigrams, `HDEL` each and remove the cache key hash from the array
**Where:** Replace `buildIndexKey()`, rewrite `findSemanticMatch()`, update store logic in `createCachedCallAI`.

### 3. Fix TTL consistency
**What:** Index entries get `ttl + 60s` buffer so they outlive the cache entry they reference.
**How:** Pass `ttl + 60` when storing n-gram index entries. When deleting a cache entry, also `HDEL` its n-gram fields.
**Where:** Store logic in `createCachedCallAI`, new `removeFromIndex()` helper.

### 4. Fix error tracking
**What:** Add `stats.errors++` in every catch block that currently swallows errors silently.
**Where:** `getFromCache()` (line 113), `setInCache()` (line 122), `findSemanticMatch()` (line 169), `invalidateCache()` (line 321).

### 5. Add LRU eviction
**What:** Maintain a Redis sorted set `llm:cache:lru` scored by timestamp.
**How:**
- On each `getFromCache` hit and `setInCache` call: `ZADD` the key with current timestamp
- Before each `setInCache`: `ZCARD` → if > 10000, `ZRANGE ... 0 <overflow-count-1>` → `DEL` those keys + `ZREM` from sorted set
**Where:** New helpers `touchLRU()`, `evictIfNeeded()`. Called from `getFromCache` (on hit) and `setInCache`.

### 6. Update tests
**What:** Add tests for:
- Normalization preserving `+`, `#`, `.` (e.g., "C++" matches "C++", "#python" matches "#python")
- Error stats incrementing on Redis failures
- (Existing tests continue to pass)
**Where:** `llm-cache.test.ts`

## Verification
1. `npx vitest run server/src/lib/llm-cache.test.ts` — all tests pass
2. TypeScript compiles: `npx tsc --noEmit` from server/
