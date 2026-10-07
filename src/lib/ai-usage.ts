import "server-only";
import { supabaseAdminFetch } from "./supabase/admin";
import { currentUsageDay, DAILY_REQUEST_LIMIT, DAILY_TOKEN_LIMIT, RESERVED_TOKENS_PER_REQUEST } from "./ai-limits";

type ReservationRow = {
  allowed: boolean;
  requests_count: number;
  total_tokens: number;
  reserved_tokens: number;
  exhausted_at: string | null;
};

export async function reserveAIUsage() {
  const usageDay = currentUsageDay();
  const rows = await supabaseAdminFetch<ReservationRow[]>("rpc/ai_try_reserve_daily_usage", {
    method: "POST",
    body: JSON.stringify({
      p_usage_day: usageDay,
      p_request_limit: DAILY_REQUEST_LIMIT,
      p_token_limit: DAILY_TOKEN_LIMIT,
      p_reserved_tokens: RESERVED_TOKENS_PER_REQUEST,
    }),
  });
  return { usageDay, ...(rows[0] || { allowed: false, requests_count: 0, total_tokens: 0, reserved_tokens: 0, exhausted_at: null }) };
}

export async function finalizeAIUsage(usageDay: string, inputTokens: number, outputTokens: number, totalTokens: number) {
  await supabaseAdminFetch<void>("rpc/ai_finalize_daily_usage", {
    method: "POST",
    body: JSON.stringify({
      p_usage_day: usageDay,
      p_reserved_tokens: RESERVED_TOKENS_PER_REQUEST,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_total_tokens: totalTokens,
    }),
  });
}

export async function releaseAIUsage(usageDay: string) {
  await supabaseAdminFetch<void>("rpc/ai_release_daily_reservation", {
    method: "POST",
    body: JSON.stringify({
      p_usage_day: usageDay,
      p_reserved_tokens: RESERVED_TOKENS_PER_REQUEST,
    }),
  });
}

export async function recordAIQuery(data: {
  usageDay: string;
  query: string;
  status: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  productsCount?: number;
  productAsins?: string[];
  productTitles?: string[];
  productSources?: string[];
  errorMessage?: string | null;
}) {
  await supabaseAdminFetch<void>("ai_search_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      usage_day: data.usageDay,
      query: data.query.slice(0, 500),
      provider: "gemini",
      model: data.model || null,
      status: data.status,
      input_tokens: data.inputTokens || 0,
      output_tokens: data.outputTokens || 0,
      total_tokens: data.totalTokens || 0,
      products_count: data.productsCount || 0,
      product_asins: data.productAsins || [],
      product_titles: data.productTitles || [],
      product_sources: data.productSources || [],
      error_message: data.errorMessage ? data.errorMessage.slice(0, 500) : null,
    }),
  });
}

export async function markAIExhausted(usageDay: string) {
  const now = new Date().toISOString();
  await supabaseAdminFetch<void>("ai_daily_usage?usage_day=eq." + encodeURIComponent(usageDay), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ exhausted_at: now, updated_at: now }),
  });
}
