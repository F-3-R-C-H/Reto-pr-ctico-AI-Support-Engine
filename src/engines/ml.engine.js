'use strict';

/**
 * Tercer Camino: Motor de Machine Learning Clásico (DataFrame CSV + TF-IDF + Regresión Logística)
 * Equivalente en JavaScript/Node.js al pipeline de Pandas + Scikit-Learn:
 *
 *   data = pd.read_csv("tickets.csv")
 *   X_train, X_test, y_train, y_test = train_test_split(
 *     data["message"], data["category"], test_size=0.2, stratify=data["category"], random_state=42
 *   )
 *   model = Pipeline([
 *     ("vectorizer", TfidfVectorizer(ngram_range=(1, 2))),
 *     ("classifier", LogisticRegression(max_iter=1000))
 *   ])
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CSV_PATH = path.join(__dirname, '..', '..', 'tickets.csv');

const CRITICAL_SECURITY_PATTERNS = [
  /\b(fuga|filtracion|robo|exposicion) de (datos|informacion|credenciales)\b/,
  /\b(datos|informacion|credenciales) (filtrados|expuestos|robados)\b/,
  /\b(vulnerabilidad|brecha) (activa|explotada|explotable|critica)\b/,
  /\b(acceso no autorizado|hackeo|hackeado|malware|ransomware|inyeccion sql|sql injection|xss)\b/,
  /\bcontrasena expuesta\b/,
  /\b(en este momento|ahora mismo|en curso)\b/,
  /\bignora (?:todas? )?(?:las )?instrucciones\b/,
  /\b(omite|desobedece|cambia|modifica) (?:tus |las )?(?:reglas|instrucciones)\b/,
  /\b(no (?:lo )?reportes|no informes|oculta (?:este|el) incidente)\b/,
];

const CRITICAL_OPERATION_PATTERNS = [
  /\b(produccion|sistema|servicio|plataforma) (esta )?(totalmente )?(caid[oa]|indisponible)\b/,
  /\bcaida total\b/,
  /\bincidente (critico|urgente)\b/,
];

const HIGH_IMPACT_PATTERNS = [
  /\b(usuario|cuenta)(?: esta| quedo| fue)? bloquead[oa]\b/,
  /\bacceso (denegado|importante|bloqueado)\b/,
  /\b(no puedo|no podemos) (trabajar|operar|continuar)\b/,
  /\b(impide|bloquea) (mi |el |nuestro )?(trabajo|operacion)\b/,
  /\b(falla|error|problema) (grave|recurrente|repetido)\b/,
  /\b(todos los usuarios|multiples usuarios|todo el equipo)\b/,
  /\bpantalla (en )?blanc[oa]\b/,
];

const COSMETIC_PATTERNS = [
  /\b(color|tipografia|tamano|alineacion|diseno|visual|cosmetic[oa]|modo oscuro)\b/,
  /\b(boton|icono)\b/,
];

const RESPONSES = {
  ACCESS: {
    LOW: 'Solicitud de acceso clasificada por el modelo ML. Revisaremos su cuenta y permisos sin solicitar credenciales por este medio.',
    MEDIUM: 'Problema de inicio de sesión o acceso detectado por el modelo ML. Utilice el flujo oficial de recuperación o validación de cuenta.',
    HIGH: 'Bloqueo de cuenta o acceso prioritario detectado por el modelo ML. El equipo de soporte validará sus permisos a la brevedad.',
    CRITICAL: 'Interrupción crítica de acceso detectada por el modelo ML. Se escala de inmediato al equipo administrador.',
  },
  BUG: {
    LOW: 'Incidencia técnica clasificada por el modelo ML. Se registró el reporte para revisión del comportamiento en el sistema.',
    MEDIUM: 'Error funcional clasificado por el modelo ML. El equipo de ingeniería revisará el fallo reportado para su corrección.',
    HIGH: 'Falla operativa de alto impacto clasificada por el modelo ML. Se asigna prioridad alta para restablecer el flujo de trabajo.',
    CRITICAL: 'Caída o fallo crítico del servicio clasificado por el modelo ML. Se notifica con urgencia al equipo de infraestructura.',
  },
  FEATURE: {
    LOW: 'Sugerencia visual o cosmética clasificada por el modelo ML. Se agregó al backlog de mejoras de interfaz.',
    MEDIUM: 'Solicitud de nueva funcionalidad clasificada por el modelo ML. El equipo de producto evaluará su incorporación.',
    HIGH: 'Requerimiento funcional prioritario clasificado por el modelo ML. Se canaliza a planeación de producto.',
    CRITICAL: 'Solicitud de funcionalidad registrada por el modelo ML. Será evaluada por el equipo de producto.',
  },
  SECURITY: {
    LOW: 'Reporte de seguridad clasificado por el modelo ML. Se deriva a revisión humana obligatoria; no comparta contraseñas.',
    MEDIUM: 'Posible riesgo de seguridad clasificado por el modelo ML. Un especialista revisará el caso manualmente.',
    HIGH: 'Incidente de seguridad de alta prioridad clasificado por el modelo ML. Escalado a revisión humana especializada.',
    CRITICAL: 'Incidente crítico de seguridad detectado por el modelo ML. Se activa revisión humana inmediata; no exponga credenciales ni datos sensibles.',
  },
};

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parseador de líneas CSV compatible con archivos exportados por Excel (comillas dobles, UTF-8 BOM, CRLF).
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Mini-DataFrame estilo Pandas para JavaScript (`pd.read_csv("tickets.csv")`)
 */
