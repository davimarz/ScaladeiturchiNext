import test from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../src/lib/admin-request.ts";
const request=(origin,host="127.0.0.1:3100",site="same-origin")=>({nextUrl:new URL("http://localhost:3100/admin"),headers:new Headers({origin,host,"sec-fetch-site":site})});
test("accepts browser Host when Next.js uses an internal hostname",()=>{
  assert.equal(isSameOrigin(request("http://127.0.0.1:3100")),true);
});
test("rejects cross-site origins, absent origins and protocol mismatches",()=>{
  assert.equal(isSameOrigin(request("https://evil.test")),false);
  assert.equal(isSameOrigin(request("http://127.0.0.1:3100","127.0.0.1:3100","cross-site")),false);
  assert.equal(isSameOrigin(request("https://127.0.0.1:3100")),false);
  assert.equal(isSameOrigin({nextUrl:new URL("https://site.test"),headers:new Headers()}),false);
});
