/* Peel — worker di separazione (MOTORE REALE: Open-Unmix UMX-L via WebAssembly)
 * ============================================================
 *  Motore: umx.cpp compilato in WASM (wrapper di free-music-demixer).
 *  Artefatti in ./engine/ (umx.js + umx.wasm), pesi in ./models/.
 *
 *  Contratto con app.js:
 *    in : { type:'separate', payload:{ channels:[Float32Array L, R], sampleRate, length } }
 *         (app.js garantisce 44100 Hz e 2 canali — il modello lavora SOLO a 44.1k stereo)
 *    out: { type:'done', stems:{ vocals:[L,R], drums:[L,R], bass:[L,R], other:[L,R] } }
 *         { type:'status', stage:'…' }   (fasi di caricamento modello)
 *         { type:'error', message:'…' }
 *  Inoltre il WASM invia DIRETTAMENTE al main thread:
 *         { msg:'PROGRESS_UPDATE', data:0..1 }  (avanzamento inferenza)
 *         { msg:'WASM_LOG', data:'…' }          (log interni del C++)
 * ============================================================
 */

const SAMPLE_RATE = 44100;
const MODEL_FILE = 'ggml-model-umxl-u8.bin.gz'; // nome atteso da load_umx_model()
const MODEL_URL = './models/ggml-model-umxl-u8.bin.gz';

// glue Emscripten: definisce la factory globale libumx()
self.importScripts('./engine/umx.js');

let modulePromise = null;

// Inizializza il modulo WASM una sola volta: risolve umx.wasm, scarica i pesi
// da ./models/, li scrive nel filesystem virtuale e carica il modello.
function getModule() {
  if (!modulePromise) {
    modulePromise = libumx({
      // il glue cerca "umx.wasm" accanto a sé: lo facciamo puntare a ./engine/
      locateFile: (path) => './engine/' + path,
    }).then(async (module) => {
      self.postMessage({ type: 'status', stage: 'Scaricamento modello (≈45 MB, una volta sola)…' });
      const resp = await fetch(MODEL_URL);
      if (!resp.ok) throw new Error('Pesi non trovati in ' + MODEL_URL + ' (' + resp.status + ')');
      const bytes = new Uint8Array(await resp.arrayBuffer());
      module.FS.writeFile(MODEL_FILE, bytes);

      self.postMessage({ type: 'status', stage: 'Caricamento modello…' });
      module._modelInit(); // bloccante: decomprime (gz) e popola i pesi in memoria
      return module;
    });
  }
  return modulePromise;
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type !== 'separate') return;
  try {
    const stems = await runRealSeparation(payload);
    self.postMessage({ type: 'done', stems }, transferOf(stems));
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};

async function runRealSeparation(payload) {
  const module = await getModule();

  // app.js garantisce 44100 Hz; assicuriamo comunque 2 canali (mono -> duplicato)
  const left = payload.channels[0];
  const right = payload.channels[1] || payload.channels[0];
  const N = left.length;
  const BYTES = Float32Array.BYTES_PER_ELEMENT;

  // --- input: copia L/R nel heap WASM ---
  const pL = module._malloc(N * BYTES);
  const pR = module._malloc(N * BYTES);
  module.HEAPF32.set(left, pL / BYTES);
  module.HEAPF32.set(right, pR / BYTES);

  // --- output: 4 target × 2 canali ---
  const pLDrums = module._malloc(N * BYTES);
  const pRDrums = module._malloc(N * BYTES);
  const pLBass = module._malloc(N * BYTES);
  const pRBass = module._malloc(N * BYTES);
  const pLOther = module._malloc(N * BYTES);
  const pROther = module._malloc(N * BYTES);
  const pLVocals = module._malloc(N * BYTES);
  const pRVocals = module._malloc(N * BYTES);

  // Inferenza (bloccante). L'ordine dei puntatori d'uscita replica quello
  // dell'app collaudata di free-music-demixer (swap drum/bass già gestito).
  // L'ultimo argomento (batch_mode=false) abilita gli aggiornamenti di progresso.
  module._modelDemixSegment(
    pL, pR, N,
    pLDrums, pRDrums,
    pLBass, pRBass,
    pLOther, pROther,
    pLVocals, pRVocals,
    false
  );

  // L'inferenza può aver fatto crescere la memoria: ri-leggo HEAPF32 (il buffer
  // precedente potrebbe essere staccato) e copio i risultati FUORI dal heap.
  const heap = module.HEAPF32;
  const grab = (ptr) => heap.slice(ptr / BYTES, ptr / BYTES + N);

  const stems = {
    drums:  [grab(pLDrums),  grab(pRDrums)],
    bass:   [grab(pLBass),   grab(pRBass)],
    other:  [grab(pLOther),  grab(pROther)],
    vocals: [grab(pLVocals), grab(pRVocals)],
  };

  // libera tutto
  [pL, pR, pLDrums, pRDrums, pLBass, pRBass, pLOther, pROther, pLVocals, pRVocals]
    .forEach((p) => module._free(p));

  return stems;
}

function transferOf(stems) {
  const t = [];
  for (const k in stems) for (const ch of stems[k]) t.push(ch.buffer);
  return t;
}
