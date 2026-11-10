# ADMD KI-Team HQ (live)

- `hq.html`: das HQ, unverändert.
- `index.html`: öffnet `hq.html` im Live-Modus mit dem Supabase-Feed.
- Feed: `https://aymwwomlvjtcikqzdeqz.supabase.co/rest/v1/rpc/hq_feed` (nur lesen).
- Einträge schreibt STARK in die Supabase-Tabelle `public.hq_auftraege`.
