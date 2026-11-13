require('dotenv').config();

const express = require('express');
const cors = require('cors');
const analyzeRoutes = require('./routes/analyze.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Límite de tamaño del body para evitar payloads gigantes
app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', analyzeRoutes);

// 404 para rutas inexistentes
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador global de errores (JSON mal formado, body muy grande, etc.)
// Nunca se devuelve el stack ni información interna.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }
  console.error('[server] Error no controlado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI Support Engine escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
