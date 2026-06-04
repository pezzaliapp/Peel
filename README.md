# Peel

PWA che separa **voce, batteria, basso e strumenti** da un brano, **interamente nel browser**.
Nessun upload, nessun server, nessun costo: il file non lascia il dispositivo dell'utente.

Questa è l'**impalcatura completa e funzionante**: interfaccia, mixer, PWA installabile,
service worker, export WAV. La separazione parte in **modalità anteprima** (segnaposto a filtri EQ)
così puoi provare subito tutto. Il motore AI reale (Open-Unmix) si collega in un secondo momento,
nel punto già predisposto.

---

## ✅ Cosa devi fare tu (in ordine)

### 1. Provalo in locale (2 minuti)
I service worker non funzionano aprendo il file direttamente: serve un piccolo server locale.
```bash
cd stemlab
python3 -m http.server 8080
```
Apri `http://localhost:8080`, trascina un MP3 e vedrai il mixer con i 4 canali.
(In anteprima i canali sono filtrati per EQ, non separati dall'AI: è normale.)

### 2. Crea la repo su GitHub
```bash
git init
git add .
git commit -m "StemLab: impalcatura iniziale"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/stemlab.git
git push -u origin main
```

### 3. Pubblicala gratis
Due opzioni, entrambe a costo zero:

- **Cloudflare Pages** (consigliato): collega la repo, build command vuoto,
  output directory `/`. Regge bene i ~45 MB di pesi del modello.
- **GitHub Pages**: Settings → Pages → Deploy from branch `main` / root.

È un sito statico: nessuna build, nessun backend.

### 4. Collega il motore reale (Open-Unmix)
Questo è l'unico passaggio "tecnico". Vedi la sezione sotto.
Finché non lo fai, l'app resta in modalità anteprima ed è già installabile e usabile come demo.

---

## 🔌 Collegare Open-Unmix (separazione AI vera)

Open-Unmix (UMX-L) è scelto perché è **MIT su codice e pesi** ed è addestrato sul dataset
aperto MUSDB18-HQ: la strada legalmente più pulita.

1. Procurati il modulo WASM e i pesi. Punto di partenza MIT: il progetto `umx.cpp`
   (transpilazione C++ di Open-Unmix, compilabile in WASM con Emscripten). Cerca
   `sevagh/umx.cpp` e `free-music-demixer` su GitHub.
2. Metti i file generati in una cartella `models/` (es. `models/umx.js`, `models/umx.wasm`,
   `models/umxl-ggml.bin`). Il service worker li mette già in cache persistente.
3. In `worker.js` carica il glue Emscripten e implementa `runRealSeparation()`
   (c'è già lo scheletro con i TODO).
4. In `app.js` cambia `USE_REAL_ENGINE = false` → `true`.
5. Aggiungi in `models/` un file `LICENSE` con la licenza dei pesi e l'attribuzione agli autori.

Niente altro da toccare: l'interfaccia, il mixer e l'export funzionano già con l'output reale.

---

## 📁 Struttura

```
stemlab/
├── index.html              interfaccia
├── styles.css              tema studio scuro
├── app.js                  logica: decode, mixer, export WAV, anteprima EQ
├── worker.js               ← punto d'integrazione del motore AI
├── sw.js                   service worker (offline + cache del modello)
├── manifest.webmanifest    PWA
├── icons/                  icone app
├── LICENSE                 MIT (solo il codice)
└── README.md
```

## ⚖️ Licenze
- **Codice di questa app**: MIT (vedi `LICENSE`).
- **Pesi del modello**: NON inclusi. Aggiungi Open-Unmix (MIT) e tieni la sua nota
  di licenza in `models/`. Mantieni sempre l'attribuzione agli autori originali.

## ⚠️ Note pratiche
- La separazione AI nel browser è **lenta** (alcuni minuti a brano, di più su mobile):
  è il prezzo del "tutto gratis e privato". La UI mostra già un avviso sui brani lunghi.
- Suggerisci agli utenti di non separare materiale protetto da copyright senza diritto.
  Il rischio è basso (i file restano sul dispositivo), ma un disclaimer è prudente.
