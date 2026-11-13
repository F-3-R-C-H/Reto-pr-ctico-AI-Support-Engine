const express = require('express');
const { validateRequest, validateEngineOutput } = require('../utils/validator');

const router = express.Router();

// Los motores se cargan bajo demanda para que la API pueda levantarse
// aunque la rama de otro integrante todavía no esté fusionada.
// Contrato esperado: cada motor exporta `analyze(message)` (async) o una función.
const ENGINE_FILES = {
  traditional: '../engines/traditional.engine',
  generative: '../engines/generative.engine',
};

function loadEngine(mode) {
  const mod = require(ENGINE_FILES[mode]);
  const fn = typeof mod === 'function' ? mod : mod.analyze;
  if (typeof fn !== 'function') {
    const err = new Error(`El motor "${mode}" no exporta una función analyze`);
    err.code = 'ENGINE_NOT_IMPLEMENTED';
    throw err;
  }
  return fn;
}

router.post('/analyze', async (req, res) => {
  const validation = validateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Solicitud inválida', details: validation.errors });
  }

  const { message, mode } = validation.data;

  let engine;
  try {
    engine = loadEngine(mode);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ENGINE_NOT_IMPLEMENTED') {
      return res.status(501).json({ error: `El motor "${mode}" aún no está disponible` });
    }
    console.error('[analyze] Error al cargar el motor:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  try {
    const raw = await engine(message);
    const result = validateEngineOutput(raw, mode);
    return res.status(200).json(result);
  } catch (err) {
    // Se registra solo el mensaje (sin stack ni claves) y se responde algo genérico.
    console.error(`[analyze] Fallo en motor ${mode}:`, err.code || '', err.message);

    if (err.code === 'INVALID_ENGINE_OUTPUT') {
      return res.status(502).json({ error: 'El motor devolvió una respuesta con formato inválido' });
    }
    return res.status(502).json({ error: 'No se pudo procesar la solicitud con el proveedor de IA. Intente de nuevo más tarde.' });
  }
});

module.exports = router;
