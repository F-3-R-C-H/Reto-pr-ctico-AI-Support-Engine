# Plan Estratégico — Tercer Camino: Machine Learning (`tickets.csv` + TF-IDF + Regresión Logística)

Este documento define la organización del equipo para integrar el **tercer camino de clasificación con Machine Learning clásico** (basado en el dataset `tickets.csv` de dos columnas para Excel, vectorización `TfidfVectorizer(ngram_range=(1, 2))` y clasificador `LogisticRegression(max_iter=1000)`), junto con la interfaz web sencilla para pruebas.

---

## 1. Arquitectura del Tercer Camino (`mode: "ml"`)

El flujo implementado replica en JavaScript/Node.js exactamente el pipeline del profesor:

1. **Carga de datos tipo Pandas (`pd.read_csv("tickets.csv")`)**:
   - Lee el archivo `tickets.csv` (editable en Excel) con dos columnas: `message` y `category` (`ACCESS`, `BUG`, `FEATURE`, `SECURITY`).
2. **Partición estratificada (`train_test_split`)**:
   - Divide el dataset en **80% entrenamiento (`X_train`, `y_train`)** y **20% prueba (`X_test`, `y_test`)** con `test_size=0.2`, `stratify=data["category"]` y semilla fija `random_state=42`.
3. **Pipeline de Machine Learning (`Pipeline`)**:
   - `("tfidf", TfidfVectorizer(ngram_range=(1, 2)))`: extrae unigramas y bigramas, calcula pesos TF-IDF con suavizado e IDF logarítmico, y normaliza con norma L2.
   - `("classifier", LogisticRegression(max_iter=1000))`: entrena un clasificador lineal multinomial (Softmax + regularización L2) hasta 1000 iteraciones y expone `model.classes_`.
4. **Evaluación con los 40 registros de prueba (`X_test`, `y_test`)**:
   - `classification_report(y_test, predictions, zero_division=0)`: calcula `precision`, `recall`, `f1-score`, `support` y `accuracy` sobre los 40 registros (20%).
   - `confusion_matrix(y_test, predictions, labels=model.classes_)`: genera la matriz de confusión 4x4 tanto en formato NumPy (`[[10 0 0 0] ...]`) como en tabla etiquetada.
   - `model.predict(new_message)[0]` y `model.predict_proba(new_message).max()`: devuelve la categoría predicha y el **Score aproximado** redondeado a 3 decimales (`npm run train:ml` o `GET /api/ml-report`).

---

## 2. División Estratégica por Integrante

### 👤 1. Danna Tobón Mosqueda — Dataset CSV (`tickets.csv`) y Pruebas de Calidad
- **Rama sugerida:** `feat/danna-ml-dataset`
- **Archivos a cargo:**
  - `tickets.csv`
  - `tests/test-cases.json`
- **Responsabilidades:**
  1. Curar y mantener el archivo `tickets.csv` (compatible con Excel) con las dos columnas obligatorias: `message` y `category`.
  2. Garantizar que las 4 categorías (`ACCESS`, `BUG`, `FEATURE`, `SECURITY`) estén balanceadas (**50 ejemplos por clase, 200 registros en total**) para que `stratify=data["category"]` funcione de forma óptima (160 de entrenamiento / 40 de prueba).
  3. Verificar que los casos normales, ambiguos y adversariales estén representados sin duplicar texto exacto innecesario.
- **Comando de verificación:**
  ```powershell
  npm run train:ml
  ```

---

### 👤 2. Fernando Vázquez Valeriano — Motor de Machine Learning y Benchmark Triple
- **Rama sugerida:** `feat/fernando-ml-engine`
- **Archivos a cargo:**
  - `src/engines/ml.engine.js`
  - `scripts/train_sklearn.py`
  - `tests/benchmark.js`
- **Responsabilidades:**
  1. Implementar el motor `src/engines/ml.engine.js` con el lector DataFrame (`pd.read_csv`), `train_test_split`, `TfidfVectorizer(ngram_range=(1, 2))`, `LogisticRegression(max_iter=1000)` y `classification_report`.
  2. Conectar la predicción del modelo ML con el contrato JSON del proyecto (`category`, `priority`, `response`, `requiresHumanReview`, `mode: "ml"`).
  3. Actualizar `tests/benchmark.js` para evaluar y comparar simultáneamente los **3 motores** (`traditional`, `ml`, `generative`).
- **Comandos de verificación:**
  ```powershell
  npm run train:ml
  npm run benchmark
  ```

---

### 👤 3. Tonantzin Valentín Hernández — Integración en API, Validador e Interfaz Visual
- **Rama sugerida:** `feat/tonantzin-ml-ui`
- **Archivos a cargo:**
  - `src/utils/validator.js`
  - `src/routes/analyze.routes.js`
  - `src/server.js`
  - `public/index.html`
- **Responsabilidades:**
  1. Habilitar el modo `"ml"` en `src/utils/validator.js` (`MODES = ['traditional', 'generative', 'ml']`).
  2. Registrar el motor `ml` en `POST /api/analyze` y exponer el endpoint `GET /api/ml-report` en `src/routes/analyze.routes.js`.
  3. Configurar `express.static('public')` en `src/server.js` y presentar la interfaz web clásica en `public/index.html` para probar los 3 motores desde el navegador sin depender de herramientas externas.
- **Comando de verificación:**
  ```powershell
  npm start
  ```
  Abrir en el navegador: `http://localhost:3000`
