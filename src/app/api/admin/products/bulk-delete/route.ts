import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isUuid } from "../../../../../lib/product-validation";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const redirect=(s:string)=>new Response(null,{status:303,headers:{location:"/admin?bulk="+s}});
export async function POST(request:NextRequest){if(!isSameOrigin(request))return new Response("Forbidden",{status:403});if(!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value))return redirect("session");const form=await request.formData();const ids=form.getAll("ids").map(String).filter(isUuid);if(!ids.length)return redirect("invalid");try{await supabaseAdminFetch(`products?id=in.(${ids.join(",")})`,{method:"DELETE",headers:{Prefer:"return=minimal"}});return redirect("success");}catch{return redirect("error");}}