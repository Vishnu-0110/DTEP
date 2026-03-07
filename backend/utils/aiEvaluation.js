const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const PREFERRED_MODEL = 'gemini-1.5-flash';
const MODEL_SEQUENCE = [PREFERRED_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash'];

const parseJsonFromText = (text) => {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    // Keep trying below.
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_) {
      // Keep trying below.
    }
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_) {
      return null;
    }
  }

  return null;
};

const normalizeResult = (rawText, modelName) => {
  const parsed = parseJsonFromText(rawText) || {};
  const marksNumber = Number(parsed.marks);

  return {
    marks: Number.isFinite(marksNumber) ? Math.max(0, Math.min(10, marksNumber)) : null,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback.trim() : 'AI feedback unavailable.',
    missingPoints: typeof parsed.missingPoints === 'string' ? parsed.missingPoints.trim() : '',
    raw: rawText,
    model: modelName,
  };
};

const normalizeDetailedResult = (rawText, modelName) => {
  const parsed = parseJsonFromText(rawText) || {};
  const scoreNumber = Number(parsed.score);

  return {
    score: Number.isFinite(scoreNumber) ? Math.max(0, Math.min(100, Math.round(scoreNumber))) : null,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : 'AI evaluation summary unavailable.',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((v) => String(v).trim()).filter(Boolean) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map((v) => String(v).trim()).filter(Boolean) : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map((v) => String(v).trim()).filter(Boolean) : [],
    raw: rawText,
    model: modelName,
  };
};

const evaluateAnswer = async (question, answer) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = `
You are an academic evaluator.

Question:
${question || 'No question provided.'}

Student Answer:
${answer || 'No answer provided.'}

Evaluate the answer using this rubric:
- Concept clarity = 4 marks
- Explanation quality = 3 marks
- Examples = 2 marks
- Grammar = 1 mark

Total = 10 marks.

Return ONLY valid JSON:
{
  "marks": number,
  "feedback": "short feedback",
  "missingPoints": "important points missing"
}
`;

  let lastError = null;
  for (const modelName of MODEL_SEQUENCE) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      return normalizeResult(rawText, modelName);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gemini evaluation failed.');
};

const evaluateDetailedAnswer = async (question, answer) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = `
You are a strict academic evaluator.

Assignment:
${question || 'No assignment description provided.'}

Student submission text:
${answer || 'No submission text provided.'}

Return ONLY valid JSON with this shape:
{
  "score": number,
  "summary": "short evaluation summary",
  "strengths": ["point 1", "point 2"],
  "weaknesses": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2"]
}
`;

  let lastError = null;
  for (const modelName of MODEL_SEQUENCE) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      return normalizeDetailedResult(rawText, modelName);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gemini detailed evaluation failed.');
};

module.exports = { evaluateAnswer, evaluateDetailedAnswer };
