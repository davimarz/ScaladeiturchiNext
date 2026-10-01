import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const redirect=(s:string)=>new Response(null,{status:303,headers:{location:"/admin?clear="+s}});
export async function POST(request:NextRequest){if(!isSameOrigin(request))return new Response("Forbidden",{status:403});if(!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value))return redirect("session");const form=await request.formData();if(String(form.get("confirm")??"").trim().toUpperCase()!=="SVUOTA CATALOGO")return redirect("confirm");try{await supabaseAdminFetch("products?id=not.is.null",{method:"DELETE",headers:{Prefer:"return=minimal"}});return redirect("success");}catch{return redirect("error");}}