class DataFrame {
  constructor(rows, columns) {
    this.rows = rows;
    this.columns = columns;
  }

  get shape() {
    return [this.rows.length, this.columns.length];
  }

  column(colName) {
    return this.rows.map((r) => r[colName]);
  }

  head(n = 5) {
    return this.rows.slice(0, n);
  }

  valueCounts(colName) {
    const counts = {};
    for (const row of this.rows) {
      const val = row[colName];
      counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }
}

const pd = {
  read_csv(csvPath = DEFAULT_CSV_PATH) {
    const resolved = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
    const raw = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new Error('El archivo CSV debe contener encabezado y al menos una fila de datos.');
    }

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx];
      });
      if (obj.message && obj.category) {
        rows.push(obj);
      }
    }

    return new DataFrame(rows, headers);
  },
};

/**
 * Generador pseudoaleatorio determinista (Mulberry32) para reproducir `random_state=42`
 */
function createSeededRandom(seed = 42) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Equivalente a `sklearn.model_selection.train_test_split` con soporte para `stratify` y `random_state`.
 */
function train_test_split(X, y, { test_size = 0.2, stratify = null, random_state = 42 } = {}) {
  const rng = createSeededRandom(random_state);
  const X_train = [];
  const X_test = [];
  const y_train = [];
  const y_test = [];

  if (stratify) {
    const byClass = {};
    for (let i = 0; i < X.length; i++) {
      const label = stratify[i];
      if (!byClass[label]) byClass[label] = [];
      byClass[label].push(i);
    }

    const trainIdx = [];
    const testIdx = [];

    for (const label of Object.keys(byClass).sort()) {
      const indices = shuffleWithSeed(byClass[label], rng);
      const nTest = Math.max(1, Math.round(indices.length * test_size));
      testIdx.push(...indices.slice(0, nTest));
      trainIdx.push(...indices.slice(nTest));
    }

    for (const idx of shuffleWithSeed(trainIdx, rng)) {
      X_train.push(X[idx]);
      y_train.push(y[idx]);
    }
    for (const idx of shuffleWithSeed(testIdx, rng)) {
      X_test.push(X[idx]);
      y_test.push(y[idx]);
    }
  } else {
    const allIdx = shuffleWithSeed(
      Array.from({ length: X.length }, (_, i) => i),
      rng
    );
    const nTest = Math.max(1, Math.round(X.length * test_size));
    for (const idx of allIdx.slice(nTest)) {
      X_train.push(X[idx]);
      y_train.push(y[idx]);
    }
    for (const idx of allIdx.slice(0, nTest)) {
      X_test.push(X[idx]);
      y_test.push(y[idx]);
    }
  }

  return { X_train, X_test, y_train, y_test };
}

/**
 * Equivalente a `sklearn.feature_extraction.text.TfidfVectorizer(ngram_range=(1, 2))`
 */
class TfidfVectorizer {
  constructor({ ngram_range = [1, 2] } = {}) {
    this.ngramRange = ngram_range;
    this.vocabulary = new Map();
    this.idf = [];
  }

