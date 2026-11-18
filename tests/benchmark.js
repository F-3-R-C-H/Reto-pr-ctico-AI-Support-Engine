#!/usr/bin/env node
'use strict';

/**
 * Requerimiento 5: Pruebas comparativas y Benchmark automatizado (Entrega 2)
 * Autor: Fernando Vázquez (@F-3-R-C-H)
 * Rama: feat/fernando-generative
 *
 * Ejecuta los casos de prueba de tests/test-cases.json contra ambos motores:
 * 1. Motor Tradicional (src/engines/traditional.engine.js)
 * 2. Motor Generativo (src/engines/generative.engine.js)
 *
 * Para cada motor registra:
 * - Categoría obtenida
 * - Prioridad asignada
 * - Cumplimiento del formato JSON esperado
 * - Si el resultado fue correcto de acuerdo con la clasificación de referencia
 * - Porcentaje de clasificaciones correctas de cada motor
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const { analyzeTraditional } = require('../src/engines/traditional.engine');
const analyzeGenerative = require('../src/engines/generative.engine');
const { validateEngineOutput } = require('../src/utils/validator');

const testCasesPath = path.join(__dirname, 'test-cases.json');
const testSuite = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));
const cases = testSuite.cases || [];

const VALID_CATEGORIES = ['ACCESS', 'BUG', 'FEATURE', 'SECURITY'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica que la salida cumpla estrictamente el contrato JSON de POST /api/analyze
 */
function checkFormat(result, mode) {
  try {
    const validated = validateEngineOutput(result, mode);
    return (
      VALID_CATEGORIES.includes(validated.category) &&
      VALID_PRIORITIES.includes(validated.priority) &&
      typeof validated.response === 'string' &&
      validated.response.length > 0 &&
      typeof validated.requiresHumanReview === 'boolean' &&
      validated.mode === mode
    );
  } catch (_) {
    return false;
  }
}

