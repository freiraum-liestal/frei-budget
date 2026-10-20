# Oman Travel Budget 🇴🇲

Mobile-first Reisebudget-App für David & Marlen – Oman 2026.

Gemeinsames Konto, gemeinsames Budget: es gibt bewusst **keine** Kostenaufteilung
oder "Wer schuldet wem"-Funktion. Jede Ausgabe gehört automatisch zum
gemeinsamen Reisebudget.

## 1. Lokal starten

Voraussetzung: Node.js 18+ (empfohlen: 20 LTS).

```bash
npm install
npm run dev
```

Die App läuft danach unter `http://localhost:5173`. Auf dem iPhone im gleichen
WLAN erreichst du sie über die im Terminal angezeigte Netzwerk-Adresse
(`http://<deine-lokale-ip>:5173`).

Build-Check (TypeScript + Produktionsbuild):

```bash
npm run build
```

## 2. Deploy auf Netlify

1. Repository auf GitHub pushen (oder Ordner direkt bei Netlify hochladen).
2. Bei Netlify: **New site from Git** → Repository auswählen.
3. Build-Einstellungen:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy starten. Fertig – die App ist danach unter einer `*.netlify.app`-URL
   erreichbar und funktioniert dank PWA-Konfiguration auch offline.

Falls du später Umgebungsvariablen brauchst (siehe Supabase unten), trägst du
sie unter **Site settings → Environment variables** ein – niemals im Code.

## 3. Cloud-Synchronisierung einrichten (David & Marlen gemeinsam nutzen)

Damit ihr beide dieselben Ausgaben seht, braucht ihr ein kostenloses
Supabase-Projekt als Cloud-Backend. Ohne diese Einrichtung läuft die App
weiterhin normal, aber nur lokal auf einem Gerät (bisheriges Verhalten).

**Sicherheitsmodell:** Es gibt bewusst keinen Account-Login. Der Zugriff läuft
über einen 6-stelligen Zugriffscode, den ihr euch einmal teilt. Wer den Code
kennt, kann die Daten lesen und ändern – haltet ihn also wie ein Passwort
geheim (nicht öffentlich posten). Der Code selbst wird nirgends verschlüsselt
übertragen. Für ein privates Reisebudget zu zweit ist das ein akzeptabler
Kompromiss aus Einfachheit und Sicherheit.

### Schritt für Schritt