  extractNgrams(text) {
    const norm = normalizeText(text);
    const tokens = norm.split(' ').filter((t) => t.length > 1);
    const [minN, maxN] = this.ngramRange;
    const ngrams = [];

    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        ngrams.push(tokens.slice(i, i + n).join(' '));
      }
    }
    return ngrams;
  }

  fit(documents) {
    const docFreq = new Map();
    const nDocs = documents.length;

    for (const doc of documents) {
      const uniqueTerms = new Set(this.extractNgrams(doc));
      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    this.vocabulary = new Map();
    this.idf = [];
    let idx = 0;

    for (const [term, df] of Array.from(docFreq.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      this.vocabulary.set(term, idx);
      // Smooth IDF igual que scikit-learn: log((1 + n) / (1 + df)) + 1
      this.idf.push(Math.log((1 + nDocs) / (1 + df)) + 1);
      idx++;
    }

    return this;
  }

  transform(documents) {
    const vocabSize = this.vocabulary.size;
    return documents.map((doc) => {
      const vec = new Float64Array(vocabSize);
      const terms = this.extractNgrams(doc);
      if (terms.length === 0) return vec;

      const tfCounts = new Map();
      for (const term of terms) {
        const idx = this.vocabulary.get(term);
        if (idx !== undefined) {
          tfCounts.set(idx, (tfCounts.get(idx) || 0) + 1);
        }
      }

      let normSq = 0;
      for (const [idx, count] of tfCounts.entries()) {
        const val = count * this.idf[idx];
        vec[idx] = val;
        normSq += val * val;
      }

      const norm = Math.sqrt(normSq);
      if (norm > 0) {
        for (const idx of tfCounts.keys()) {
          vec[idx] /= norm;
        }
      }
      return vec;
    });
  }

  fit_transform(documents) {
    this.fit(documents);
    return this.transform(documents);
  }
}

/**
 * Equivalente a `sklearn.linear_model.LogisticRegression(max_iter=1000)` (Multinomial Softmax + regularización L2)
 */
class LogisticRegression {
  constructor({ max_iter = 1000, learningRate = 1.5, regLambda = 0.005 } = {}) {
    this.maxIter = max_iter;
    this.learningRate = learningRate;
    this.regLambda = regLambda;
    this.classes = [];
    this.weights = [];
    this.biases = [];
  }

  softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - maxLogit));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }

  fit(X, y) {
    this.classes = Array.from(new Set(y)).sort();
    const numClasses = this.classes.length;
    const numSamples = X.length;
    const numFeatures = X[0] ? X[0].length : 0;

    const classToIdx = new Map(this.classes.map((c, i) => [c, i]));
    this.weights = Array.from({ length: numClasses }, () => new Float64Array(numFeatures));
    this.biases = new Float64Array(numClasses);

    const yIdx = y.map((label) => classToIdx.get(label));

    // Representación dispersa (sparse) para acelerar el entrenamiento en matrices TF-IDF
    const sparseX = X.map((row) => {
      const nonZero = [];
      for (let f = 0; f < numFeatures; f++) {
        if (row[f] !== 0) nonZero.push([f, row[f]]);
      }
      return nonZero;
    });

    for (let iter = 0; iter < this.maxIter; iter++) {
      const gradW = Array.from({ length: numClasses }, () => new Float64Array(numFeatures));
      const gradB = new Float64Array(numClasses);
      let maxGrad = 0;

      for (let i = 0; i < numSamples; i++) {
        const nonZero = sparseX[i];
        const logits = new Array(numClasses);
        for (let c = 0; c < numClasses; c++) {
          let dot = this.biases[c];
          const w = this.weights[c];
          for (let k = 0; k < nonZero.length; k++) {
            const [f, val] = nonZero[k];
            dot += w[f] * val;
          }
          logits[c] = dot;
        }

        const probs = this.softmax(logits);
        for (let c = 0; c < numClasses; c++) {
          const err = probs[c] - (yIdx[i] === c ? 1 : 0);
          gradB[c] += err;
          const gw = gradW[c];
          for (let k = 0; k < nonZero.length; k++) {
            const [f, val] = nonZero[k];
            gw[f] += err * val;
          }
        }
      }

      for (let c = 0; c < numClasses; c++) {
        const db = gradB[c] / numSamples;
        this.biases[c] -= this.learningRate * db;
        const w = this.weights[c];
        const gw = gradW[c];
        for (let f = 0; f < numFeatures; f++) {
          const dw = gw[f] / numSamples + this.regLambda * w[f];
          if (Math.abs(dw) > maxGrad) maxGrad = Math.abs(dw);
          w[f] -= this.learningRate * dw;
        }
      }

      if (maxGrad < 1e-5) break;
    }

    return this;
  }

  predict_proba(X) {
    const numClasses = this.classes.length;
    const numFeatures = this.weights[0] ? this.weights[0].length : 0;

    return X.map((x) => {
      const logits = new Array(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let dot = this.biases[c];
        const w = this.weights[c];
        for (let f = 0; f < numFeatures; f++) {
          if (x[f] !== 0) dot += w[f] * x[f];
        }
        logits[c] = dot;
      }
      return this.softmax(logits);
    });
  }

  predict(X) {
    const probsList = this.predict_proba(X);
    return probsList.map((probs) => {
      let bestIdx = 0;
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[bestIdx]) bestIdx = i;
      }
      return this.classes[bestIdx];
    });
  }
}

