"use client";

import { useEffect, useRef, useState } from "react";

type Catalog = "offerte-lambo" | "bestseller";

type VerifyResponse = {
  ok: boolean;
  checked?: number;
  verified?: number;
  pending?: number;
  failed?: number;
  remaining?: number;
  error?: string;
};

export default function CatalogVerificationRunner({
  catalog,
}: {
  catalog: Catalog | null;
}) {
  const [running, setRunning] = useState(() => Boolean(catalog));
  const [remaining, setRemaining] = useState<number | null>(null);
  const [processed, setProcessed] = useState(0);
  const [verified, setVerified] = useState(0);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState("");
  const stopped = useRef(false);

  useEffect(() => {
    if (!catalog) return;
    stopped.current = false;

    async function loop() {
      let emptyPasses = 0;
      let passes = 0;

      while (!stopped.current && passes < 120) {
        passes += 1;
        try {
          const response = await fetch("/api/admin/catalog-verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ catalog }),
          });
          const data = await response.json() as VerifyResponse;

          if (!response.ok || !data.ok) {
            setMessage(data.error || "Verifica temporaneamente non disponibile.");
            break;
          }

          setProcessed((value) => value + (data.checked || 0));
          setVerified((value) => value + (data.verified || 0));
          setFailed((value) => value + (data.failed || 0));
          setRemaining(typeof data.remaining === "number" ? data.remaining : null);

          if ((data.remaining || 0) <= 0) {
            setMessage("Verifica completata.");
            break;
          }

          if ((data.checked || 0) === 0) emptyPasses += 1;
          else emptyPasses = 0;

          if (emptyPasses >= 2) {
            setMessage("Nessun altro prodotto elaborabile in questo momento.");
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 450));
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Verifica interrotta.");
          break;
        }
      }

      if (!stopped.current) {
        if (!message && passes >= 120) setMessage("Verifica sospesa dopo 120 lotti; riprenderà al prossimo aggiornamento.");
        setRunning(false);
      }
    }

    void loop();
    return () => {
      stopped.current = true;
    };
  }, [catalog]);

  if (!catalog) return null;

  return (
    <div className="catalogVerifyRunner" aria-live="polite">
      <strong>
        {catalog === "offerte-lambo" ? "Verifica Offerte Lampo" : "Verifica Bestseller"}
      </strong>
      <span>
        {running ? "In corso…" : message || "Terminata"}
        {" · "}elaborati {processed}
        {" · "}verificati {verified}
        {" · "}non riusciti {failed}
        {remaining != null ? " · restanti " + remaining : ""}
      </span>
    </div>
  );
}
