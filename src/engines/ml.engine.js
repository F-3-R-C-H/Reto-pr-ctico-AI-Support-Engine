'use strict';

/**
 * Tercer Camino: Motor de Machine Learning Clásico (DataFrame CSV + TF-IDF + Regresión Logística)
 * Equivalente en JavaScript/Node.js al pipeline de Pandas + Scikit-Learn del profesor:
 *
 *   data = pd.read_csv("tickets.csv")
 *   X_train, X_test, y_train, y_test = train_test_split(
 *     data["message"], data["category"], test_size=0.2, stratify=data["category"], random_state=42
 *   )
 *   model = Pipeline([
 *     ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
 *     ("classifier", LogisticRegression(max_iter=1000))
 *   ])
 *   model.fit(X_train, y_train)
 *   predictions = model.predict(X_test)
 *   print(classification_report(y_test, predictions, zero_division=0))
 *   print(confusion_matrix(y_test, predictions, labels=model.classes_))
 *   new_message = ["Encontré datos de otros clientes"]
 *   category = model.predict(new_message)[0]
 *   confidence = model.predict_proba(new_message).max()
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CSV_PATH = path.join(__dirname, '..', '..', 'tickets.csv');
const DEFAULT_SAMPLE_MESSAGE = 'Encontré datos de otros clientes';

const CRITICAL_SECURITY_PATTERNS = [
  /\b(fuga|filtracion|robo|exposicion) de (datos|informacion|credenciales)\b/,
  /\b(datos|informacion|credenciales) (filtrados|expuestos|robados|de otros clientes)\b/,
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
 * Helper sobre matrices de probabilidades para emular `model.predict_proba(new_message).max()` de NumPy
 */
