"use client";

import { FormEvent, useState } from "react";

export default function CatalogAutoSchedule({
  enabled,
  time,
  lastRun,
  lastStatus,
  lastMessage,
}: {
  enabled: boolean;
  time: string;
  lastRun: string;
  lastStatus: string;
  lastMessage: string;
}) {
  const [saving, setSaving] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    setSaving(true);
    const form = event.currentTarget;
    requestAnimationFrame(() => form.submit());
  }

  return (
    <form action="/api/admin/catalog-schedule" method="post" className="autoScheduleCard" onSubmit={submit}>
      <div className="autoScheduleHead">
        <div>
          <strong>Aggiornamento automatico giornaliero</strong>
          <small>Avvia HAUL, Offerte Lampo e Bestseller all&apos;ora italiana scelta.</small>
        </div>
        <label className="autoScheduleToggle">
          <input type="checkbox" name="enabled" defaultChecked={enabled} />
          <span>Attivo</span>
        </label>
      </div>
      <div className="autoScheduleControls">
        <label>
          Ora
          <input type="time" name="time" defaultValue={time} required />
        </label>
        <button type="submit" disabled={saving}>{saving ? "Salvataggio…" : "Salva orario"}</button>
      </div>
      <div className="autoScheduleStatus">
        <span>Fuso orario: Europe/Rome</span>
        <span>Ultimo avvio: {lastRun || "Mai"}</span>
        <span>Stato: {lastStatus || "—"}</span>
        {lastMessage ? <span>{lastMessage}</span> : null}
      </div>
    </form>
  );
}
