# PID AR

Neoficiální mobilní PWA, která nad obraz zadní kamery promítá směrové markery fyzických zastávek Pražské integrované dopravy. Frontend je čisté HTML/CSS/ES modules a lze jej beze sestavení publikovat jako statický GitHub Pages web. Neobsahuje analytiku, účty ani API klíče.

## Architektura

```text
PID GTFS Static ── denní GitHub Action ──> optimalizované JSON na Pages
                                                │
telefon: Service Worker (app shell) + IndexedDB (atomický dataset)
                                                │
kamera + GPS ── grid index ── bearing/kompas ── HTML AR overlay
                                                │
odjezdová tabule ──> Cloudflare Worker ──> Golemio API
```

* `index.html`, `styles.css`, `js/` – mobilní UI, senzory, projekce a storage. Desktop se rozhoduje kombinací user-agentu, coarse pointeru, hover capability a viewportu; `?debug=1` režim vynutí mobilní UI a mock polohu (šipky vlevo/vpravo mění heading).
* `icons/` – všechny ikony jsou textové SVG soubory; repozitář ani výsledný patch nevyžaduje binární obrazové soubory.
* `api/departures.js` – jediná frontendová realtime hranice. `apiBaseUrl` se nastavuje pouze v `js/config.js`.
* `scripts/update-pid-data.mjs` – bez závislostí stáhne a rozbalí GTFS, odvodí módy a vytvoří kompaktní markerový dataset.
* `worker/` – samostatně nasazovaný Cloudflare Worker; frontend kvůli němu nepřestává být statický.
* `sw.js` – network-first app shell s offline fallbackem. Každý deploy mění cache name; aktivace odstraní staré cache. Dataset se záměrně nespravuje v Cache API, nýbrž v IndexedDB.

## PID data a preprocessing

Výchozím a přesným zdrojem je oficiální PID GTFS Static **`https://data.pid.cz/PID_GTFS.zip`**. Lze jej jen pro test přepsat proměnnou `PID_GTFS_URL`. Spuštění:

```bash
npm run update-data
```

Skript čte `stops.txt`, `routes.txt`, `trips.txt` a `stop_times.txt`, ale do klienta neposílá jízdní řády. Výstupy jsou `data/pid-stops.json` a `data/pid-stops-meta.json`. Commit obsahuje jen malý bootstrap dataset pro lokální vývoj; Pages workflow při každém deployi a denně v 03:17 UTC vygeneruje úplný aktuální dataset přímo do deployment artefaktu. Nevznikají automatické commity.

### Konsolidace markerů

Route type se přes trip/stop-time připojí k místu. Surface stop (`location_type=0`) zůstává samostatný podle parent station, platform code a souřadnice zaokrouhlené na 5 desetinných míst: Anděl A/B/C proto zůstávají oddělené, ale identické virtuální duplikáty stejného sloupku se sloučí. Pomocné lokace nejsou markerem. Železnice (`route_type=2`) se agreguje na jeden station-level marker. Metro (`route_type=1`) použije `location_type=2` entrances dané parent station; chybí-li vstupy, použije station centroid. Přestupní stanice uchovává pole linek/módů a po výběru vždy otevírá stabilní screen-space tabuli, nikoli falešné podzemní AR.

## Telefon, offline režim a AR

První návštěva stáhne JSON se zobrazeným průběhem a v jediné IndexedDB transakci uloží data, metadata, verzi a čas. Další start nejprve čte lokální kopii, ihned vytvoří grid (buňky 0,005°) a až potom na pozadí kontroluje metadata. Nová verze nahradí celý objekt atomicky. Bez sítě fungují app shell, kamera, GPS, grid a markery; nefunguje jen realtime.

GPS update vybere kandidáty jen z okolních grid cells a spočítá Haversine vzdálenost a bearing. Device Orientation je izolována v `js/orientation.js`; iOS permission se žádá až kliknutím na **Spustit AR**. Rozdíl bearing/heading se přes konfigurované horizontální FOV mapuje na X. Výška je fixní a netvrdí centimetrové world tracking. Marker lze tapnout nebo vybrat 800ms setrváním v reticle, následovaným selection lockem. Laditelné hodnoty jsou v `js/config.js`.

## Realtime Worker contract

Aktuální adaptér cílí na stabilní public-transport departure-board endpoint Golemio `GET https://api.golemio.cz/v2/pid/departureboards`; tento upstream existuje pouze ve Workeru. Před produkčním nasazením doporučujeme znovu porovnat parametry s aktuální Golemio OpenAPI dokumentací, protože provider může kontrakt měnit. Klientský kontrakt je:

