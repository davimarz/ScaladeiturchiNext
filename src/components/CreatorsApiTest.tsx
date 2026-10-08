"use client";

import { useState } from "react";

type TestResult = {
  ok: boolean;
  stage: string;
  status: number;
  code?: string | null;
  type?: string | null;
  reason?: string | null;
  providerStatus?: string | null;
  message: string;
  items?: number;
  partnerTag?: string;
  marketplace?: string;
  hasClientId?: boolean;
  hasClientSecret?: boolean;
};

export default function CreatorsApiTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/creators-test", { method: "POST" });
      const data = await response.json() as TestResult;
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        stage: "network",
        status: 0,
        message: error instanceof Error ? error.message : "Test non disponibile.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="creatorsTest">
      <div className="creatorsTestHead">
        <div>
          <strong>Amazon Creators API</strong>
          <small>Verifica token e SearchItems senza mostrare le credenziali.</small>
        </div>
        <button type="button" onClick={runTest} disabled={loading}>
          {loading ? "Verifica in corso…" : "Test Creators API"}
        </button>
      </div>
      {result ? (
        <div className={result.ok ? "creatorsResult ok" : "creatorsResult error"}>
          <strong>{result.ok ? "Operativa" : "Non operativa"}</strong>
          <span>Fase: {result.stage} · HTTP: {result.status || "—"}{result.code ? " · Code: " + result.code : ""}</span>
          {result.type ? <span>Type: {result.type}</span> : null}
          {result.reason ? <span>Reason: {result.reason}</span> : null}
          {result.providerStatus ? <span>Status Amazon: {result.providerStatus}</span> : null}
          <p>{result.message}</p>
          {typeof result.items === "number" ? <span>Prodotti restituiti nel test: {result.items}</span> : null}
          {result.partnerTag ? <span>Partner tag: {result.partnerTag} · Marketplace: {result.marketplace}</span> : null}
          {result.stage === "configuration" ? (
            <span>Client ID presente: {result.hasClientId ? "sì" : "no"} · Secret presente: {result.hasClientSecret ? "sì" : "no"}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
