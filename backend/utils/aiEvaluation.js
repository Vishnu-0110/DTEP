const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const PREFERRED_MODEL = 'gemini-1.5-flash';
const MODEL_SEQUENCE = [PREFERRED_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash'];
const SECTION_WORD_MIN = 250;
const SECTION_WORD_MAX = 300;

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countWords = (value) => {
  const matches = String(value || '').trim().match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
};

const buildHeadingRegex = (headings) => (
  new RegExp(`^\\s*(?:${headings.map(escapeRegExp).join('|')})\\s*:?\\s*$`, 'im')
);

const BASE_SECTION_DEFINITIONS = [
  { key: 'topic', label: 'Topic', maxMarks: 10, headings: ['topic', 'title', 'subject'] },
  { key: 'introduction', label: 'Introduction', maxMarks: 10, headings: ['introduction', 'intro'] },
  {
    key: 'types',
    label: 'Types / Categories',
    maxMarks: 10,
    headings: ['types / categories', 'types/categories', 'types and categories', 'types', 'categories'],
  },
  {
    key: 'concepts',
    label: 'Explanation of Concepts',
    maxMarks: 20,
    headings: ['explanation of concepts', 'concept explanation', 'explanation', 'concepts'],
  },
  { key: 'examples', label: 'Examples', maxMarks: 10, headings: ['examples', 'example'] },
  { key: 'applications', label: 'Applications', maxMarks: 10, headings: ['applications', 'application'] },
  {
    key: 'advantages',
    label: 'Advantages and Disadvantages',
    maxMarks: 10,
    headings: [
      'advantages and disadvantages',
      'advantages / disadvantages',
      'advantages & disadvantages',
      'pros and cons',
    ],
  },
  { key: 'conclusion', label: 'Conclusion', maxMarks: 10, headings: ['conclusion'] },
  { key: 'references', label: 'References', maxMarks: 10, headings: ['references', 'bibliography'] },
];

const SECTION_DEFINITIONS = BASE_SECTION_DEFINITIONS.map((section) => ({
  ...section,
  regex: buildHeadingRegex(section.headings),
}));

const RUBRIC_LINES = SECTION_DEFINITIONS.map(
  (section) => `${section.label} = ${section.maxMarks} marks`
);

const SECTION_GUIDANCE = [
  'Check whether the submission stays on the assigned topic.',
  'Reward a clear introduction that frames the answer.',
  'Reward correct coverage of types or categories where relevant.',
  'Give the highest weight to accurate explanation of concepts.',
  'Reward concrete examples that support the explanation.',
  'Reward practical applications or real-world use cases.',
  'Reward balanced coverage of advantages and disadvantages.',
  'Reward a clear conclusion that closes the answer.',
  'Reward references only if they are relevant and meaningful.',
];

const STRICT_FORMAT_RULES = [
  `The submission must explicitly include these section headings or clearly equivalent headings: ${SECTION_DEFINITIONS.map((section) => section.label).join(', ')}.`,
  `Each required section must contain ${SECTION_WORD_MIN} to ${SECTION_WORD_MAX} words.`,
  'If a required section is missing, give that section 0 marks.',
  `If a section is present but below ${SECTION_WORD_MIN} words or above ${SECTION_WORD_MAX} words, apply a strict penalty even if the content is good.`,
  `Award full marks for a section only if the heading is present, the section length is within ${SECTION_WORD_MIN}-${SECTION_WORD_MAX} words, and the content quality is strong.`,
  'Do not be lenient about word count or missing rubric sections.',
  'Mention missing sections and word-count violations clearly in feedback and missingPoints.',
];

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
    marks: Number.isFinite(marksNumber) ? Math.max(0, Math.min(100, Math.round(marksNumber))) : null,
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

const dedupeList = (items = []) => (
  Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)))
);

const joinSentences = (items = []) => dedupeList(items).join(' ');
const joinClauses = (items = []) => dedupeList(items).join('; ');

const consumeLineBreaks = (text, startIndex) => {
  let cursor = startIndex;
  while (cursor < text.length && (text[cursor] === '\r' || text[cursor] === '\n')) {
    cursor += 1;
  }
  return cursor;
};

