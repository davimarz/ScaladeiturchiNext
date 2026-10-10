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
  const statusLabels: Record<string, string> = {
    running: "Avvio registrato; completamento non confermato",
    partial: "Completato con dati da verificare",
    success: "Completato",
    error: "Aggiornamento non riuscito",
  };
  const [saving, setSaving] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (saving) { event.preventDefault(); return; }
    setSaving(true);
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
        <span>Stato: {statusLabels[lastStatus] || lastStatus || "Non registrato"}</span>
        {lastMessage ? <span>{lastMessage}</span> : null}
      </div>
    </form>
  );
}
