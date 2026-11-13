# AI Support Engine

Prototipo de clasificación inteligente de solicitudes de soporte con dos motores: **tradicional** (reglas) y **generativo** (Gemini API).

**Equipo:** Fernando Vázquez, Danna Tobon y Tonantzin Valentin.

## Requisitos
- Node.js 18 o superior
- Una API key de Gemini (solo para el modo `generative`)

## Instalación
```bash
git clone https://github.com/F-3-R-C-H/Reto-pr-ctico-AI-Support-Engine.git
cd Reto-pr-ctico-AI-Support-Engine
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```
Edita `.env` y coloca tu clave (nunca se sube al repositorio):
```
GEMINI_API_KEY=tu_api_key_aqui
PORT=3000
```

## Ejecución
```bash
npm start            # levanta el servidor en http://localhost:3000
npm run benchmark    # corre los 10+ casos contra ambos motores
```

## Endpoint
`POST /api/analyze`

Petición:
```json
{ "message": "No puedo iniciar sesión", "mode": "traditional" }
```
`mode` solo acepta `traditional` o `generative`. `message` es obligatorio, texto, no vacío y de máximo 2000 caracteres.

Respuesta (mismo contrato en ambos modos):
```json
{
  "category": "ACCESS",
  "priority": "MEDIUM",
  "response": "Lamentamos el inconveniente. Verifique sus credenciales...",
  "requiresHumanReview": false,
  "mode": "traditional"
}
```

### Códigos de error
| Código | Cuándo |
|---|---|
| 400 | JSON mal formado, `message` inválido o `mode` inválido |
| 413 | Body mayor a 10 KB |
| 501 | El motor solicitado aún no está disponible |
| 502 | Falla del proveedor de IA o respuesta del motor con formato inválido |
| 500 | Error interno inesperado |

## Validación y seguridad
- Validación de entrada en `src/utils/validator.js` (tipo, vacío, longitud, modo).
- La salida de cada motor se valida contra el contrato (categorías y prioridades permitidas, tipos correctos).
- Regla dura: si `category === "SECURITY"`, `requiresHumanReview` siempre es `true`, sin importar lo que diga el LLM.
- Los errores del proveedor se devuelven como mensajes genéricos; no se exponen trazas ni la API key.
- `.env` está en `.gitignore`; solo se versiona `.env.example`.

## Evidencia de ejecución
### Motor tradicional
> Pega aquí la captura o el log de una petición real con `mode: "traditional"`.

### Motor generativo
> Pega aquí la captura o el log de una petición real con `mode: "generative"`.

## Resultados comparativos
> Pega aquí la tabla generada por `npm run benchmark` y el % de exactitud de cada motor.

## Conclusión técnica
> Máximo 150 palabras (redactada por Fernando con los resultados finales).