const findSections = (text) => {
  const source = String(text || '');
  const matches = [];

  for (const section of SECTION_DEFINITIONS) {
    const match = section.regex.exec(source);
    if (!match) continue;

    matches.push({
      key: section.key,
      label: section.label,
      maxMarks: section.maxMarks,
      heading: match[0].trim(),
      index: match.index,
      matchLength: match[0].length,
    });
  }

  matches.sort((left, right) => left.index - right.index);

  return matches.map((match, index) => {
    const contentStart = consumeLineBreaks(source, match.index + match.matchLength);
    const nextMatch = matches[index + 1];
    const contentEnd = nextMatch ? nextMatch.index : source.length;
    const content = source.slice(contentStart, contentEnd).trim();

    return {
      ...match,
      content,
      wordCount: countWords(content),
    };
  });
};

const getWordCountRatio = (wordCount) => {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  if (wordCount >= SECTION_WORD_MIN && wordCount <= SECTION_WORD_MAX) return 1;

  const distance = wordCount < SECTION_WORD_MIN
    ? SECTION_WORD_MIN - wordCount
    : wordCount - SECTION_WORD_MAX;

  if (distance <= 20) return 0.75;
  if (distance <= 50) return 0.5;
  if (distance <= 100) return 0.25;
  return 0;
};

const buildStructureAnalysis = (answer) => {
  const foundSections = findSections(answer);
  const foundByKey = new Map(foundSections.map((section) => [section.key, section]));

  const sections = SECTION_DEFINITIONS.map((definition) => {
    const found = foundByKey.get(definition.key) || null;
    const wordCount = found?.wordCount || 0;
    const withinTarget = found ? wordCount >= SECTION_WORD_MIN && wordCount <= SECTION_WORD_MAX : false;
    const ratio = found ? getWordCountRatio(wordCount) : 0;
    const earnedMarks = Math.round(definition.maxMarks * ratio);

    let issue = '';
    if (!found) {
      issue = `${definition.label} section is missing`;
    } else if (wordCount < SECTION_WORD_MIN) {
      issue = `${definition.label} has ${wordCount} words and is below ${SECTION_WORD_MIN}`;
    } else if (wordCount > SECTION_WORD_MAX) {
      issue = `${definition.label} has ${wordCount} words and exceeds ${SECTION_WORD_MAX}`;
    }

    return {
      key: definition.key,
      label: definition.label,
      maxMarks: definition.maxMarks,
      earnedMarks,
      headingFound: Boolean(found),
      heading: found?.heading || null,
      wordCount,
      withinTarget,
      issue,
    };
  });

  return {
    structureScore: sections.reduce((total, section) => total + section.earnedMarks, 0),
    sections,
    missingSections: sections.filter((section) => !section.headingFound).map((section) => section.label),
    outOfRangeSections: sections
      .filter((section) => section.headingFound && !section.withinTarget)
      .map((section) => `${section.label} (${section.wordCount} words)`),
    violations: sections.map((section) => section.issue).filter(Boolean),
  };
};

const buildAutomaticPrompt = (question, answer) => `
You are an academic evaluator.

Question:
${question || 'No question provided.'}

Student Answer:
${answer || 'No answer provided.'}

Evaluate the answer using this rubric:
${RUBRIC_LINES.map((line) => `- ${line}`).join('\n')}

Total = 100 marks.

Section guidance:
${SECTION_GUIDANCE.map((line) => `- ${line}`).join('\n')}

Strict rubric rules:
${STRICT_FORMAT_RULES.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON:
{
  "marks": number,
  "feedback": "short feedback",
  "missingPoints": "important points missing"
}
`;