/**
 * Equivalente a `sklearn.pipeline.Pipeline`
 */
class Pipeline {
  constructor(steps) {
    this.steps = steps;
  }

  fit(X, y) {
    let currentX = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const [, transformer] = this.steps[i];
      currentX = transformer.fit_transform(currentX);
    }
    const [, estimator] = this.steps[this.steps.length - 1];
    estimator.fit(currentX, y);
    return this;
  }

  predict(X) {
    let currentX = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const [, transformer] = this.steps[i];
      currentX = transformer.transform(currentX);
    }
    const [, estimator] = this.steps[this.steps.length - 1];
    return estimator.predict(currentX);
  }

  predict_proba(X) {
    let currentX = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const [, transformer] = this.steps[i];
      currentX = transformer.transform(currentX);
    }
    const [, estimator] = this.steps[this.steps.length - 1];
    return estimator.predict_proba(currentX);
  }
}

/**
 * Equivalente a `sklearn.metrics.classification_report`
 */
function classification_report(y_true, y_pred) {
  const labels = Array.from(new Set([...y_true, ...y_pred])).sort();
  const perClass = {};
  let correct = 0;

  for (let i = 0; i < y_true.length; i++) {
    if (y_true[i] === y_pred[i]) correct++;
  }

  for (const label of labels) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < y_true.length; i++) {
      if (y_true[i] === label && y_pred[i] === label) tp++;
      else if (y_true[i] !== label && y_pred[i] === label) fp++;
      else if (y_true[i] === label && y_pred[i] !== label) fn++;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const support = tp + fn;
    perClass[label] = { precision, recall, f1, support };
  }

  const accuracy = y_true.length > 0 ? correct / y_true.length : 0;

  const lines = [];
  lines.push('              precision    recall  f1-score   support');
  lines.push('');
  for (const label of labels) {
    const m = perClass[label];
    lines.push(
      `${label.padStart(12)}       ${m.precision.toFixed(2)}      ${m.recall.toFixed(2)}      ${m.f1.toFixed(2)}      ${String(m.support).padStart(4)}`
    );
  }
  lines.push('');
  lines.push(`    accuracy                           ${accuracy.toFixed(2)}      ${String(y_true.length).padStart(4)}`);

  return {
    text: lines.join('\n'),
    accuracy,
    totalTestSamples: y_true.length,
    perClass,
  };
}

let cachedPipelineState = null;

/**
 * Entrena el pipeline a partir de `tickets.csv` siguiendo exactamente el flujo del profesor.
 */
