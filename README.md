# Betriebsferien UH

Clean Service Scaramuzzo AG · Unterhaltsreinigung. Anfrage an alle Kunden zu Betriebsferien über Weihnachten und Neujahr, Rückmeldung über einen persönlichen Link, Eingang zum Abhaken.

- `index.html`, `admin.js`: Admin (Übersicht, Eingang, Kunden, Import, Versand, Einstellungen)
- `r.html`: Kundenformular (`/r/<token>`)
- `api/`: Vercel-Funktionen (Supabase-RPC, Resend). Absender: noreply@clean-service.ch

Umgebungsvariablen (Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BF_DB_SECRET`, `RESEND_API_KEY`, `ADMIN_PASSWORD`, `BASE_URL`, optional `CC_RESPONSES`.
Kundendaten liegen nur in Supabase, nie im Repo.
