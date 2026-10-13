import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isUuid, MANUAL_SOURCE_FILTER } from "../src/lib/product-validation.ts";
function loadRoute(path, stubs) {
  const source = ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url),"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  vm.runInNewContext(source, {exports, Response, URL, console, Date, process:{env:{}}, require(name) {
    if (name.includes("admin-auth")) return {adminCookie:{name:"sdt_admin"},verifyAdminSessionValue:()=>true,...stubs.auth};
    if (name.includes("admin-request")) return {isSameOrigin:()=>stubs.origin !== false};
    if (name.includes("product-validation")) return {isUuid, MANUAL_SOURCE_FILTER};
    if (name.includes("supabase/admin")) return {supabaseAdminFetch:stubs.fetch};
    if (name.includes("admin-login-limit")) return {consumeLoginAttempt:stubs.limit};
    if (name === "next/server") return {NextResponse:{redirect(url,status){return new Response(null,{status,headers:{location:String(url)}});}}};
    throw new Error("Unexpected import " + name);
  }});
  return exports;
}
function request(form={}) {return {url:"https://site.test/api/admin/login",cookies:{get:()=>({value:"session"})},formData:async()=>new Map(Object.entries(form))};}
test("single product deletion removes the database row",async()=>{
  let called;
  const route=loadRoute("src/app/api/admin/products/delete/route.ts",{fetch:async(path,init)=>{called={path,init};return [{id:"ok"}];}});
  const response=await route.POST(request({id:"98e06f33-d699-4fae-9e7a-afbce8585000"}));
  assert.match(called.path,/products\?id=eq\.98e06f33-d699-4fae-9e7a-afbce8585000/);
  assert.equal(called.init.method,"DELETE");
  assert.equal(response.headers.get("location"),"/admin?delete=success");
});
test("nonexistent products do not claim deletion succeeded",async()=>{
  const route=loadRoute("src/app/api/admin/products/delete/route.ts",{fetch:async()=>[]});
  assert.equal((await route.POST(request({id:"98e06f33-d699-4fae-9e7a-afbce8585000"}))).headers.get("location"),"/admin?delete=invalid");
});
test("foreign origin and missing sessions cannot mutate products",async()=>{
  for(const stubs of [{origin:false},{auth:{verifyAdminSessionValue:()=>false}}]) {
    const route=loadRoute("src/app/api/admin/products/delete/route.ts",{...stubs,fetch:()=>assert.fail("must not write")});
    const response=await route.POST(request({id:"98e06f33-d699-4fae-9e7a-afbce8585000"}));
    assert.ok(response.status === 403 || response.headers.get("location") === "/admin?delete=session");
  }
});
test("invalid category cannot update a product",async()=>{
  let calls=0;
  const route=loadRoute("src/app/api/admin/products/update/route.ts",{fetch:async()=>{calls++;return [];}});
  const response=await route.POST(request({id:"98e06f33-d699-4fae-9e7a-afbce8585000",title:"Product",category_id:"98e06f33-d699-4fae-9e7a-afbce8585000"}));
  assert.equal(calls,1);assert.equal(response.headers.get("location"),"/admin?manual=invalid");
});
test("login fails closed when the shared limiter fails",async()=>{
  const route=loadRoute("src/app/api/admin/login/route.ts",{limit:async()=>{throw new Error("down");},auth:{adminPasswordMatches:()=>assert.fail("must not authenticate")}});
  const response=await route.POST(request({password:"anything"}));
  assert.equal(response.status,303);assert.match(response.headers.get("location"),/error=unavailable$/);
});
test("blocked attempts never check the password",async()=>{
  const route=loadRoute("src/app/api/admin/login/route.ts",{limit:async()=>false,auth:{adminPasswordMatches:()=>assert.fail("must not authenticate")}});
  assert.match((await route.POST(request({password:"anything"}))).headers.get("location"),/error=rate-limit$/);
});

test("bulk deletion deletes only valid selected product ids",async()=>{
  let called;
  const route=loadRoute("src/app/api/admin/products/bulk-delete/route.ts",{fetch:async(path,init)=>{called={path,init};}});
  const formData={getAll:()=>["98e06f33-d699-4fae-9e7a-afbce8585000","invalid"]};
  const response=await route.POST({cookies:{get:()=>({value:"session"})},formData:async()=>formData});
  assert.match(called.path,/products\?id=in\.\(98e06f33-d699-4fae-9e7a-afbce8585000\)/);
  assert.equal(called.init.method,"DELETE");
  assert.equal(response.headers.get("location"),"/admin?bulk=success");
});

test("catalog clear requires the explicit confirmation phrase",async()=>{
  let calls=0;
  const route=loadRoute("src/app/api/admin/products/clear/route.ts",{fetch:async()=>{calls++;}});
  const rejected=await route.POST(request({confirm:"NO"}));
  assert.equal(calls,0);
  assert.equal(rejected.headers.get("location"),"/admin?clear=confirm");
  const accepted=await route.POST(request({confirm:"SVUOTA MANUALI"}));
  assert.equal(calls,1);
  assert.equal(accepted.headers.get("location"),"/admin?clear=success");
});