1. **Supabase-Projekt erstellen**: [supabase.com](https://supabase.com) →
   kostenloses Konto → "New project". Region z.B. Frankfurt (eu-central-1).
2. **Schema einrichten**: Im Supabase-Dashboard unter **SQL Editor** →
   "New query" → den kompletten Inhalt von `supabase/schema.sql` aus diesem
   Projekt einfügen → **Run**.
3. **Realtime prüfen**: Unter **Database → Replication** sicherstellen, dass
   die Tabellen `expenses` und `trips` bei der `supabase_realtime`-Publication
   aktiviert sind (das SQL-Skript versucht das bereits automatisch).
4. **API-Zugangsdaten holen**: Im Dashboard unter **Project Settings → API**:
   - `Project URL` → das ist `VITE_SUPABASE_URL`
   - `anon public` Key → das ist `VITE_SUPABASE_ANON_KEY`

   Wichtig: **nur** den `anon`-Key verwenden, niemals den `service_role`-Key –
   der gehört nie ins Frontend.
5. **Lokal testen**: `.env.example` zu `.env` kopieren, beide Werte eintragen,
   dann `npm run dev` neu starten.
6. **Auf Netlify eintragen**: Bei Netlify unter **Site settings →
   Environment variables** dieselben zwei Variablen eintragen, danach
   **Deploys → Trigger deploy** (die Variablen werden nur beim Build
   eingelesen, ein einfacher Reload reicht nicht).
7. **Trip erstellen**: In der App unter **Einstellungen → Cloud-
   Synchronisierung** → "Neuen gemeinsamen Trip erstellen" (bestehende lokale
   Ausgaben können dabei automatisch übernommen werden). Ihr bekommt einen
   6-stelligen Code angezeigt.
8. **Partnerin verbinden**: Marlen öffnet dieselbe App-URL auf ihrem iPhone,
   geht zu Einstellungen → Cloud-Synchronisierung → gibt den Code bei "Code
   eingeben" ein. Ab jetzt sehen beide Geräte dieselben Ausgaben, live.

### Was das V1 dieser Cloud-Sync-Funktion (bewusst) nicht macht

- Kein Konfliktmanagement, wenn beide gleichzeitig offline dieselbe Ausgabe
  bearbeiten – der letzte Schreibvorgang gewinnt.
- **Offline-first:** Alles wird immer zuerst auf dem Gerät gespeichert –
  auch im Cloud-Modus. Neue, bearbeitete und gelöschte Ausgaben ohne Netz
  erscheinen sofort (⏳-Hinweis) und werden automatisch synchronisiert, sobald
  wieder Internet da ist (beim Zurückkehren in die App, alle 20 s solange etwas
  offen ist, oder über "Jetzt syncen"). Das überlebt auch, wenn iOS die App
  im Hintergrund beendet. Nach dem Sync wird der Stand neu geladen, damit
  Ausgaben der Partnerin, die man offline verpasst hat, sichtbar werden.
- Reisename, Budget und Kurse werden (noch) nicht nachsynchronisiert, wenn sie
  offline geändert werden – das am besten mit Netz erledigen.
- Kein Passwortschutz über den Zugriffscode hinaus (siehe Sicherheitsmodell
  oben).

## 4. Später auf echten Login umsteigen

Der aktuelle Zugriffscode-Ansatz (Abschnitt 3) ist bewusst einfach gehalten.
Falls ihr später doch echten Login pro Person wollt (z.B. weil die App auch
für andere Reisen mit mehr Beteiligten genutzt wird), ist der Umstieg ohne
Datenverlust möglich:

- **Datenmodell ist bereits getrennt.** `Trip` und `Expense`
  (siehe `src/types/index.ts`) sind eigenständige Entitäten mit eigener `id`.
  Jede `Expense` hat zusätzlich ein `ownerId`-Feld (aktuell immer `"shared"`),
  das für eine spätere Zuordnung zu einem echten Supabase-User vorbereitet ist.
- **Geplanter Ablauf:**
  1. Supabase Auth aktivieren (z.B. Magic Link statt Passwort).
  2. Eine `trip_members`-Tabelle ergänzen (`trip_id`, `user_id`).
  3. Die offenen RLS-Policies in `supabase/schema.sql`
     (`using (true)`) ersetzen durch
     `using (auth.uid() in (select user_id from trip_members where trip_id = trips.id))`.
  4. In `src/utils/cloudStore.ts` und `AppContext.tsx` den Zugriffscode-Login
     durch echten Supabase-Auth-Login ersetzen – die restliche App
     (Dashboard, Ausgaben, Statistik) bleibt unverändert, da sie nur mit dem
     `AppContext`-Interface spricht, nicht direkt mit Supabase.

## 5. Umgebungsvariablen

Ohne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` läuft die App automatisch
im reinen Lokal-Modus (siehe Abschnitt 3 oben für die Einrichtung). Der
`anon key` von Supabase ist ausdrücklich zur Nutzung im Frontend vorgesehen –
ein `service_role`-Key gehört dagegen **niemals** ins Frontend.

## 6. Auf dem iPhone installieren

1. Die deployte URL (Netlify) in **Safari** öffnen (wichtig: Safari, nicht
   Chrome – nur Safari unterstützt "Zum Home-Bildschirm" für PWAs).
2. Auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).
3. **"Zum Home-Bildschirm"** wählen.
4. Name bestätigen ("Oman Budget") → **Hinzufügen**.

Die App öffnet sich danach im Vollbildmodus ohne Safari-Oberfläche und
funktioniert auch offline weiter, da neue Ausgaben lokal gespeichert werden.

## Projektstruktur

```
src/
  types/            Datenmodell (Trip, Expense, Settings)
  context/           React Context: AppContext (Daten), UIContext (Modals)
  utils/              Berechnungen, Währung, Storage, Export/Import
  components/         Wiederverwendbare UI-Bausteine
  pages/              Dashboard, Ausgaben, Statistik, Einstellungen
```

## Bekannte Grenzen der V1 (bewusst)

- Wechselkurse werden manuell in den Einstellungen gepflegt (kein Live-API-Call).
- Kein Login, keine Synchronisierung zwischen Geräten (siehe Supabase-Plan oben).
- Eigene Kategorien, Beleg-Fotos, mehrere Reisen: bewusst nicht in V1, aber
  durch das Datenmodell bereits vorbereitet.
