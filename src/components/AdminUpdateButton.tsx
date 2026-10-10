"use client";

import { useEffect, useRef, useState } from "react";

export default function AdminUpdateButton({ idleLabel }: { idleLabel: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const form = ref.current?.form;
    let submitted = false;
    const submit = (event: Event) => {
      if (submitted) { event.preventDefault(); return; }
      submitted = true;
      setPending(true);
    };
    const reset = () => { submitted = false; setPending(false); };
    form?.addEventListener("submit", submit);
    window.addEventListener("pageshow", reset);
    return () => { form?.removeEventListener("submit", submit); window.removeEventListener("pageshow", reset); };
  }, []);

  return (
    <button ref={ref} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Aggiornamento in corso…" : idleLabel}
    </button>
  );
}