async function runBenchmark() {
  console.log('='.repeat(84));
  console.log('  AI SUPPORT ENGINE — SUITE DE PRUEBAS COMPARATIVAS (REQUERIMIENTO 5)');
  console.log('='.repeat(84));
  console.log(`Total de casos de prueba: ${cases.length}\n`);

  const hasApiKey = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'tu_api_key_aqui' &&
      process.env.GEMINI_API_KEY !== 'tu_api_key_de_gemini_aqui'
  );

  if (!hasApiKey) {
    console.warn('⚠️  AVISO: No se detectó una GEMINI_API_KEY configurada en el archivo .env.');
    console.warn('   Configura GEMINI_API_KEY en tu archivo .env para evaluar el motor generativo en vivo.\n');
  }

  const results = [];
  let tradCorrect = 0;
  let genCorrect = 0;
  let tradCategoryCorrect = 0;
  let genCategoryCorrect = 0;
  let tradFormatOk = 0;
  let genFormatOk = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const { id, type, message, expected } = testCase;

    // 1. Ejecutar Motor Tradicional
    let tradResult = null;
    let tradError = null;
    const t0Trad = Date.now();
    try {
      tradResult = analyzeTraditional(message);
    } catch (err) {
      tradError = err.message;
    }
    const tradLatencyMs = Date.now() - t0Trad;

    const tradFmt = tradResult ? checkFormat(tradResult, 'traditional') : false;
    if (tradFmt) tradFormatOk++;

    const tradCatMatch = Boolean(tradResult && tradResult.category === expected.category);
    if (tradCatMatch) tradCategoryCorrect++;

    const tradMatch = Boolean(
      tradResult &&
        tradResult.category === expected.category &&
        tradResult.priority === expected.priority &&
        tradResult.requiresHumanReview === expected.requiresHumanReview
    );
    if (tradMatch) tradCorrect++;

    // 2. Ejecutar Motor Generativo
    let genResult = null;
    let genError = null;
    const t0Gen = Date.now();
    try {
      genResult = await analyzeGenerative(message);
    } catch (err) {
      genError = err.message;
    }
    const genLatencyMs = Date.now() - t0Gen;

    const genFmt = genResult ? checkFormat(genResult, 'generative') : false;
    if (genFmt) genFormatOk++;

    const genCatMatch = Boolean(genResult && genResult.category === expected.category);
    if (genCatMatch) genCategoryCorrect++;

    const genMatch = Boolean(
      genResult &&
        genResult.category === expected.category &&
        genResult.priority === expected.priority &&
        genResult.requiresHumanReview === expected.requiresHumanReview
    );
    if (genMatch) genCorrect++;

    results.push({
      id,
      type,
      message,
      expected,
      traditional: {
        result: tradResult,
        formatValid: tradFmt,
        categoryCorrect: tradCatMatch,
        exactCorrect: tradMatch,
        latencyMs: tradLatencyMs,
        error: tradError,
      },
      generative: {
        result: genResult,
        formatValid: genFmt,
        categoryCorrect: genCatMatch,
        exactCorrect: genMatch,
        latencyMs: genLatencyMs,
        error: genError,
      },
    });

    const statusTrad = tradMatch ? '✅ CORRECTO' : '❌ DIFERENTE';
    const statusGen = genMatch ? '✅ CORRECTO' : genError ? '⚠️ ERROR API' : '❌ DIFERENTE';

    console.log(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${id} (${type})`);
    console.log(`     Mensaje:     "${message}"`);
    console.log(
      `     Referencia:  [${expected.category} | ${expected.priority} | review:${expected.requiresHumanReview}]`
    );
    console.log(
      `     Tradicional: [${tradResult?.category || 'N/A'} | ${tradResult?.priority || 'N/A'} | fmt:${tradFmt ? 'OK' : 'NO'}] (${tradLatencyMs}ms) -> ${statusTrad}`
    );
    console.log(
      `     Generativo:  [${genResult?.category || 'N/A'} | ${genResult?.priority || 'N/A'} | fmt:${genFmt ? 'OK' : 'NO'}] (${genLatencyMs}ms) -> ${statusGen}`
    );
    if (genResult?.response) {
      console.log(`     Resp. Gen.:  "${genResult.response}"`);
    } else if (genError) {
      console.log(`     Detalle Gen: ${genError}`);
    }
    console.log('');

    // Pausa breve entre llamadas a Gemini para evitar saturar el límite por minuto (RPM) de capa gratuita
    if (hasApiKey && i < cases.length - 1) {
      await sleep(800);
    }
  }

  const tradAccuracy = ((tradCorrect / cases.length) * 100).toFixed(2);
  const genAccuracy = ((genCorrect / cases.length) * 100).toFixed(2);
  const tradCatAccuracy = ((tradCategoryCorrect / cases.length) * 100).toFixed(2);
  const genCatAccuracy = ((genCategoryCorrect / cases.length) * 100).toFixed(2);

  console.log('='.repeat(84));
  console.log('  TABLA COMPARATIVA DE RESULTADOS (MARKDOWN)');
  console.log('='.repeat(84));
  console.log(
    '| # | Caso (Tipo) | Referencia (Cat / Prio) | Motor Tradicional | Formato Trad. | Correcto Trad. | Motor Generativo | Formato Gen. | Correcto Gen. |'
  );
  console.log(
    '| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :---: | :---: |'
  );

  results.forEach((r, idx) => {
    const refStr = `\`${r.expected.category}\` / \`${r.expected.priority}\``;
    const tradStr = r.traditional.result
      ? `\`${r.traditional.result.category}\` / \`${r.traditional.result.priority}\``
      : 'Error';
    const genStr = r.generative.result
      ? `\`${r.generative.result.category}\` / \`${r.generative.result.priority}\``
      : 'Sin API Key / Error';

    console.log(
      `| ${idx + 1} | \`${r.id}\` (${r.type}) | ${refStr} | ${tradStr} | ${
        r.traditional.formatValid ? 'Sí ✅' : 'No ❌'
      } | ${r.traditional.exactCorrect ? 'Sí ✅' : 'No ❌'} | ${genStr} | ${
        r.generative.formatValid ? 'Sí ✅' : 'No ❌'
      } | ${r.generative.exactCorrect ? 'Sí ✅' : 'No ❌'} |`
    );
  });

  console.log('\n' + '='.repeat(84));
  console.log('  RESUMEN DE MÉTRICAS Y EXACTITUD');
  console.log('='.repeat(84));
  console.log('Motor Tradicional:');
  console.log(`  - Exactitud por Categoría:              ${tradCategoryCorrect}/${cases.length} (${tradCatAccuracy}%)`);
  console.log(`  - Exactitud Total (Cat + Prio + Rev):   ${tradCorrect}/${cases.length} (${tradAccuracy}%)`);
  console.log(`  - Cumplimiento de Contrato JSON:        ${tradFormatOk}/${cases.length} (${((tradFormatOk / cases.length) * 100).toFixed(2)}%)`);
  console.log('\nMotor Generativo (Gemini API):');
  console.log(`  - Exactitud por Categoría:              ${genCategoryCorrect}/${cases.length} (${genCatAccuracy}%)`);
  console.log(`  - Exactitud Total (Cat + Prio + Rev):   ${genCorrect}/${cases.length} (${genAccuracy}%)`);
  console.log(`  - Cumplimiento de Contrato JSON:        ${genFormatOk}/${cases.length} (${((genFormatOk / cases.length) * 100).toFixed(2)}%)`);
  console.log('='.repeat(84));

  return {
    total: cases.length,
    tradCorrect,
    genCorrect,
    tradAccuracy,
    genAccuracy,
    results,
  };
}

if (require.main === module) {
  runBenchmark().catch((err) => {
    console.error('Error fatal durante el benchmark:', err.message);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
