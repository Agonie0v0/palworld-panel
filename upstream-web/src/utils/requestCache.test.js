import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCached,
  requestCached,
  readCached,
} from "./requestCache.js";

test("requestCached reuses fresh values and de-duplicates concurrent calls", async () => {
  clearCached();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { value: calls };
  };

  const [first, second] = await Promise.all([
    requestCached("cache-test", fetcher),
    requestCached("cache-test", fetcher),
  ]);
  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(second, { value: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(await requestCached("cache-test", fetcher), { value: 1 });
  assert.deepEqual(readCached("cache-test"), { value: 1 });
  assert.equal(calls, 1);
  clearCached();
});

test("requestCached supports forced refreshes", async () => {
  clearCached();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return calls;
  };

  assert.equal(await requestCached("force-test", fetcher), 1);
  assert.equal(await requestCached("force-test", fetcher, { force: true }), 2);
  assert.equal(calls, 2);
  clearCached();
});
