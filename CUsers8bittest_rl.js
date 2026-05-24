class RateLimiter {
  constructor(limit, windowMs) {
    if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('limit must be a positive integer');
    if (!Number.isInteger(windowMs) || windowMs <= 0) throw new RangeError('windowMs must be a positive integer');
    this.limit = limit; this.windowMs = windowMs; this.hits = new Map();
  }
  checkLimit(key) {
    try {
      const now = Date.now();
      if (!Number.isFinite(now)) return false;
      const k = String(key);
      const fresh = (this.hits.get(k) || []).filter(t => Number.isFinite(t) && now - t < this.windowMs);
      if (fresh.length >= this.limit) { this.hits.set(k, fresh); return false; }
      fresh.push(now);
      this.hits.set(k, fresh);
      return true;
    } catch { return false; }
  }
}

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + msg); } }

// 1. Basic limiting
const rl = new RateLimiter(3, 1000);
assert(rl.checkLimit('a') === true, "1st allowed");
assert(rl.checkLimit('a') === true, "2nd allowed");
assert(rl.checkLimit('a') === true, "3rd allowed");
assert(rl.checkLimit('a') === false, "4th denied");

// 2. Per-key isolation
assert(rl.checkLimit('b') === true, "different key allowed");

// 3. Constructor validation
for (const bad of [[0,1000],[-1,1000],[1.5,1000],[NaN,1000],['x',1000],[1,0],[1,-5],[1,2.5],[1,NaN]]) {
  let threw = false;
  try { new RateLimiter(bad[0], bad[1]); } catch(e) { threw = e instanceof RangeError; }
  assert(threw, "ctor rejects " + JSON.stringify(bad));
}

// 4. Hostile keys don't throw
for (const k of [null, undefined, {}, [], 123, Symbol ? undefined : 0, function(){}]) {
  let ok = true;
  try { rl.checkLimit(k); } catch(e) { ok = false; }
  assert(ok, "hostile key tolerated: " + String(k));
}

// 5. Key collision via String() coercion
const rl2 = new RateLimiter(1, 100000);
assert(rl2.checkLimit({}) === true, "obj1 first");
assert(rl2.checkLimit({foo:1}) === false, "obj2 collides with obj1 ([object Object])");

console.log(`\nPASS=${pass} FAIL=${fail}`);
