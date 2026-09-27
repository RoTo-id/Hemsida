# maxineplatform.com

Den publicerade kopian av maxineplatform.com. GitHub Pages visar den här
repots `main` på domänen i `CNAME`. Domänen är registrerad hos GoDaddy, och
dess DNS pekar på GitHub Pages.

Källan finns i det privata repot `RoTo-id/Parkmap` (grenen `main`). GitHub
Free publicerar bara Pages från publika repon, så sajten publiceras härifrån
sedan Parkmap blev privat den 2026-09-24.

## Uppdatera sajten

1. Gör och granska ändringen i Parkmap och merga den till Parkmaps `main`.
2. Kopiera endast granskade publika filer från Parkmaps `main`. Nuvarande
   publika kataloger är `_assets/`, `about/`, `build-log/`, `channels/`,
   `data/`, `images/`, `legal/`, `operators/`, `parkmap/`, `products/`,
   `regions/`, `shop/` och `videos/`. Rotfiler för webbplatsen (HTML,
   favicon, CNAME, robots och sitemap) får också följa med efter granskning.
   Nya kataloger kräver en separat kontroll av att de är avsedda för
   besökare. Kopiera aldrig `dashboard/`, adminverktyg, lokal statistik,
   körloggar, konfiguration, källkod eller privata data.
3. Committa och pusha till `main` här. GitHub Pages publicerar om inom en
   minut eller två.

Lägg aldrig nycklar, lösenord eller interna anteckningar här: allt i repot är
publikt, och allt i `main` går att hämta via maxineplatform.com.
