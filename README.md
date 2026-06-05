# Peel

PWA che separa **voce, batteria, basso e strumenti** da un brano, **interamente nel browser**.
Nessun upload, nessun server, nessun costo: il file non lascia il dispositivo dell'utente.

App **completa e funzionante**: interfaccia, mixer, PWA installabile, service worker, export WAV.
Il **motore AI reale Open-Unmix UMX-L è già attivo** (`USE_REAL_ENGINE = true`): gira via
**WebAssembly, interamente client-side**. I pesi del modello (~44 MB) si scaricano **una volta sola**
alla prima apertura e restano poi in cache per l'uso offline.

---

## ✅ Cosa devi fare tu (in ordine)

### 1. Provalo in locale (2 minuti)
I service worker non funzionano aprendo il file direttamente: serve un piccolo server locale.
```bash
cd peel
python3 -m http.server 8080
```
Apri `http://localhost:8080`, trascina un MP3 e vedrai il mixer con i 4 canali.
(Alla prima apertura il modello Open-Unmix UMX-L, ~44 MB, viene scaricato una sola volta.)

### 2. Crea la repo su GitHub
```bash
git init
git add .
git commit -m "Peel: impalcatura iniziale"
git branch -M main
git remote add origin https://github.com/pezzaliapp/Peel.git
git push -u origin main
```

### 3. Pubblicala gratis
Due opzioni, entrambe a costo zero:

- **Cloudflare Pages** (consigliato): collega la repo, build command vuoto,
  output directory `/`. Regge bene i ~45 MB di pesi del modello.
- **GitHub Pages**: Settings → Pages → Deploy from branch `main` / root.

È un sito statico: nessuna build, nessun backend.

---

## 🔌 Motore AI: Open-Unmix UMX-L (già attivo)

Il motore reale è **già collegato e in funzione** (`USE_REAL_ENGINE = true` in `app.js`):
la separazione avviene con **Open-Unmix UMX-L** eseguito via **WebAssembly nel browser**,
senza alcun server.

Open-Unmix (UMX-L) è scelto perché è **MIT su codice e pesi** ed è addestrato sul dataset
aperto MUSDB18-HQ: la strada legalmente più pulita. I pesi (~44 MB) si scaricano **una volta
sola** alla prima apertura e il service worker li tiene in cache persistente per l'uso offline.

---

## 📁 Struttura

```
peel/
├── index.html              interfaccia
├── styles.css              tema studio scuro
├── app.js                  logica: decode, mixer, export WAV (USE_REAL_ENGINE = true)
├── worker.js               motore AI: Open-Unmix UMX-L via WebAssembly
├── sw.js                   service worker (offline + cache del modello)
├── manifest.webmanifest    PWA
├── icons/                  icone app
├── LICENSE                 MIT (solo il codice)
└── README.md
```

## ⚖️ Licenze
- **Codice di questa app**: MIT (vedi `LICENSE`).
- **Pesi del modello**: inclusi in `models/`, sotto licenza Open-Unmix (MIT) e addestrati
  sul dataset aperto MUSDB18-HQ. Sono scaricati dal browser alla prima apertura (~44 MB, poi
  tenuti in cache) e l'attribuzione agli autori originali è sempre mantenuta.

## ⚠️ Note pratiche
- La separazione AI nel browser è **lenta** (alcuni minuti a brano, di più su mobile):
  è il prezzo del "tutto gratis e privato". La UI mostra già un avviso sui brani lunghi.
- Suggerisci agli utenti di non separare materiale protetto da copyright senza diritto.
  Il rischio è basso (i file restano sul dispositivo), ma un disclaimer è prudente.

## Autore
Creato da Alessandro Pezzali — pezzaliapp · https://www.alessandropezzali.it