function attachProbabilityHelpers(matrix) {
  Object.defineProperty(matrix, 'max', {
    value: function max() {
      let maxVal = 0;
      for (const row of matrix) {
        for (const val of row) {
          if (val > maxVal) maxVal = val;
        }
      }
      return maxVal;
    },
    enumerable: false,
  });
  return matrix;
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
    this.classes_ = [];
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
    this.classes_ = this.classes;
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

    const matrix = X.map((x) => {
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
    return attachProbabilityHelpers(matrix);
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
 * Equivalente a `sklearn.pipeline.Pipeline` (expone `model.classes_`)
 */
class Pipeline {
  constructor(steps) {
    this.steps = steps;
  }

  get classes_() {
    const [, estimator] = this.steps[this.steps.length - 1];
    return estimator.classes_ || estimator.classes || [];
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
 * Equivalente a `sklearn.metrics.classification_report(y_test, predictions, zero_division=0)`
 */
function classification_report(y_true, y_pred, { zero_division = 0 } = {}) {
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
    const precision = tp + fp > 0 ? tp / (tp + fp) : zero_division;
    const recall = tp + fn > 0 ? tp / (tp + fn) : zero_division;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : zero_division;
    const support = tp + fn;
    perClass[label] = { precision, recall, f1, support };
  }

  const accuracy = y_true.length > 0 ? correct / y_true.length : zero_division;

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

/**
 * Equivalente a `sklearn.metrics.confusion_matrix(y_test, predictions, labels=model.classes_)`
 */
function confusion_matrix(y_true, y_pred, { labels = null } = {}) {
  const orderedLabels = labels
    ? Array.from(labels)
    : Array.from(new Set([...y_true, ...y_pred])).sort();
  const n = orderedLabels.length;
  const labelToIdx = new Map(orderedLabels.map((l, idx) => [l, idx]));
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < y_true.length; i++) {
    const r = labelToIdx.get(y_true[i]);
    const c = labelToIdx.get(y_pred[i]);
    if (r !== undefined && c !== undefined) {
      matrix[r][c]++;
    }
  }

  const numpyStyleLines = matrix.map((row, idx) => {
    const inner = row.map((v) => String(v).padStart(2)).join(' ');
    const prefix = idx === 0 ? '[[' : ' [';
    const suffix = idx === matrix.length - 1 ? ']]' : ']';
    return `${prefix}${inner}${suffix}`;
  });

  const colHeader =
    'Real \\ Pred'.padStart(12) +
    orderedLabels.map((l) => l.padStart(10)).join('');
  const tableRows = matrix.map(
    (row, idx) =>
      orderedLabels[idx].padStart(12) +
      row.map((v) => String(v).padStart(10)).join('')
  );

  return {
    labels: orderedLabels,
    matrix,
    numpyText: numpyStyleLines.join('\n'),
    tableText: [colHeader, ...tableRows].join('\n'),
  };
}

let cachedPipelineState = null;

/**
 * Entrena y evalúa el pipeline a partir de `tickets.csv` siguiendo exactamente el código del profesor:
 * - Entrena en el 80% (`X_train`, `y_train`)
 * - Evalúa en los otros 40 registros del 20% (`X_test`, `y_test`) con `classification_report` y `confusion_matrix`
 * - Prueba un mensaje nuevo con `predict` y `predict_proba(...).max()`
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

  // 1. Modelo entrenado con el 80% (160 registros) y evaluado con los otros 40 registros (20%)
  const evalModel = new Pipeline([
    ['tfidf', new TfidfVectorizer({ ngram_range: [1, 2] })],
    ['classifier', new LogisticRegression({ max_iter: 1000 })],
  ]);
  evalModel.fit(X_train, y_train);

  const predictions = evalModel.predict(X_test);
  const report = classification_report(y_test, predictions, { zero_division: 0 });
  const confMatrix = confusion_matrix(y_test, predictions, { labels: evalModel.classes_ });

  // Predicción de ejemplo del profesor sobre el modelo entrenado con X_train
  const new_message = [DEFAULT_SAMPLE_MESSAGE];
  const sampleCategory = evalModel.predict(new_message)[0];
  const sampleConfidence = Number(evalModel.predict_proba(new_message).max().toFixed(3));

  // 2. Modelo de producción para el endpoint API (entrenado con todos los registros de tickets.csv)
  const model = new Pipeline([
    ['tfidf', new TfidfVectorizer({ ngram_range: [1, 2] })],
    ['classifier', new LogisticRegression({ max_iter: 1000 })],
  ]);
  model.fit(messages, categories);

  cachedPipelineState = {
    model,
    evalModel,
    report,
    confMatrix,
    samplePrediction: {
      message: DEFAULT_SAMPLE_MESSAGE,
      category: sampleCategory,
      confidence: sampleConfidence,
    },
    datasetSize: messages.length,
    trainSize: X_train.length,
    testSize: X_test.length,
    classCounts: data.valueCounts('category'),
    vocabSize: evalModel.steps[0][1].vocabulary.size,
  };

  return cachedPipelineState;
}

function getTrainedState() {
  if (!cachedPipelineState) {
    return trainModelFromCSV(DEFAULT_CSV_PATH);
  }
  return cachedPipelineState;
}

/**
 * Predice categoría y score de confianza (`predict_proba(new_message).max()`) igual que en Scikit-Learn
 */
function predictWithConfidence(message, { useEvalModel = false } = {}) {
  const state = getTrainedState();
  const targetModel = useEvalModel ? state.evalModel : state.model;
  const new_message = [message];
  const category = targetModel.predict(new_message)[0];
  const probsMatrix = targetModel.predict_proba(new_message);
  const confidence = Number(probsMatrix.max().toFixed(3));

  const probabilities = {};
  targetModel.classes_.forEach((cls, idx) => {
    probabilities[cls] = Number(probsMatrix[0][idx].toFixed(3));
  });

  return {
    message,
    category,
    confidence,
    probabilities,
  };
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
 * entrenado con `tickets.csv`, y devuelve el contrato estándar de la API junto con el `confidence` score.
 */
async function analyzeML(message) {
  const cleanText = normalizeText(message);

  if (!cleanText) {
    return {
      category: 'BUG',
      priority: 'LOW',
      response: RESPONSES.BUG.LOW,
      requiresHumanReview: true,
      mode: 'ml',
      confidence: 0,
    };
  }

  const pred = predictWithConfidence(message);
  const category = pred.category || 'BUG';
  const priority = inferPriority(category, message);
  const baseResponse = RESPONSES[category][priority];

  return {
    category,
    priority,
    response: `${baseResponse} (Score ML: ${pred.confidence})`,
    requiresHumanReview: category === 'SECURITY',
    mode: 'ml',
    confidence: pred.confidence,
    probabilities: pred.probabilities,
  };
}

function getMLModelReport(customMessage = null) {
  const state = getTrainedState();
  const sample = customMessage
    ? predictWithConfidence(customMessage, { useEvalModel: true })
    : state.samplePrediction;

  return {
    datasetFile: 'tickets.csv',
    datasetSize: state.datasetSize,
    trainSize: state.trainSize,
    testSize: state.testSize,
    vocabSize: state.vocabSize,
    classes: state.evalModel.classes_,
    classCounts: state.classCounts,
    accuracy: state.report.accuracy,
    perClass: state.report.perClass,
    classificationReport: state.report.text,
    confusionMatrix: state.confMatrix.matrix,
    confusionMatrixText: state.confMatrix.numpyText,
    confusionMatrixTable: state.confMatrix.tableText,
    samplePrediction: sample,
  };
}

if (require.main === module) {
  const customMsg = process.argv.slice(2).join(' ').trim() || null;
  const info = getMLModelReport(customMsg);

  console.log('====================================================================');
  console.log('  EVALUACIÓN DEL MODELO ML CON LOS 40 REGISTROS DE PRUEBA (20%)');
  console.log('====================================================================');
  console.log(`Archivo CSV:            ${info.datasetFile}`);
  console.log(`Partición estratificada: Total ${info.datasetSize} -> X_train: ${info.trainSize} (80%) | X_test: ${info.testSize} (20%)`);
  console.log(`Clases (model.classes_): [${info.classes.join(', ')}]`);
  console.log('--------------------------------------------------------------------');
  console.log('1) classification_report(y_test, predictions, zero_division=0):');
  console.log('--------------------------------------------------------------------');
  console.log(info.classificationReport);
  console.log('--------------------------------------------------------------------');
  console.log('2) confusion_matrix(y_test, predictions, labels=model.classes_):');
  console.log('--------------------------------------------------------------------');
  console.log(info.confusionMatrixText);
  console.log('\nDetalle de Matriz de Confusión (Filas = Real, Columnas = Predicción):');
  console.log(info.confusionMatrixTable);
  console.log('--------------------------------------------------------------------');
  console.log(`3) Predicción de mensaje nuevo: ["${info.samplePrediction.message}"]`);
  console.log('--------------------------------------------------------------------');
  console.log(`Categoría: ${info.samplePrediction.category}`);
  console.log(`Score aproximado: ${info.samplePrediction.confidence}`);
  console.log('====================================================================');
}

module.exports = {
  analyze: analyzeML,
  analyzeML,
  trainModelFromCSV,
  getMLModelReport,
  predictWithConfidence,
  pd,
  train_test_split,
  TfidfVectorizer,
  LogisticRegression,
  Pipeline,
  classification_report,
  confusion_matrix,
};
