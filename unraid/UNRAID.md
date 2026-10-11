# Pascal Haus-Planer auf Unraid betreiben

Diese Anleitung gehört zu diesem Fork. Das Image wird von GitHub gebaut (der Build
braucht mehrere GB RAM) und von Unraid nur noch heruntergeladen und gestartet.

## 1. Image bauen lassen (einmalig, danach automatisch)

1. Im Fork auf GitHub: **Actions** öffnen und die Workflows aktivieren
   („I understand my workflows, go ahead and enable them“). Forks starten damit deaktiviert.
2. Optional, empfohlen: Die Upstream-Workflows **CI**, **MCP CI** und **MCP Registry**
   deaktivieren (Actions → Workflow wählen → „…“ → *Disable workflow*). Sie werden für
   den Betrieb nicht gebraucht und sind teils aufwendig (u. a. macOS-Jobs).
3. **Actions → Docker image → Run workflow** starten. Der erste Lauf dauert etwa
   15–30 Minuten, spätere sind durch den Cache schneller. Danach baut jeder Push auf
   `main` automatisch ein neues Image.
4. Das fertige Paket ist zunächst **privat**. Entweder öffentlich schalten
   (Profil → *Packages* → `editor` → *Package settings* → *Change visibility* → Public)
   oder in Unraid mit einem Personal Access Token (`read:packages`) bei `ghcr.io`
   anmelden. Öffentlich ist einfacher; im Image steckt kein Geheimnis, die Projekte
   liegen nur auf deinem Server.

## 2. Container in Unraid anlegen

**Variante A: Vorlage (empfohlen)**

1. Die Datei `unraid/pascal-houseplan.xml` auf den Server nach
   `/boot/config/plugins/dockerMan/templates-user/` kopieren.
2. Unraid → **Docker → Add Container** → bei *Template* `pascal-houseplan` wählen.
3. Den Datenpfad prüfen (Standard `/mnt/user/appdata/pascal-houseplan`) und **Apply**.

**Variante B: Docker Compose Manager**

`unraid/docker-compose.yml` als neuen Stack einfügen und starten.

Danach erreichst du den Planer unter `http://<UNRAID-IP>:3000/scenes`.

## 2b. KI-Assistent anbinden (MCP, optional)

Über MCP kann ein Assistent wie Claude die Projekte lesen und bearbeiten (Wände, Räume,
Möbel, Maße, Kollisionsprüfung). Dafür läuft ein **zweiter Container aus demselben Image**,
der statt des Editors den MCP-Server startet und **denselben Datenordner** nutzt. Änderungen
des Assistenten erscheinen live im geöffneten Editor-Tab.

1. Token erzeugen, z. B. im Unraid-Terminal: `openssl rand -hex 32`
2. Vorlage `unraid/pascal-houseplan-mcp.xml` ebenfalls nach
   `/boot/config/plugins/dockerMan/templates-user/` kopieren, **Add Container** →
   Template `pascal-houseplan-mcp`, das Token eintragen, den Datenpfad **identisch** zum
   Editor-Container lassen, **Apply**. (Compose: zweiten Dienst aus `docker-compose.yml`
   verwenden und `PASCAL_MCP_HTTP_TOKEN` setzen.)
3. Prüfen: `http://<UNRAID-IP>:8787/health` im Browser. Erwartet `401 unauthorized`
   (der Server läuft und verlangt das Token).
4. In Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`) eintragen. Benötigt
   Node.js auf dem PC (für `npx`):

```json
{
  "mcpServers": {
    "pascal": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://<UNRAID-IP>:8787/mcp",
        "--allow-http",
        "--header",
        "Authorization:${PASCAL_AUTH}"
      ],
      "env": { "PASCAL_AUTH": "Bearer <DEIN-TOKEN>" }
    }
  }
}
```

5. Claude Desktop neu starten. Arbeitsweise: Szene im Editor anlegen und speichern, dem
   Assistenten sagen, welche Szene er laden soll (`load_scene`), dann bearbeiten lassen.
   Bearbeitet ihr dieselbe Szene gleichzeitig, meldet der Server einen
   `live_sync_version_conflict`, und der Assistent lädt die Szene neu.

Das Token ist echte Zugriffskontrolle, anders als beim Editor ohne Anmeldung. Gib es nicht
weiter und setze den Port nicht ins offene Internet.

## 3. Zugriff absichern (wichtig)

Die Anwendung hat **keine eingebaute Anmeldung**. Mit `PASCAL_SCENE_API_OPEN_ACCESS=true`
darf jeder, der den Port erreicht, Projekte lesen, ändern und löschen. Das ist im
Heimnetz in Ordnung, aber nicht fürs offene Internet.

Für Zugriff von außen:

- **VPN (am einfachsten):** Tailscale oder WireGuard. Deine Schwester verbindet sich
  und nutzt dieselbe Adresse wie im Heimnetz.
- **Reverse Proxy mit Login:** z. B. Nginx Proxy Manager oder Traefik mit Authelia,
  Authentik oder Cloudflare Access. Dann zusätzlich `PASCAL_SCENE_API_ORIGINS` auf die
  HTTPS-Adresse setzen (z. B. `https://planer.example.org`), sonst lehnt der Server
  Speichern per Origin-Prüfung ab.

## 4. Daten und Sicherung

Alle Projekte liegen in einer Datei: `/mnt/user/appdata/pascal-houseplan/pascal.db`.
Diese Datei (inklusive eventueller `-wal`/`-shm`-Dateien) in die Appdata-Sicherung
aufnehmen. Der Container läuft als Benutzer `99:100` (`nobody:users`), passend zu
Unraids Standardrechten für Appdata.

## 5. Aktualisieren

Neuer Push auf `main` → Image wird neu gebaut → in Unraid auf dem Docker-Tab
**Check for Updates** bzw. **Update** beim Container (Compose: *Pull* und *Up*).

## Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `PASCAL_DATA_DIR` | Ordner für `pascal.db` (im Image `/data`) |
| `PASCAL_SCENE_API_OPEN_ACCESS` | `true`: Speicher-API ohne Token für Clients im Netz (Standard im Image: aus) |
| `PASCAL_SCENE_API_TOKEN` | Alternative mit Token. Der Browser-Client sendet keins, daher nur für Skripte/MCP sinnvoll |
| `PASCAL_SCENE_API_ORIGINS` | Zusätzlich erlaubte Browser-Adressen, kommagetrennt |
| `PASCAL_MODE` | `editor` (Standard) oder `mcp`: welche Rolle der Container übernimmt |
| `PASCAL_MCP_HTTP_TOKEN` | Pflicht bei `PASCAL_MODE=mcp`: Bearer-Token für den MCP-Server |
| `PASCAL_INTERNAL_URL` | Adresse, unter der sich der Server intern selbst erreicht (Standard `http://127.0.0.1:3000`) |

## Fehlersuche

- **Speichern schlägt mit 503 fehl:** `PASCAL_SCENE_API_OPEN_ACCESS` ist nicht `true`.
- **Speichern schlägt mit 403 (`origin_not_allowed`) fehl:** Zugriff über eine
  HTTPS-Adresse, die nicht in `PASCAL_SCENE_API_ORIGINS` steht.
- **Container startet, aber nichts wird gespeichert:** Rechte des Appdata-Ordners.
  Einmalig `chown -R 99:100 /mnt/user/appdata/pascal-houseplan` auf dem Server.
- **Logs:** Unraid → Docker → Container-Symbol → *Logs*.
