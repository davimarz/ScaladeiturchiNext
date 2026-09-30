import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/admin-auth.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports, Buffer, Date, process:{env:{ADMIN_SESSION_SECRET:"test-secret-never-used-in-production",ADMIN_PASSWORD:"test-password"}},
  require(name){ if(name==="server-only")return {}; if(name==="node:crypto")return crypto; throw new Error(name); }
});
test("signed admin session is accepted and altered or extended sessions are rejected",()=>{
  const value=exports.createAdminSessionValue();
  assert.equal(exports.verifyAdminSessionValue(value),true);
  assert.equal(exports.verifyAdminSessionValue(value+".extra"),false);
  assert.equal(exports.verifyAdminSessionValue(value.replace(/.$/,"z")),false);
  assert.equal(exports.verifyAdminSessionValue("1234567890."+crypto.createHmac("sha256","test-secret-never-used-in-production").update("1234567890").digest("hex")),false);
  assert.equal(exports.verifyAdminSessionValue(),false);
});
test("admin password comparisons reject incorrect lengths and contents",()=>{
  assert.equal(exports.adminPasswordMatches("test-password"),true);
  assert.equal(exports.adminPasswordMatches("wrong"),false);
  assert.equal(exports.adminPasswordMatches("test-passwore"),false);
});
