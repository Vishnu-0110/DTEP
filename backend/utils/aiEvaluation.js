const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const PREFERRED_MODEL = 'gemini-1.5-flash';
const MODEL_SEQUENCE = [PREFERRED_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash'];
const SECTION_WORD_MIN = 250;

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countWords = (value) => {
  const matches = String(value || '').trim().match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
};

const buildHeadingRegex = (headings) => {
  const options = headings.map(escapeRegExp).join('|');
  const optionalPrefix = '(?:\\d+\\s*[\\).:-]\\s*)?';
  const optionalScore = '(?:\\s*\\((?:\\d+\\s*(?:marks?)?|part\\s*\\d+)\\))?';
  const optionalPart = '(?:\\s*[-–—]\\s*part\\s*\\d+)?';

  return new RegExp(
    `^\\s*${optionalPrefix}(?:${options})\\b${optionalScore}${optionalPart}\\s*:?\\s*$`,
    'im'
  );
};

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
    key: 'images',
    label: 'Images',
    maxMarks: 10,
    headings: ['images', 'image', 'figures', 'visuals'],
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
  'Reward relevant and meaningful images/figures with clear context.',
  'Reward a clear conclusion that closes the answer.',
  'Reward references only if they are relevant and meaningful.',
];

const BALANCED_FORMAT_RULES = [
  `The submission must explicitly include these section headings or clearly equivalent headings: ${SECTION_DEFINITIONS.map((section) => section.label).join(', ')}.`,
  `Use ${SECTION_WORD_MIN} words per section as a full-mark target, not an automatic fail threshold.`,
  'If one section is missing, reduce marks proportionally instead of forcing an overall zero.',
  `If a section is present but below ${SECTION_WORD_MIN} words, award partial credit based on relevance and quality.`,
  'Reserve overall zero only for blank, copied template, or fully off-topic submissions.',
  'Mention missing sections and below-minimum sections clearly in feedback and missingPoints.',
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

const normalizeRubricResult = (rawText, modelName) => {
  const parsed = parseJsonFromText(rawText) || {};

  const toList = (value) =>
    Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

  const requiredSections = dedupeList(toList(parsed.requiredSections));
  const qualityChecks = dedupeList(toList(parsed.qualityChecks));
  const referenceGuidance = dedupeList(toList(parsed.referenceGuidance));
  const plainRubric = typeof parsed.rubricText === 'string'
    ? parsed.rubricText.trim()
    : String(rawText || '').trim();
  const generatedDescription = typeof parsed.generatedDescription === 'string'
    ? parsed.generatedDescription.trim()
    : '';

  const builtRubricLines = [
    plainRubric,
    requiredSections.length > 0 ? `Required sections: ${requiredSections.join(', ')}.` : '',
    qualityChecks.length > 0 ? `Quality checks: ${qualityChecks.join(' | ')}.` : '',
    referenceGuidance.length > 0 ? `Suggested sources: ${referenceGuidance.join(' | ')}.` : '',
  ].map((line) => String(line || '').trim()).filter(Boolean);

  return {
    rubricText: builtRubricLines.join('\n'),
    generatedDescription,
    requiredSections,
    qualityChecks,
    referenceGuidance,
    raw: rawText,
    model: modelName,
  };
};

const dedupeList = (items = []) => (
  Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean)))
);

const normalizeMissingPoint = (value) => (
  String(value || '')
    .replace(/^missing points?\s*:\s*/i, '')
    .replace(/^[-*•]+\s*/, '')
    .trim()
);
const toMissingPointList = (value) => (
  String(value || '')
    .split(/[;\n\r]+/)
    .map(normalizeMissingPoint)
    .filter(Boolean)
);
const dedupeMissingPointList = (items = []) => {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    for (const clause of toMissingPointList(item)) {
      const key = clause.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(clause);
    }
  }

  return output;
};

const joinSentences = (items = []) => dedupeList(items).join(' ');
const joinClauses = (items = []) => dedupeMissingPointList(items).join('; ');

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
  if (wordCount >= SECTION_WORD_MIN) return 1;
  if (wordCount >= 200) return 0.8;
  if (wordCount >= 150) return 0.65;
  if (wordCount >= 100) return 0.5;
  if (wordCount >= 60) return 0.35;
  if (wordCount >= 25) return 0.2;
  return 0.1;
};

