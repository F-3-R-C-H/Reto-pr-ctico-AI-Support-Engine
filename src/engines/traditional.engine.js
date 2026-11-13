'use strict';

const CATEGORY_RULES = {
  ACCESS: [
    { pattern: /\b(no puedo|no me deja) (iniciar sesion|entrar|acceder)\b/, weight: 6 },
    { pattern: /\b(iniciar sesion|inicio de sesion|login|autenticacion)\b/, weight: 3 },
    { pattern: /\b(contrasena|credenciales|usuario bloqueado|cuenta bloqueada)\b/, weight: 4 },
    { pattern: /\b(acceso denegado|sin acceso|permiso|permisos|cuenta|usuario)\b/, weight: 2 },
  ],
  BUG: [
    { pattern: /\b(no funciona|dejo de funcionar|se rompio|se cierra|se congela)\b/, weight: 5 },
    { pattern: /\b(pantalla (en )?blanc[oa]|excepcion|error 5\d\d|error 4\d\d)\b/, weight: 5 },
    { pattern: /\b(error|falla|fallo|bug|defecto|lentitud)\b/, weight: 3 },
    { pattern: /\b(caido|caida|indisponible|intermitente|no carga)\b/, weight: 3 },
  ],
  FEATURE: [
    { pattern: /\b(me gustaria|quisiera|sugiero|sugerencia)\b/, weight: 4 },
    { pattern: /\b(agregar|anadir|implementar|incorporar|nueva funcion|funcionalidad)\b/, weight: 4 },
    { pattern: /\b(mejora|mejorar|modo oscuro|integracion|exportar)\b/, weight: 3 },
    { pattern: /\b(color|boton|diseno|visual|cosmetic[oa])\b/, weight: 2 },
  ],
  SECURITY: [
    { pattern: /\b(fuga|filtracion|robo|exposicion) de (datos|informacion|credenciales)\b/, weight: 9 },
    { pattern: /\b(datos|informacion|credenciales) (filtrados|expuestos|robados)\b/, weight: 9 },
    { pattern: /\b(vulnerabilidad|hackeo|hackeado|phishing|malware|ransomware)\b/, weight: 7 },
    { pattern: /\b(acceso no autorizado|contrasena expuesta|informacion confidencial)\b/, weight: 8 },
    { pattern: /\b(sql injection|inyeccion sql|xss|csrf|brecha de seguridad)\b/, weight: 8 },
  ],
};

// Estas expresiones tienen precedencia absoluta sobre cualquier instrucción incluida en el mensaje.
const INJECTION_PATTERNS = [
  /\bignora (?:todas? )?(?:las )?instrucciones\b/,
  /\b(omite|desobedece|cambia|modifica) (?:tus |las )?(?:reglas|instrucciones)\b/,
  /\bclasifica(?:lo| esto)? como (?:prioridad )?(?:baja|low)\b/,
  /\b(no (?:lo )?reportes|no informes|oculta (?:este|el) incidente)\b/,
  /\b(?:revela|muestra) (?:tu )?(?:prompt|instrucciones internas)\b/,
];

const CRITICAL_SECURITY_PATTERNS = [
  /\b(fuga|filtracion|robo|exposicion) de (datos|informacion|credenciales)\b/,
  /\b(datos|informacion|credenciales) (filtrados|expuestos|robados)\b/,
  /\b(vulnerabilidad|brecha) (activa|explotada|explotable)\b/,
  /\b(acceso no autorizado|hackeo|hackeado|malware|ransomware)\b/,
  /\bcontrasena expuesta\b/,
  /\b(en este momento|ahora mismo|en curso)\b/,
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
];

const COSMETIC_PATTERNS = [
  /\b(color|tipografia|tamano|alineacion|diseno|visual|cosmetic[oa]|modo oscuro)\b/,
  /\b(bot[oó]n|icono)\b/,
];