* `GET /health` → `200 {"ok":true}`; nikdy nevolá upstream a nepřijímá query parametry.
* `GET /departures?stop=<ID>` → `200 {stop, departures, updatedAt}`. Každá položka má `{route,destination,minutes,scheduledTime,predictedTime,realtime,delaySeconds,platform}`. Worker posílá upstreamu `includeMetroTrains=false`, protože ID označuje konkrétní fyzické stanoviště.
* `stop` je povinný, max. 64 znaků a smí obsahovat jen ASCII písmena, čísla, `_ . : -`. Neznámé parametry vrací `400`; jiné cesty `404`; jiné metody `405`.
* Upstream/auth chyba vrací `502`/`503` v normalizovaném JSON. CORS povolí pouze nakonfigurované originy.
* `caches.default` cachuje jednotlivé stop ID standardně 20 sekund. In-memory promise coalescing navíc sloučí souběžné cache-miss požadavky v jedné Worker isolate.

Frontend po otevření načte okamžitě, potom nejvýše jednou za 20 sekund. Polling na pozadí stojí a při návratu do foreground se obnoví. Chyba neshodí AR ani nezavře tabuli.

## Cloudflare – nasazení krok za krokem

1. V Cloudflare Dashboard vytvořte Worker (Workers & Pages → Create → Worker), nebo v `worker/` spusťte `npx wrangler login` a `npm run deploy`.
2. V `worker/wrangler.jsonc` nahraďte `ALLOWED_ORIGIN` přesným Pages originem, např. `https://uzivatel.github.io`. Pro více originů použijte čárkou oddělený seznam. Volitelně změňte `CACHE_TTL_SECONDS` (5–300, výchozí 20).
3. V Dashboard → Worker → Settings → Variables and Secrets přidejte encrypted secret **`GOLEMIO_API_KEY`**. Alternativně spusťte `npx wrangler secret put GOLEMIO_API_KEY`. Hodnotu nikdy necommitujte.
4. Nasaďte Worker a ověřte `https://<worker>.workers.dev/health`.
5. Do `CONFIG.apiBaseUrl` v `js/config.js` vložte veřejný Worker origin bez koncového lomítka a znovu nasaďte Pages.
6. V GitHub Settings → Pages nastavte Source na **GitHub Actions**. Workflow `.github/workflows/pages.yml` obslouží push, ruční i denní deploy.

### Ověření produkčního datasetu

Repozitářový `data/pid-stops.json` je záměrně **prázdný fallback pouze pro lokální development**. Neobsahuje žádná ukázková ani produkční PID fakta; zejména z něj nelze odvozovat název zastávky pro `U1071Z2P`. Metadata fallbacku mají `bootstrap: true`, `datasetKind: "empty-development-fallback"` a nulový počet markerů. GitHub Pages workflow tento soubor před vytvořením artefaktu vždy přepíše spuštěním `npm run update-data` nad výchozím `https://data.pid.cz/PID_GTFS.zip`.

Po úspěšném Pages deployi ověřte publikovaná metadata (za `BASE` dosaďte Pages URL):

```bash
BASE=https://uzivatel.github.io/ZastavkyAR
curl -fsSL "$BASE/data/pid-stops-meta.json" | jq -e '
  .bootstrap == false and
  .datasetKind == "generated-from-pid-gtfs" and
  .source == "https://data.pid.cz/PID_GTFS.zip" and
  .markerCount > 0 and
  (.version | test("^[0-9a-f]{16}$"))'
curl -fsSL "$BASE/data/pid-stops.json" | jq -e '.stops | length > 0'
```

Oba příkazy musí skončit s návratovým kódem `0`. V odpovídajícím GitHub Actions běhu lze navíc v kroku `npm run update-data` zkontrolovat hlášení `Vytvořeno … markerů`; deploy job musí navazovat na tentýž úspěšný build artefakt.

Jediný povinný secret je `GOLEMIO_API_KEY`. Plain-text Worker variables jsou `ALLOWED_ORIGIN` a volitelný `CACHE_TTL_SECONDS`; žádná frontendová environment variable ani secret není potřeba.

## Vývoj a test

Pro senzory je mimo localhost nutné HTTPS. Statický server lze spustit například `python3 -m http.server 8080` a otevřít `http://localhost:8080/?debug=1`. Testy nemají externí závislosti:

```bash
npm test
npm --prefix worker test
```

Projekt používá otevřená data PID / ROPID a není oficiální aplikací PID.
