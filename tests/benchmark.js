#!/usr/bin/env node
'use strict';

/**
 * Requerimiento 5: Pruebas comparativas y Benchmark automatizado
 * Autor: Fernando Vázquez (@F-3-R-C-H)
 *
 * Ejecuta los casos de prueba de tests/test-cases.json contra ambos motores:
 * 1. Motor Tradicional (src/engines/traditional.engine.js)
 * 2. Motor Generativo (src/engines/generative.engine.js)
 *
 * Registra categoría, prioridad, cumplimiento del formato y calcula
 * el porcentaje de clasificaciones correctas de cada motor.
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
  console.log('='.repeat(80));
  console.log('  AI SUPPORT ENGINE — BENCHMARK Y PRUEBAS COMPARATIVAS');
  console.log('='.repeat(80));
  console.log(`Total de casos a evaluar: ${cases.length}\n`);

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'tu_api_key_aqui');
  if (!hasApiKey) {
    console.warn('⚠️  AVISO: No se detectó GEMINI_API_KEY en .env.');
    console.warn('   El motor generativo se ejecutará en modo seguro/fallback si falla la conexión.\n');
  }

  const results = [];
  let tradCorrect = 0;
  let genCorrect = 0;
  let tradFormatOk = 0;
  let genFormatOk = 0;

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const { id, type, message, expected } = testCase;

    // 1. Ejecutar Motor Tradicional
    let tradResult = null;
    let tradError = null;
    try {
      tradResult = analyzeTraditional(message);
    } catch (err) {
      tradError = err.message;
    }

    const tradFmt = tradResult ? checkFormat(tradResult, 'traditional') : false;
    if (tradFmt) tradFormatOk++;

    const tradMatch =
      tradResult &&
      tradResult.category === expected.category &&
      tradResult.priority === expected.priority;
    if (tradMatch) tradCorrect++;

    // 2. Ejecutar Motor Generativo
    let genResult = null;
    let genError = null;
    try {
      genResult = await analyzeGenerative(message);
    } catch (err) {
      genError = err.message;
    }

    const genFmt = genResult ? checkFormat(genResult, 'generative') : false;
    if (genFmt) genFormatOk++;

    const genMatch =
      genResult &&
      genResult.category === expected.category &&
      genResult.priority === expected.priority;
    if (genMatch) genCorrect++;

    results.push({
      id,
      type,
      message,
      expected,
      trad: { result: tradResult, ok: tradMatch, fmt: tradFmt, err: tradError },
      gen: { result: genResult, ok: genMatch, fmt: genFmt, err: genError }
    });

    const statusTrad = tradMatch ? '✅ PASS' : '❌ FAIL';
    const statusGen = genMatch ? '✅ PASS' : (genError ? '⚠️ ERR' : '❌ FAIL');
    console.log(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${id} (${type})`);
    console.log(`     Esperado:    [${expected.category} | ${expected.priority}]`);
    console.log(`     Tradicional: [${tradResult?.category || 'N/A'} | ${tradResult?.priority || 'N/A'}] -> ${statusTrad}`);
    console.log(`     Generativo:  [${genResult?.category || 'N/A'} | ${genResult?.priority || 'N/A'}] -> ${statusGen}\n`);
  }

  const tradAccuracy = ((tradCorrect / cases.length) * 100).toFixed(2);
  const genAccuracy = ((genCorrect / cases.length) * 100).toFixed(2);

  console.log('='.repeat(80));
  console.log('  RESUMEN DE MÉTRICAS Y RESULTADOS');
  console.log('='.repeat(80));
  console.log(`Motor Tradicional:`);
  console.log(`  - Clasificaciones correctas: ${tradCorrect}/${cases.length} (${tradAccuracy}%)`);
  console.log(`  - Cumplimiento de formato:   ${tradFormatOk}/${cases.length}`);
  console.log(`\nMotor Generativo:`);
  console.log(`  - Clasificaciones correctas: ${genCorrect}/${cases.length} (${genAccuracy}%)`);
  console.log(`  - Cumplimiento de formato:   ${genFormatOk}/${cases.length}`);
  console.log('='.repeat(80));

  return {
    total: cases.length,
    tradCorrect,
    genCorrect,
    tradAccuracy,
    genAccuracy,
    results
  };
}

if (require.main === module) {
  runBenchmark().catch((err) => {
    console.error('Error fatal durante el benchmark:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
