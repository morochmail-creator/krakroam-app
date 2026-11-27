# KrakRoam – mapa kodu dla Claude

Audio przewodnik po Krakowie: web-apka na telefon (GPS, mapa, punkty z MP3, trasy, linia prowadząca).
Sprzedaż przez QR w hotelach itp. → mail z linkiem i hasłem → dostęp 1–4 tyg.

## Zasady pracy
- **Oszczędzaj tokeny:** nie czytaj całego `app.html` (~7800 linii). Najpierw `grep -n`, potem czytaj tylko zakres linii (`sed -n 'A,Bp'`). Numery linii poniżej są przybliżone – szukaj po nazwie funkcji/nagłówku.
- Po większej zmianie (nowa sekcja, przeniesione funkcje, nowe pliki) **zaktualizuj ten plik**.
- Właściciel (Pektus) nie jest programistą: odpowiadaj **po polsku, krótko i prosto**.
- Wszystko projektujemy **pod telefony** (iOS Safari + Android Chrome).
- Zmiany **od razu na `main`** (Vercel auto-deploy), bez PR i bez pytania o zgodę. Przed pushem `git pull --rebase` (równolegle pracują inne wątki).
- Komentarze w kodzie piszemy po polsku.

## Struktura repo
| Ścieżka | Co to |
|---|---|
| `app.html` | Cała apka (HTML+CSS+JS w jednym pliku) → app.krakroam.pl |
| `www/index.html` (+`www/img/`) | Strona-wizytówka → krakroam.pl / www.krakroam.pl |
| `audio/index.html` | Strona sprzedaży („kup audioprzewodnik”) → `/audio` (`/kup` = 404) |
| `audio/pl/`, `audio/en/` (+`dodatkowe/`) | Nagrania MP3 (mono, 64 kbps). Nazwa = pole `audio` w POINTS |
| `foto/<nazwa mp3>.webp`, `foto/mini/` | Zdjęcia do nagrań (max 800 px, WebP) i miniatury; `trasa-*.jpg` = zdjęcia tras |
| `muzyka/` | Muzyka w tle pod lektorem |
| `lib/leaflet-rotate-0.2.8.js` | Obracanie mapy (kopia lokalna, działa offline) |
| `sw.js` | Service worker: cache apki, bibliotek, kafelków (max 2500), audio. Przy zmianach podbij `VERSION` |
| `manifest.json`, `icon-*.png` | PWA / „Dodaj do ekranu głównego” |
| `vercel.json` | Routing (patrz niżej) |

## Routing (vercel.json)
- Host `krakroam.pl` / `www.krakroam.pl`: `/` → `/www/index.html`; `/www*` przekierowuje na `/`.
- Każdy inny host (app.krakroam.pl): `/` i `/index.html` → `/app.html`.
- `/audio` → `/audio/index.html`.
- Cache 1 dzień dla `/audio/:lang/*` i `/foto/*`; `sw.js` bez cache.
- DNS w OVH → projekt Vercel `krakroam-app`.
- (Pliki `krakroam-routing.md` i `krakroam-photos.md` były w starym projekcie; nie ma ich w repo – najważniejsze informacje są tutaj.)

## Zdjęcia
- Plik: `foto/<nazwa pliku mp3 bez .mp3>.webp`, kolejne zdjęcia tego samego nagrania: `_2`, `_3`…
- Wymiary w `PHOTO_FILES` (~l. 4309), podpisy i źródła w `PHOTO_INFO` (~l. 6166).
- Po podmianie zdjęć podbij `TRACK_PHOTO_VER` (~l. 4308) / `PHOTO_VER` (~l. 5773, zdjęcia tras).

## Mapa `app.html` (przybliżone linie)
**HTML/CSS**
- 1–27 head, motyw z localStorage; 28–1591 `<style>` (cały CSS)
- 1596 `#splash` (ekran ładowania), 1605 `#pw-screen` (hasło), 1616 `#a2hs-screen`, 1632 `#lang-menu`
- 1649 `#home-menu`, 1682 `#howto-screen`, 1706 `#district-menu` (karuzela tras), 1772 `#route-intro-screen`
- 1802 `#map`, 1808 `#nav-top-bar`, 1836 `#route-list-screen`, 1851 `#perm-screen`, 1876 `#gps-reminder`
- 1911 `#settings-screen` (widok mapy, dźwięk, język `settings-lang-row`, wyloguj `settings-logout-row`)
- 2092–2095 skrypty: Leaflet 1.9.4, markercluster, leaflet-rotate

