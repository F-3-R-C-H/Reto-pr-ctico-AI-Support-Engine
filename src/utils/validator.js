const CATEGORIES = ['ACCESS', 'BUG', 'FEATURE', 'SECURITY'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const MODES = ['traditional', 'generative'];
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Valida la petición entrante de POST /api/analyze.
 * @returns {{ valid: boolean, errors: string[], data?: { message: string, mode: string } }}
 */
function validateRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: ['El cuerpo de la petición debe ser un objeto JSON'] };
  }

  const { message, mode } = body;

  if (typeof message !== 'string') {
    errors.push('"message" es obligatorio y debe ser texto');
  } else if (message.trim().length === 0) {
    errors.push('"message" no puede estar vacío');
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.push(`"message" no puede exceder ${MAX_MESSAGE_LENGTH} caracteres`);
  }

  if (typeof mode !== 'string' || !MODES.includes(mode)) {
    errors.push(`"mode" debe ser uno de: ${MODES.join(', ')}`);
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], data: { message: message.trim(), mode } };
}

/**
 * Valida el resultado de un motor contra el contrato único de respuesta.
 * Lanza un Error con code 'INVALID_ENGINE_OUTPUT' si no lo cumple.
 * Aplica la regla dura: SECURITY => requiresHumanReview = true.
 * Devuelve un objeto nuevo con solo las llaves del contrato.
 */
function validateEngineOutput(result, mode) {
  const fail = (reason) => {
    const err = new Error(`Salida del motor inválida: ${reason}`);
    err.code = 'INVALID_ENGINE_OUTPUT';
    throw err;
  };

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    fail('no es un objeto');
  }
  if (!CATEGORIES.includes(result.category)) {
    fail('category fuera de los valores permitidos');
  }
  if (!PRIORITIES.includes(result.priority)) {
    fail('priority fuera de los valores permitidos');
  }
  if (typeof result.response !== 'string' || result.response.trim() === '') {
    fail('response debe ser un texto no vacío');
  }
  if (typeof result.requiresHumanReview !== 'boolean') {
    fail('requiresHumanReview debe ser booleano');
  }

  return {
    category: result.category,
    priority: result.priority,
    response: result.response.trim(),
    // Regla dura de seguridad: no depende de lo que diga el LLM
    requiresHumanReview: result.category === 'SECURITY' ? true : result.requiresHumanReview,
    mode, // el modo siempre es el solicitado y ya validado
  };
}

module.exports = {
  CATEGORIES,
  PRIORITIES,
  MODES,
  MAX_MESSAGE_LENGTH,
  validateRequest,
  validateEngineOutput,
};