const buildDetailedPrompt = (question, answer) => `
You are a strict academic evaluator.

Assignment:
${question || 'No assignment description provided.'}

Student submission text:
${answer || 'No submission text provided.'}

Evaluate the submission against this structure:
${RUBRIC_LINES.map((line) => `- ${line}`).join('\n')}

Use this guidance while scoring:
${SECTION_GUIDANCE.map((line) => `- ${line}`).join('\n')}

Strict rubric rules:
${STRICT_FORMAT_RULES.map((line) => `- ${line}`).join('\n')}

Score on a 0-100 scale. Be strict: if a section is missing or outside the ${SECTION_WORD_MIN}-${SECTION_WORD_MAX} word range, do not award full marks for that section.

Return ONLY valid JSON with this shape:
{
  "score": number,
  "summary": "short evaluation summary",
  "strengths": ["point 1", "point 2"],
  "weaknesses": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2"]
}
`;

const runGeminiPrompt = async (prompt, normalizer) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = null;

  for (const modelName of MODEL_SEQUENCE) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      return normalizer(rawText, modelName);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gemini evaluation failed.');
};

const mergeAutomaticResult = (aiResult, structureAnalysis) => {
  const rawMarks = typeof aiResult.marks === 'number' ? aiResult.marks : null;
  const finalMarks = rawMarks === null
    ? structureAnalysis.structureScore
    : Math.min(rawMarks, structureAnalysis.structureScore);
  const violations = structureAnalysis.violations;

  const feedback = joinSentences([
    aiResult.feedback,
    rawMarks !== null && finalMarks < rawMarks
      ? `Structure compliance capped the score at ${structureAnalysis.structureScore}/100.`
      : '',
    violations.length === 0
      ? `All required rubric sections were present and within the ${SECTION_WORD_MIN}-${SECTION_WORD_MAX} word limit.`
      : '',
  ]);

  return {
    ...aiResult,
    rawMarks,
    marks: finalMarks,
    structureScore: structureAnalysis.structureScore,
    sectionAnalysis: structureAnalysis.sections,
    feedback,
    missingPoints: joinClauses([aiResult.missingPoints, ...violations]),
  };
};

const mergeDetailedResult = (aiResult, structureAnalysis) => {
  const rawScore = typeof aiResult.score === 'number' ? aiResult.score : null;
  const finalScore = rawScore === null
    ? structureAnalysis.structureScore
    : Math.min(rawScore, structureAnalysis.structureScore);
  const violations = structureAnalysis.violations;

  const strengths = dedupeList([
    ...aiResult.strengths,
    violations.length === 0
      ? `All required rubric sections were present and stayed within ${SECTION_WORD_MIN}-${SECTION_WORD_MAX} words.`
      : '',
  ]);

  const weaknesses = dedupeList([
    ...aiResult.weaknesses,
    ...structureAnalysis.missingSections.map((section) => `${section} section is missing.`),
    ...structureAnalysis.outOfRangeSections.map((section) => `${section} is outside the required word range.`),
  ]);

  const improvements = dedupeList([
    ...aiResult.improvements,
    `Use explicit headings for all rubric sections and keep each one within ${SECTION_WORD_MIN}-${SECTION_WORD_MAX} words.`,
  ]);

  const summary = joinSentences([
    aiResult.summary,
    rawScore !== null && finalScore < rawScore
      ? `Structure compliance capped the final score at ${structureAnalysis.structureScore}/100.`
      : '',
  ]);

  return {
    ...aiResult,
    rawScore,
    score: finalScore,
    structureScore: structureAnalysis.structureScore,
    sectionAnalysis: structureAnalysis.sections,
    summary,
    strengths,
    weaknesses,
    improvements,
  };
};

const evaluateAnswer = async (question, answer) => {
  const structureAnalysis = buildStructureAnalysis(answer);
  const aiResult = await runGeminiPrompt(
    buildAutomaticPrompt(question, answer),
    normalizeResult
  );

  return mergeAutomaticResult(aiResult, structureAnalysis);
};

const evaluateDetailedAnswer = async (question, answer) => {
  const structureAnalysis = buildStructureAnalysis(answer);
  const aiResult = await runGeminiPrompt(
    buildDetailedPrompt(question, answer),
    normalizeDetailedResult
  );

  return mergeDetailedResult(aiResult, structureAnalysis);
};

module.exports = { evaluateAnswer, evaluateDetailedAnswer };