**JS** (nagłówki sekcji to komentarze `/* ===… NAZWA`)
- ~2097 **HASŁO DOSTĘPU**: `ACCESS_PASSWORD`, `unlockApp`, `tryUnlock`, `lockApp` (localStorage `krakroam_unlocked`)
- ~2140 **Dodaj do ekranu głównego**: `maybeShowA2HS`, `getMobilePlatform`
- ~2184 **TŁUMACZENIA UI**: `TRANSLATIONS` {pl,en}, `t(key)`, `applyTranslations` (~2610), atrybuty `data-t`
- ~2456 **Tłumaczenia nazw zabytków/nagrań**: `PLACE_NAMES`, `TITLE_TR`, `trName`, `pointName`, `trackLabel`
- ~2693 **DANE PUNKTÓW**: `ROUTE_KEYS` (stare-miasto, kazimierz, free-roam), `CURRENT_ROUTE`, `POINTS_STARE_MIASTO` (~2742), `ROUTE_LINE_STARE_MIASTO` (~3347), `POINTS_KAZIMIERZ` (~3350), `ROUTE_LINE_KAZIMIERZ` (~3884), `POINTS`/`ROUTE_LINE` (~3885/3900)
- ~3903 **MAPA**: inicjalizacja Leaflet, kafelki `makeTileLayers`, `showTiles`, `KRAKOW_REGION`
- ~4075 **Doładowanie kafelków**: `prefetchTilesForArea`
- ~4157 **Dźwięki interfejsu** (Web Audio): obiekt `sfx`, `SOUNDS`, `updateSoundRow`
- ~4258 **Widok mapy / motyw**: `setMapMode`, `setTheme`; pinezki `makePinIcon`, `clusterIcon`, `syncExtras`; postęp `pointIsDone`, `PROGRESS_KEY`, `TRACKS_KEY`
- ~4563 **GPS**: `moveGpsMarkerSmoothly`, `gpsFrame` (wygładzanie), kompas `handleOrientation`, `startCompass`
- ~4774 **Widok 3D**: `setViewMode3D`, `follow3D`
- ~4862 **Linia prowadząca / nawigacja**: `drawGuideLine`, `fetchWalkingRouteFrom`, `requestWalkingRoute` (~4999), `routeSegmentTo`, `beginLocationFlow`, `startLocationTracking` (~5107)
- ~5184 **Przypomnienie o lokalizacji**: `updateGpsOffState`, `showPermHelp`, `retryLocationAccess`
- ~5287 **Pasek nawigacji (góra)**: `startNavigation` (~5343), `stopNavigation`, `showArrivalToast`, `nextMainPoint`, `updateNextPointBtn`
- ~5524 **Obracanie mapy**: `resetNorth`, `straightenMap`
- ~5603 **Menu dzielnic/tras**: `selectDistrict`, `ROUTE_INTRO_CONTENT`, `openRouteIntro`, karuzela, `openHomeMenu`, wybór języka i start apki (~6040–6087)
- ~6117 **SHEET (panel punktu)**: `PHOTO_INFO`, `updateTrackPhoto`, przeglądarka zdjęć `openPhotoViewer`, przeciąganie panelu, `openSheet` (~6743), `renderTrackList`, `loadTrack` (~6829)
- ~6856 **AUDIO PLAYER**: `togglePlayPause`, postęp trasy `markPointDone`, `renderRouteList` (lista punktów; w free roam pogrupowana trasami: nagłówki `.rl-route`), autoplay `setAutoplay`, odzyskiwanie po błędzie, `goTrack`, `setVolume`, prędkość `applyPlaybackRate`
- ~7534 **Muzyka w tle**: `MUSIC_TRACKS`, `MUSIC_LEVEL`, `musicFadeTo`, `musicSync`, `updateMusicUI`
- ~7769 **Przycisk „Wstecz” na Androidzie**

## Klucze localStorage
`krakroam_unlocked`, `krakroam_lang`, `krakroam_route`, `krakroam_theme`, `krakroam_sfx`, `krakroam_tracks_all`, `krakroam_autoplay_v2`, `krakroam_volume`, `krakroam_rate`, `krakroam_a2hs_dismissed`.

## Dodawanie punktu / nagrania (skrót)
1. MP3 do `audio/pl/` (i `audio/en/`), nazwa = pole `audio` w obiekcie punktu w `POINTS_…`.
2. Tłumaczenie nazwy do `PLACE_NAMES` / `TITLE_TR`.
3. Zdjęcie do `foto/` + miniatura `foto/mini/`, wpis w `PHOTO_FILES` i `PHOTO_INFO`.