const RESPONSES = {
  ACCESS: {
    LOW: 'Gracias por su consulta de acceso. Revisaremos la información disponible para orientarle sin solicitar datos sensibles.',
    MEDIUM: 'Hemos identificado un problema de acceso. Verifique los datos no sensibles de su cuenta y utilice el proceso oficial de recuperación si corresponde.',
    HIGH: 'Hemos registrado un bloqueo importante de acceso con prioridad alta. El equipo responsable deberá validar la cuenta y los permisos mediante el canal autorizado.',
    CRITICAL: 'Hemos registrado una interrupción crítica de acceso. El caso requiere atención prioritaria del equipo responsable mediante los canales autorizados.',
  },
  BUG: {
    LOW: 'Gracias por la información. Registramos la consulta para revisar el comportamiento descrito y solicitar detalles técnicos si fueran necesarios.',
    MEDIUM: 'Hemos registrado el error funcional. Revisaremos el comportamiento reportado y su impacto para determinar la corrección adecuada.',
    HIGH: 'Hemos registrado una falla grave que afecta el trabajo. El equipo técnico la atenderá con prioridad alta y evaluará medidas de recuperación.',
    CRITICAL: 'Hemos registrado una interrupción crítica del servicio. El equipo técnico debe atenderla de inmediato y verificar la recuperación de la operación.',
  },
  FEATURE: {
    LOW: 'Gracias por la sugerencia. La registramos para evaluar su utilidad, alcance y posible incorporación en futuras mejoras.',
    MEDIUM: 'Gracias por proponer esta funcionalidad. El equipo de producto evaluará su impacto, alcance y prioridad dentro de la planificación.',
    HIGH: 'Hemos registrado la solicitud de mejora para una evaluación prioritaria de producto, considerando su impacto operativo.',
    CRITICAL: 'Hemos registrado la solicitud. El equipo de producto revisará su alcance; la urgencia indicada no implica por sí sola un incidente técnico.',
  },
  SECURITY: {
    LOW: 'Hemos registrado el reporte de seguridad. Será revisado por el equipo responsable; no comparta contraseñas ni información confidencial.',
    MEDIUM: 'Hemos registrado el posible riesgo de seguridad. Una persona del equipo responsable revisará el caso; no envíe contraseñas ni datos confidenciales.',
    HIGH: 'Hemos registrado un incidente de seguridad de alta prioridad. El equipo responsable realizará una revisión humana; no comparta ni exponga contraseñas.',
    CRITICAL: 'Hemos registrado un incidente crítico de seguridad. Será revisado de inmediato por una persona del equipo responsable; no comparta ni exponga contraseñas o información confidencial.',
  },
};

function normalizeText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function calculateScores(text) {
  return Object.fromEntries(
    Object.entries(CATEGORY_RULES).map(([category, rules]) => [
      category,
      rules.reduce(
        (score, rule) => score + (rule.pattern.test(text) ? rule.weight : 0),
        0
      ),
    ])
  );
}

function selectCategory(scores) {
  const highestScore = Math.max(...Object.values(scores));
  if (highestScore === 0) return null;

  // Cualquier señal explícita de seguridad prevalece sobre las demás categorías.
  if (scores.SECURITY > 0) return 'SECURITY';

  const tied = Object.keys(scores).filter((category) => scores[category] === highestScore);
  // Seguridad gana cualquier empate; FEATURE queda al final. ACCESS gana empates exactos con BUG.
  return ['SECURITY', 'ACCESS', 'BUG', 'FEATURE'].find((category) => tied.includes(category));
}

function selectPriority(category, text) {
  if (category === 'SECURITY') {
    return matchesAny(text, CRITICAL_SECURITY_PATTERNS) ? 'CRITICAL' : 'HIGH';
  }

  if (matchesAny(text, CRITICAL_OPERATION_PATTERNS)) return 'CRITICAL';
  if (matchesAny(text, HIGH_IMPACT_PATTERNS)) return 'HIGH';

  if (category === 'FEATURE') {
    return matchesAny(text, COSMETIC_PATTERNS) ? 'LOW' : 'MEDIUM';
  }

  if (category === 'ACCESS') {
    return /\b(contrasena|credenciales|iniciar sesion|inicio de sesion|login)\b/.test(text)
      ? 'MEDIUM'
      : 'LOW';
  }

  return 'MEDIUM';
}

function buildResult(category, priority, requiresHumanReview = false) {
  return {
    category,
    priority,
    response: RESPONSES[category][priority],
    requiresHumanReview: category === 'SECURITY' || requiresHumanReview,
    mode: 'traditional',
  };
}

/**
 * Clasifica solicitudes mediante reglas simbólicas, sin servicios ni dependencias externas.
 * Siempre devuelve el contrato completo, incluso para entradas inválidas o ambiguas.
 */
function analyzeTraditional(message) {
  const text = normalizeText(message);

  if (!text) return buildResult('BUG', 'LOW', true);

  // Una manipulación detectada se trata siempre como incidente crítico de seguridad.
  if (matchesAny(text, INJECTION_PATTERNS)) {
    return buildResult('SECURITY', 'CRITICAL');
  }

  const category = selectCategory(calculateScores(text));
  if (!category) return buildResult('BUG', 'LOW', true);

  return buildResult(category, selectPriority(category, text));
}

module.exports = { analyzeTraditional };