const buildStructureAnalysis = (answer) => {
  const answerWordCount = countWords(answer);
  const foundSections = findSections(answer);
  const foundByKey = new Map(foundSections.map((section) => [section.key, section]));

  const sections = SECTION_DEFINITIONS.map((definition) => {
    const found = foundByKey.get(definition.key) || null;
    const wordCount = found?.wordCount || 0;
    const withinTarget = found ? wordCount >= SECTION_WORD_MIN : false;
    const ratio = found ? getWordCountRatio(wordCount) : 0;
    const earnedMarks = Math.round(definition.maxMarks * ratio);

    let issue = '';
    if (!found) {
      issue = `${definition.label} section is missing`;
    } else if (wordCount < SECTION_WORD_MIN) {
      issue = `${definition.label} has ${wordCount} words and is below ${SECTION_WORD_MIN}`;
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
    answerWordCount,
    sections,
    missingSections: sections.filter((section) => !section.headingFound).map((section) => section.label),
    belowMinimumSections: sections
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

Balanced rubric rules:
${BALANCED_FORMAT_RULES.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON:
{
  "marks": number,
  "feedback": "short feedback",
  "missingPoints": "important points missing"
}
`;

const buildDetailedPrompt = (question, answer) => `
You are a balanced academic evaluator.

Assignment:
${question || 'No assignment description provided.'}

Student submission text:
${answer || 'No submission text provided.'}

Evaluate the submission against this structure:
${RUBRIC_LINES.map((line) => `- ${line}`).join('\n')}

Use this guidance while scoring:
${SECTION_GUIDANCE.map((line) => `- ${line}`).join('\n')}

Balanced rubric rules:
${BALANCED_FORMAT_RULES.map((line) => `- ${line}`).join('\n')}

Score on a 0-100 scale. Missing sections should reduce marks significantly, but should not automatically force overall zero when meaningful content exists.

Return ONLY valid JSON with this shape:
{
  "score": number,
  "summary": "short evaluation summary",
  "strengths": ["point 1", "point 2"],
  "weaknesses": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2"]
}
`;

const buildRubricPrompt = ({ title, description, requiredPages }) => `
You are an academic evaluator and curriculum assistant.

Task title:
${title || 'Untitled assignment'}

Task description:
${description || 'No description provided.'}

Required pages:
${requiredPages > 0 ? `${requiredPages} pages exactly` : 'No strict page count provided'}

Generate a practical rubric and student instructions using standard academic expectations and commonly used educational references.

Return ONLY valid JSON:
{
  "generatedDescription": "short assignment description generated from title",
  "rubricText": "concise rubric text students can follow",
  "requiredSections": ["section 1", "section 2"],
  "qualityChecks": ["quality rule 1", "quality rule 2"],
  "referenceGuidance": ["source type 1", "source type 2"]
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
  const blendedMarks = rawMarks === null
    ? structureAnalysis.structureScore
    : Math.round((rawMarks * 0.8) + (structureAnalysis.structureScore * 0.2));
  const hasSubstantiveContent = Number(structureAnalysis.answerWordCount || 0) >= 80;
  const finalMarks = Math.max(
    hasSubstantiveContent ? 5 : 0,
    Math.min(100, Math.max(0, blendedMarks))
  );
  const violations = structureAnalysis.violations;

  const feedback = joinSentences([
    aiResult.feedback,
    rawMarks !== null && violations.length > 0
      ? `Structure gaps reduced the score to ${finalMarks}/100 (structure score ${structureAnalysis.structureScore}/100).`
      : '',
    violations.length === 0
      ? `All required rubric sections were present with at least ${SECTION_WORD_MIN} words.`
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
  const blendedScore = rawScore === null
    ? structureAnalysis.structureScore
    : Math.round((rawScore * 0.8) + (structureAnalysis.structureScore * 0.2));
  const hasSubstantiveContent = Number(structureAnalysis.answerWordCount || 0) >= 80;
  const finalScore = Math.max(
    hasSubstantiveContent ? 5 : 0,
    Math.min(100, Math.max(0, blendedScore))
  );
  const violations = structureAnalysis.violations;

  const strengths = dedupeList([
    ...aiResult.strengths,
    violations.length === 0
      ? `All required rubric sections were present with at least ${SECTION_WORD_MIN} words.`
      : '',
  ]);

  const weaknesses = dedupeList([
    ...aiResult.weaknesses,
    ...structureAnalysis.missingSections.map((section) => `${section} section is missing.`),
    ...structureAnalysis.belowMinimumSections.map((section) => `${section} is below the minimum word requirement.`),
  ]);

  const improvements = dedupeList([
    ...aiResult.improvements,
    `Use explicit headings for all rubric sections and keep each section at or above ${SECTION_WORD_MIN} words.`,
  ]);

  const summary = joinSentences([
    aiResult.summary,
    rawScore !== null && violations.length > 0
      ? `Structure gaps reduced the final score to ${finalScore}/100 (structure score ${structureAnalysis.structureScore}/100).`
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

const generateAssignmentRubric = async ({ title, description, requiredPages = 0 }) => {
  return runGeminiPrompt(
    buildRubricPrompt({ title, description, requiredPages }),
    normalizeRubricResult
  );
};

module.exports = { evaluateAnswer, evaluateDetailedAnswer, generateAssignmentRubric };