function trainModelFromCSV(csvPath = DEFAULT_CSV_PATH) {
  const data = pd.read_csv(csvPath);
  const messages = data.column('message');
  const categories = data.column('category');

  const { X_train, X_test, y_train, y_test } = train_test_split(messages, categories, {
    test_size: 0.2,
    stratify: categories,
    random_state: 42,
  });

  // Evaluamos primero en la partición 80/20 para generar el classification_report
  const evalModel = new Pipeline([
    ['vectorizer', new TfidfVectorizer({ ngram_range: [1, 2] })],
    ['classifier', new LogisticRegression({ max_iter: 1000 })],
  ]);
  evalModel.fit(X_train, y_train);
  const y_pred = evalModel.predict(X_test);
  const report = classification_report(y_test, y_pred);

  // Entrenamos el modelo de inferencia con el dataset completo de tickets.csv
  const model = new Pipeline([
    ['vectorizer', new TfidfVectorizer({ ngram_range: [1, 2] })],
    ['classifier', new LogisticRegression({ max_iter: 1000 })],
  ]);
  model.fit(messages, categories);

  cachedPipelineState = {
    model,
    evalModel,
    report,
    datasetSize: messages.length,
    trainSize: X_train.length,
    testSize: X_test.length,
    classCounts: data.valueCounts('category'),
    vocabSize: model.steps[0][1].vocabulary.size,
  };

  return cachedPipelineState;
}

function getTrainedState() {
  if (!cachedPipelineState) {
    return trainModelFromCSV(DEFAULT_CSV_PATH);
  }
  return cachedPipelineState;
}

function inferPriority(category, rawMessage) {
  const text = normalizeText(rawMessage);

  if (category === 'SECURITY') {
    return CRITICAL_SECURITY_PATTERNS.some((p) => p.test(text)) ? 'CRITICAL' : 'HIGH';
  }
  if (CRITICAL_OPERATION_PATTERNS.some((p) => p.test(text))) return 'CRITICAL';
  if (HIGH_IMPACT_PATTERNS.some((p) => p.test(text))) return 'HIGH';

  if (category === 'FEATURE') {
    return COSMETIC_PATTERNS.some((p) => p.test(text)) ? 'LOW' : 'MEDIUM';
  }
  if (category === 'ACCESS') {
    return /\b(contrasena|credenciales|iniciar sesion|inicio de sesion|login)\b/.test(text)
      ? 'MEDIUM'
      : 'LOW';
  }
  return 'MEDIUM';
}

/**
 * Clasifica un mensaje de soporte usando el Pipeline de Machine Learning (TF-IDF + LogisticRegression)
 * entrenado con `tickets.csv`, y devuelve el contrato estándar de la API.
 */
async function analyzeML(message) {
  const state = getTrainedState();
  const cleanText = normalizeText(message);

  if (!cleanText) {
    return {
      category: 'BUG',
      priority: 'LOW',
      response: RESPONSES.BUG.LOW,
      requiresHumanReview: true,
      mode: 'ml',
    };
  }

  const [predictedCategory] = state.model.predict([message]);
  const category = predictedCategory || 'BUG';
  const priority = inferPriority(category, message);

  return {
    category,
    priority,
    response: RESPONSES[category][priority],
    requiresHumanReview: category === 'SECURITY',
    mode: 'ml',
  };
}

function getMLModelReport() {
  const state = getTrainedState();
  return {
    datasetFile: 'tickets.csv',
    datasetSize: state.datasetSize,
    trainSize: state.trainSize,
    testSize: state.testSize,
    vocabSize: state.vocabSize,
    classCounts: state.classCounts,
    accuracy: state.report.accuracy,
    perClass: state.report.perClass,
    classificationReport: state.report.text,
  };
}

if (require.main === module) {
  const info = getMLModelReport();
  console.log('====================================================================');
  console.log('  ENTRENAMIENTO DEL MODELO ML (TF-IDF + LogisticRegression)');
  console.log('====================================================================');
  console.log(`Archivo CSV:            ${info.datasetFile}`);
  console.log(`Total de registros:     ${info.datasetSize} (Train 80%: ${info.trainSize} | Test 20%: ${info.testSize})`);
  console.log(`Distribución por clase: ${JSON.stringify(info.classCounts)}`);
  console.log(`N-gramas (1, 2) vocab:  ${info.vocabSize} términos`);
  console.log('--------------------------------------------------------------------');
  console.log('Reporte de Clasificación (Test Set 20%, stratify=category, seed=42):');
  console.log('--------------------------------------------------------------------');
  console.log(info.classificationReport);
  console.log('====================================================================');
}

module.exports = {
  analyze: analyzeML,
  analyzeML,
  trainModelFromCSV,
  getMLModelReport,
  pd,
  train_test_split,
  TfidfVectorizer,
  LogisticRegression,
  Pipeline,
  classification_report,
};
