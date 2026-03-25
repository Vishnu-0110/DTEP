const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const PREFERRED_MODEL = 'gemini-1.5-flash';
const MODEL_SEQUENCE = [PREFERRED_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash'];
const DEFAULT_SECTION_WORD_MIN = 220;

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

const countWords = (value) => {
  const matches = String(value || '').trim().match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return matches ? matches.length : 0;
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toSectionKey = (label, fallbackIndex = 0) => {
  const normalized = String(label || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `section_${fallbackIndex + 1}`;
};

const normalizeHeadingText = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\//g, ' / ')
    .replace(/[^a-z0-9/&\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const stripHeadingNumberPrefix = (value) => (
  String(value || '').replace(/^\s*\(?\d+(?:\.\d+)*\)?\s*[\).:-]?\s*/i, '').trim()
);

const clampInt = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
};

const buildHeadingRegex = (headings) => {
  const options = headings.map(escapeRegExp).join('|');
  const optionalPrefix = '(?:\\(?\\d+(?:\\.\\d+)*\\)?\\s*[\\).:-]?\\s*)?';
  const optionalContinuation = '(?:\\s+[A-Za-z0-9][A-Za-z0-9/&(),\'-]*){0,14}';
  const optionalScore = '(?:\\s*\\((?:\\d+\\s*(?:marks?|points?)?|part\\s*\\d+)\\))?';
  const optionalPart = '(?:\\s*[-–—]\\s*part\\s*\\d+)?';
  const optionalSubtitle = '(?:\\s*[:\\-–—]\\s*[A-Za-z0-9][^\\n\\r]{0,220})?';

  return new RegExp(
    `^\\s*${optionalPrefix}(?:${options})\\b${optionalContinuation}${optionalScore}${optionalPart}${optionalSubtitle}\\s*$`,
    'i'
  );
};

const DEFAULT_RUBRIC_SECTIONS = [
  {
    label: 'Topic',
    maxMarks: 10,
    required: true,
    minWords: 0,
    aliases: ['topic', 'title', 'subject'],
    guidance: 'Introduce the exact topic and scope clearly.',
  },
  {
    label: 'Introduction',
    maxMarks: 10,
    required: true,
    minWords: 140,
    aliases: ['introduction', 'intro'],
    guidance: 'Set context and objective of the assignment.',
  },
  {
    label: 'Core Concepts',
    maxMarks: 20,
    required: true,
    minWords: 220,
    aliases: [
      'core concepts',
      'concept explanation',
      'explanation of concepts',
      'concepts',
      'implications',
      'analysis',
      'discussion',
      'considerations',
    ],
    guidance: 'Explain the key ideas accurately and in depth.',
  },
  {
    label: 'Types / Categories',
    maxMarks: 10,
    required: false,
    minWords: 140,
    aliases: ['types', 'categories', 'types and categories', 'classification'],
    guidance: 'Cover meaningful classifications only when relevant to the topic.',
  },
  {
    label: 'Examples',
    maxMarks: 10,
    required: false,
    minWords: 140,
    aliases: ['examples', 'example', 'case study', 'case studies'],
    guidance: 'Use concrete examples when they add clarity.',
  },
  {
    label: 'Applications',
    maxMarks: 10,
    required: false,
    minWords: 140,
    aliases: ['applications', 'application', 'use cases', 'implementation'],
    guidance: 'Show practical use where applicable.',
  },
  {
    label: 'Advantages & Disadvantages',
    maxMarks: 10,
    required: false,
    minWords: 140,
    aliases: ['advantages and disadvantages', 'pros and cons', 'benefits and limitations'],
    guidance: 'Discuss strengths and limits when comparison is relevant.',
  },
  {
    label: 'Conclusion',
    maxMarks: 10,
    required: true,
    minWords: 120,
    aliases: ['conclusion', 'summary'],
    guidance: 'Close with a clear synthesis of the argument.',
  },
  {
    label: 'References',
    maxMarks: 10,
    required: true,
    minWords: 40,
    aliases: ['references', 'bibliography', 'sources'],
    guidance: 'Provide credible references used in the submission.',
  },
];

const normalizeSectionMarksToHundred = (sections = []) => {
  if (!Array.isArray(sections) || sections.length === 0) return [];

  const positive = sections.map((section) => ({
    ...section,
    maxMarks: Math.max(1, clampInt(section.maxMarks, 1, 100, 10)),
  }));
  const total = positive.reduce((sum, section) => sum + section.maxMarks, 0);
  if (total <= 0) return positive;

  const raw = positive.map((section) => ({
    section,
    scaled: (section.maxMarks / total) * 100,
  }));

  const floored = raw.map((entry) => ({
    section: entry.section,
    marks: Math.max(1, Math.floor(entry.scaled)),
    fraction: entry.scaled - Math.floor(entry.scaled),
  }));

  let assigned = floored.reduce((sum, entry) => sum + entry.marks, 0);
  if (assigned > 100) {
    const sorted = [...floored].sort((a, b) => b.marks - a.marks);
    let cursor = 0;
    while (assigned > 100 && sorted.length > 0) {
      const item = sorted[cursor % sorted.length];
      if (item.marks > 1) {
        item.marks -= 1;
        assigned -= 1;
      }
      cursor += 1;
      if (cursor > 500) break;
    }
  } else if (assigned < 100) {
    const sorted = [...floored].sort((a, b) => b.fraction - a.fraction);
    let cursor = 0;
    while (assigned < 100 && sorted.length > 0) {
      sorted[cursor % sorted.length].marks += 1;
      assigned += 1;
      cursor += 1;
      if (cursor > 500) break;
    }
  }

  return floored.map((entry) => ({
    ...entry.section,
    maxMarks: entry.marks,
  }));
};

const normalizeRubricSections = (rawSections = [], { keepOriginalMarks = false } = {}) => {
  const source = Array.isArray(rawSections) && rawSections.length > 0
    ? rawSections
    : DEFAULT_RUBRIC_SECTIONS;

  const seen = new Set();
  const normalized = [];

  source.forEach((item, index) => {
    const label = String(item?.label || item?.name || item?.title || '').trim();
    if (!label) return;

    const key = toSectionKey(label, index);
    if (seen.has(key)) return;
    seen.add(key);

    const aliases = dedupeList([
      label,
      ...(Array.isArray(item?.aliases) ? item.aliases : []),
      ...(Array.isArray(item?.headings) ? item.headings : []),
    ]);

    const baseMinWords = clampInt(
      item?.minWords ?? item?.wordTarget ?? item?.targetWords,
      40,
      1500,
      DEFAULT_SECTION_WORD_MIN
    );
    const normalizedKey = toSectionKey(label, index);
    const minWords = normalizedKey === 'topic'
      ? clampInt(item?.minWords ?? item?.wordTarget ?? item?.targetWords, 0, 120, 0)
      : normalizedKey === 'references'
        ? clampInt(item?.minWords ?? item?.wordTarget ?? item?.targetWords, 20, 400, 40)
        : baseMinWords;

    normalized.push({
      key,
      label,
      maxMarks: Math.max(1, clampInt(item?.maxMarks, 1, 100, 10)),
      required: item?.required !== false,
      minWords,
      aliases,
      guidance: String(item?.guidance || '').trim(),
    });
  });

  const sections = keepOriginalMarks ? normalized : normalizeSectionMarksToHundred(normalized);

  return sections.map((section, index) => ({
    ...section,
    key: section.key || toSectionKey(section.label, index),
    headings: dedupeList(section.aliases),
    normalizedHeadings: dedupeList(section.aliases.map(normalizeHeadingText)),
    regex: buildHeadingRegex(dedupeList(section.aliases)),
  }));
};

const parseSectionsFromRubricText = (rubricText = '') => {
  const text = String(rubricText || '');
  if (!text.trim()) return [];

  const sections = [];
  const lines = text.split(/\r?\n/);

  const parseLine = (line) => {
    const cleaned = String(line || '').replace(/^[-*•]+\s*/, '').trim();
    if (!cleaned) return null;

    const markPatternA = cleaned.match(/^(.{2,90}?)\s*(?:=|:|-)\s*(\d{1,3})\s*(?:marks?|points?)\b/i);
    const markPatternB = cleaned.match(/^(.{2,90}?)\s*\((\d{1,3})\s*(?:marks?|points?)?\)\s*$/i);
    const markPatternC = cleaned.match(/^(.{2,90}?)\s+(\d{1,3})\s*(?:marks?|points?)\b/i);
    const marksMatch = markPatternA || markPatternB || markPatternC;
    if (!marksMatch) return null;

    const label = String(marksMatch[1] || '').trim();
    if (!label || label.length > 90) return null;

    const maxMarks = clampInt(marksMatch[2], 1, 100, 10);
    const lower = cleaned.toLowerCase();
    const required = !/(optional|if relevant|if applicable|when relevant|not mandatory)/i.test(lower);
    const wordsMatch = cleaned.match(/(\d{2,4})\s*words?/i);
    const minWords = wordsMatch
      ? clampInt(wordsMatch[1], 40, 1500, DEFAULT_SECTION_WORD_MIN)
      : DEFAULT_SECTION_WORD_MIN;

    return {
      label,
      maxMarks,
      required,
      minWords,
      aliases: [label],
      guidance: '',
    };
  };

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) sections.push(parsed);
  }

  if (sections.length > 0) return sections;

  const requiredMatch = text.match(/required sections?\s*:\s*([^\n\r]+)/i);
  if (!requiredMatch?.[1]) return [];
  const labels = requiredMatch[1]
    .split(/[|,;]/)
    .map((label) => String(label || '').trim())
    .filter(Boolean);
  if (labels.length === 0) return [];

  const equalMark = Math.max(5, Math.floor(100 / labels.length));
  return labels.map((label) => ({
    label,
    maxMarks: equalMark,
    required: true,
    minWords: DEFAULT_SECTION_WORD_MIN,
    aliases: [label],
    guidance: '',
  }));
};

const buildRubricTextFromSections = ({
  sections = [],
  qualityChecks = [],
  referenceGuidance = [],
  requiredPages = 0,
}) => {
  const compiledSections = normalizeRubricSections(sections);
  const total = compiledSections.reduce((sum, section) => sum + section.maxMarks, 0);

  const lines = [
    'Topic-Specific Evaluation Rubric:',
    ...compiledSections.map((section) => (
      `- ${section.label} = ${section.maxMarks} marks (${section.required ? 'Required' : 'Optional'}, target ${section.minWords}+ words)`
    )),
    total > 0 ? `Total = ${total} marks (scaled to 100 in final score).` : '',
    requiredPages > 0 ? `Minimum length: ${requiredPages} page(s).` : '',
    qualityChecks.length > 0 ? `Quality checks: ${qualityChecks.join(' | ')}.` : '',
    referenceGuidance.length > 0 ? `Suggested references: ${referenceGuidance.join(' | ')}.` : '',
  ].map((line) => String(line || '').trim()).filter(Boolean);

  return lines.join('\n');
};

const parseJsonFromText = (text) => {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    // Continue below.
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch (_) {
      // Continue below.
    }
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (!objectMatch?.[0]) return null;

  try {
    return JSON.parse(objectMatch[0]);
  } catch (_) {
    return null;
  }
};

const resolveRubricContext = (options = {}) => {
  const fromSections = normalizeRubricSections(
    Array.isArray(options?.rubricSections) ? options.rubricSections : []
  );
  const fromRubricText = fromSections.length > 0
    ? []
    : normalizeRubricSections(parseSectionsFromRubricText(options?.rubricText || ''));

  const sections = fromSections.length > 0
    ? fromSections
    : fromRubricText.length > 0
      ? fromRubricText
      : normalizeRubricSections(DEFAULT_RUBRIC_SECTIONS);

  const totalMaxMarks = sections.reduce((sum, section) => sum + section.maxMarks, 0) || 100;
  const requiredSections = sections.filter((section) => section.required);
  const optionalSections = sections.filter((section) => !section.required);
  const rubricLines = sections.map((section) => (
    `${section.label} = ${section.maxMarks} marks (${section.required ? 'required' : 'optional'}, target ${section.minWords}+ words)`
  ));
  const sectionGuidance = sections.map((section) => (
    section.guidance || `Evaluate "${section.label}" based on relevance, depth, and clarity.`
  ));

  const balancedRules = [
    `Required sections for this assignment: ${requiredSections.map((section) => section.label).join(', ') || 'None'}.`,
    optionalSections.length > 0
      ? `Optional sections: ${optionalSections.map((section) => section.label).join(', ')}. Do not mark them as mandatory missing sections.`
      : 'All listed sections are required for this assignment.',
    'Use section targets as full-mark guidance, not automatic fail thresholds.',
    'If a required section is missing, reduce marks proportionally instead of forcing overall zero.',
    'If a section is present but below target length, award partial credit based on relevance and quality.',
    'Reserve overall zero only for blank, copied template, or fully off-topic submissions.',
  ];

  return {
    title: String(options?.title || '').trim(),
    requiredPages: clampInt(options?.requiredPages, 0, 500, 0),
    sections,
    totalMaxMarks,
    requiredSections,
    optionalSections,
    rubricLines,
    sectionGuidance,
    balancedRules,
  };
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

const normalizeRubricResult = (rawText, modelName, context = {}) => {
  const parsed = parseJsonFromText(rawText) || {};

  const toList = (value) =>
    Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

  const qualityChecks = dedupeList(toList(parsed.qualityChecks));
  const referenceGuidance = dedupeList(toList(parsed.referenceGuidance));

  let rubricSections = normalizeRubricSections(
    Array.isArray(parsed.rubricSections) ? parsed.rubricSections : (
      Array.isArray(parsed.sections) ? parsed.sections : []
    )
  );

  if (rubricSections.length === 0) {
    const requiredSections = toList(parsed.requiredSections);
    if (requiredSections.length > 0) {
      const evenMark = Math.max(5, Math.floor(100 / requiredSections.length));
      rubricSections = normalizeRubricSections(
        requiredSections.map((label) => ({
          label,
          maxMarks: evenMark,
          required: true,
          minWords: DEFAULT_SECTION_WORD_MIN,
          aliases: [label],
        }))
      );
    }
  }

  if (rubricSections.length === 0) {
    rubricSections = normalizeRubricSections(DEFAULT_RUBRIC_SECTIONS);
  }

  const plainRubric = typeof parsed.rubricText === 'string'
    ? parsed.rubricText.trim()
    : '';

  const generatedDescription = typeof parsed.generatedDescription === 'string'
    ? parsed.generatedDescription.trim()
    : '';

  const rubricText = plainRubric || buildRubricTextFromSections({
    sections: rubricSections,
    qualityChecks,
    referenceGuidance,
    requiredPages: clampInt(context?.requiredPages, 0, 500, 0),
  });

  return {
    rubricText,
    generatedDescription,
    rubricSections: rubricSections.map((section) => ({
      key: section.key,
      label: section.label,
      maxMarks: section.maxMarks,
      required: section.required,
      minWords: section.minWords,
      aliases: section.headings,
      guidance: section.guidance || '',
    })),
    qualityChecks,
    referenceGuidance,
    raw: rawText,
    model: modelName,
  };
};

const consumeLineBreaks = (text, startIndex) => {
  let cursor = startIndex;
  while (cursor < text.length && (text[cursor] === '\r' || text[cursor] === '\n')) {
    cursor += 1;
  }
  return cursor;
};

const inferTopicHeading = (text) => {
  const source = String(text || '');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(normalized)) continue;
    if (/^(abstract|academic assignment|table of contents|references)$/i.test(normalized)) continue;
    const words = countWords(normalized);
    if (words >= 4 && words <= 25) return normalized;
  }

  return '';
};

const getLineEntries = (text) => {
  const source = String(text || '');
  const entries = [];
  const lineRegex = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match = null;

  while ((match = lineRegex.exec(source)) !== null) {
    const lineText = String(match[1] || '');
    const newline = String(match[2] || '');
    const start = match.index;
    const end = start + lineText.length;

    entries.push({
      trimmed: lineText.trim(),
      start,
      end,
    });

    if (!newline) break;
  }

  return entries;
};

const isLikelyHeadingLine = (line) => {
  const value = String(line || '').trim();
  if (!value) return false;
  if (value.length > 220) return false;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(value)) return false;

  const words = countWords(value);
  if (words === 0 || words > 24) return false;
  if (/[.!?]\s*$/.test(value) && !/:\s*$/.test(value)) return false;
  if ((value.match(/[,;]/g) || []).length > 1) return false;

  const hasNumberPrefix = /^\s*\(?\d+(?:\.\d+)*\)?\s*[\).:-]?\s+/.test(value);
  const hasHeadingDivider = /:|\s[-–—]\s/.test(value);
  const isAllCapsHeading = /^[A-Z0-9\s/&(),.'-]+$/.test(value) && /[A-Z]/.test(value);
  const isShortTitleCase = /^[A-Z][A-Za-z0-9/&()'-]*(?:\s+[A-Z][A-Za-z0-9/&()'-]*){0,7}$/.test(value);
  const startsWithTitleToken = /^[A-Z0-9]/.test(value);

  if (
    !hasNumberPrefix &&
    !isAllCapsHeading &&
    !isShortTitleCase &&
    !(hasHeadingDivider && startsWithTitleToken)
  ) {
    return false;
  }

  return true;
};

const matchesSectionHeadingLine = (line, section) => {
  const withoutPrefix = stripHeadingNumberPrefix(line);
  const normalized = normalizeHeadingText(withoutPrefix);
  if (!normalized) return false;

  return section.normalizedHeadings.some((alias) => (
    normalized === alias ||
    normalized.startsWith(`${alias} `) ||
    normalized.endsWith(` ${alias}`) ||
    normalized.includes(` ${alias} `)
  ));
};

const findSections = (text, sectionDefinitions = []) => {
  const source = String(text || '');
  const lineEntries = getLineEntries(source);
  const matchesByKey = new Map();

  for (const lineEntry of lineEntries) {
    if (!isLikelyHeadingLine(lineEntry.trimmed)) continue;

    for (const section of sectionDefinitions) {
      if (matchesByKey.has(section.key)) continue;

      const regexMatched = section.regex.test(lineEntry.trimmed);
      const aliasMatched = matchesSectionHeadingLine(lineEntry.trimmed, section);
      if (!regexMatched && !aliasMatched) continue;

      matchesByKey.set(section.key, {
        key: section.key,
        label: section.label,
        maxMarks: section.maxMarks,
        required: section.required,
        minWords: section.minWords,
        heading: lineEntry.trimmed,
        index: lineEntry.start,
        matchLength: lineEntry.end - lineEntry.start,
      });
    }
  }

  const matches = Array.from(matchesByKey.values());
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

const getWordCountRatio = (wordCount, minWords) => {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  const numericTarget = Math.trunc(Number(minWords));
  if (!Number.isFinite(numericTarget) || numericTarget <= 0) return 1;
  const target = Math.max(40, numericTarget);
  const ratio = wordCount / target;
  if (ratio >= 1) return 1;
  if (ratio >= 0.8) return 0.85;
  if (ratio >= 0.6) return 0.7;
  if (ratio >= 0.4) return 0.5;
  if (ratio >= 0.2) return 0.3;
  return 0.15;
};

const buildStructureAnalysis = (answer, rubricContext) => {
  const answerWordCount = countWords(answer);
  const sectionDefinitions = rubricContext.sections;
  const totalMaxMarks = rubricContext.totalMaxMarks;
  const foundSections = findSections(answer, sectionDefinitions);
  const inferredTopicHeading = inferTopicHeading(answer);
  const foundByKey = new Map(foundSections.map((section) => [section.key, section]));

  const sections = sectionDefinitions.map((definition) => {
    let found = foundByKey.get(definition.key) || null;
    if (!found && definition.key === 'topic' && inferredTopicHeading) {
      found = {
        key: definition.key,
        label: definition.label,
        maxMarks: definition.maxMarks,
        required: definition.required,
        minWords: definition.minWords,
        heading: inferredTopicHeading,
        index: 0,
        matchLength: inferredTopicHeading.length,
        content: inferredTopicHeading,
        wordCount: countWords(inferredTopicHeading),
      };
    }

    const wordCount = found?.wordCount || 0;
    const ratio = found ? getWordCountRatio(wordCount, definition.minWords) : 0;
    const withinTarget = found ? wordCount >= definition.minWords : false;
    const earnedMarks = Math.round(definition.maxMarks * ratio);

    let issue = '';
    if (!found && definition.required) {
      issue = `${definition.label} section is missing`;
    } else if (found && !withinTarget && definition.required) {
      issue = `${definition.label} has ${wordCount} words and is below ${definition.minWords}`;
    }

    return {
      key: definition.key,
      label: definition.label,
      maxMarks: definition.maxMarks,
      required: definition.required,
      minWords: definition.minWords,
      earnedMarks,
      headingFound: Boolean(found),
      heading: found?.heading || null,
      wordCount,
      withinTarget,
      issue,
    };
  });

  const rawStructureScore = sections.reduce((sum, section) => sum + section.earnedMarks, 0);
  const normalizedStructureScore = totalMaxMarks > 0
    ? Math.round((rawStructureScore / totalMaxMarks) * 100)
    : 0;

  const missingRequired = sections
    .filter((section) => section.required && !section.headingFound)
    .map((section) => section.label);

  const belowRequiredTarget = sections
    .filter((section) => section.required && section.headingFound && !section.withinTarget)
    .map((section) => `${section.label} (${section.wordCount} words)`);

  return {
    structureScore: Math.max(0, Math.min(100, normalizedStructureScore)),
    rawStructureScore,
    totalMaxMarks,
    answerWordCount,
    sections,
    missingSections: missingRequired,
    belowMinimumSections: belowRequiredTarget,
    violations: sections.map((section) => section.issue).filter(Boolean),
  };
};

const buildAutomaticPrompt = (question, answer, rubricContext) => `
You are an academic evaluator.

Assignment:
${question || 'No assignment description provided.'}

Student Answer:
${answer || 'No answer provided.'}

Evaluate the answer using this topic-specific rubric:
${rubricContext.rubricLines.map((line) => `- ${line}`).join('\n')}

Scoring note:
- Convert your final score to a 0-100 scale.
- Required pages: ${rubricContext.requiredPages > 0 ? `${rubricContext.requiredPages}+` : 'No strict page rule'}.

Section guidance:
${rubricContext.sectionGuidance.map((line) => `- ${line}`).join('\n')}

Balanced rubric rules:
${rubricContext.balancedRules.map((line) => `- ${line}`).join('\n')}

Return ONLY valid JSON:
{
  "marks": number,
  "feedback": "short feedback",
  "missingPoints": "important points missing"
}
`;

const buildDetailedPrompt = (question, answer, rubricContext) => `
You are a balanced academic evaluator.

Assignment:
${question || 'No assignment description provided.'}

Student submission text:
${answer || 'No submission text provided.'}

Evaluate the submission against this topic-specific rubric:
${rubricContext.rubricLines.map((line) => `- ${line}`).join('\n')}

Use this guidance while scoring:
${rubricContext.sectionGuidance.map((line) => `- ${line}`).join('\n')}

Balanced rubric rules:
${rubricContext.balancedRules.map((line) => `- ${line}`).join('\n')}

Return a final score on a 0-100 scale. Missing required sections should reduce marks significantly, but should not force an automatic zero when meaningful content exists.

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
${requiredPages > 0 ? `At least ${requiredPages} pages` : 'No strict page count provided'}

Create a topic-specific rubric. Do NOT force a fixed template for all topics.
Important:
- Include only sections that genuinely fit this topic.
- If a section like "Examples" is not essential, either omit it or mark it optional.
- Keep total marks around 100.

Return ONLY valid JSON:
{
  "generatedDescription": "short assignment description generated from title",
  "rubricText": "concise rubric text students can follow",
  "rubricSections": [
    {
      "label": "Section name",
      "maxMarks": 10,
      "required": true,
      "minWords": 200,
      "aliases": ["heading variant 1", "heading variant 2"],
      "guidance": "what should be covered in this section"
    }
  ],
  "qualityChecks": ["quality rule 1", "quality rule 2"],
  "referenceGuidance": ["source type 1", "source type 2"]
}
`;

const runGeminiPrompt = async (prompt, normalizer, context = {}) => {
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
      return normalizer(rawText, modelName, context);
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

  const requiredCount = structureAnalysis.sections.filter((section) => section.required).length;
  const requiredSatisfied = structureAnalysis.sections.filter((section) => section.required && section.withinTarget).length;
  const violations = structureAnalysis.violations;

  const feedback = joinSentences([
    aiResult.feedback,
    rawMarks !== null && violations.length > 0
      ? `Structure gaps adjusted the final score to ${finalMarks}/100 (structure score ${structureAnalysis.structureScore}/100).`
      : '',
    requiredCount > 0 && requiredSatisfied === requiredCount
      ? 'All required rubric sections were present and met their target depth.'
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

  const requiredCount = structureAnalysis.sections.filter((section) => section.required).length;
  const requiredSatisfied = structureAnalysis.sections.filter((section) => section.required && section.withinTarget).length;

  const strengths = dedupeList([
    ...aiResult.strengths,
    requiredCount > 0 && requiredSatisfied === requiredCount
      ? 'All required rubric sections were present with sufficient depth.'
      : '',
  ]);

  const weaknesses = dedupeList([
    ...aiResult.weaknesses,
    ...structureAnalysis.missingSections.map((section) => `${section} section is missing.`),
    ...structureAnalysis.belowMinimumSections.map((section) => `${section} is below the target word depth.`),
  ]);

  const improvements = dedupeList([
    ...aiResult.improvements,
    structureAnalysis.missingSections.length > 0
      ? `Add the missing required sections: ${structureAnalysis.missingSections.join(', ')}.`
      : '',
    structureAnalysis.belowMinimumSections.length > 0
      ? 'Expand underdeveloped required sections with clearer detail and evidence.'
      : '',
  ]);

  const summary = joinSentences([
    aiResult.summary,
    rawScore !== null && structureAnalysis.violations.length > 0
      ? `Structure gaps adjusted the final score to ${finalScore}/100 (structure score ${structureAnalysis.structureScore}/100).`
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

const evaluateAnswer = async (question, answer, rubricOptions = {}) => {
  const rubricContext = resolveRubricContext(rubricOptions);
  const structureAnalysis = buildStructureAnalysis(answer, rubricContext);
  const aiResult = await runGeminiPrompt(
    buildAutomaticPrompt(question, answer, rubricContext),
    normalizeResult
  );

  return mergeAutomaticResult(aiResult, structureAnalysis);
};

const evaluateDetailedAnswer = async (question, answer, rubricOptions = {}) => {
  const rubricContext = resolveRubricContext(rubricOptions);
  const structureAnalysis = buildStructureAnalysis(answer, rubricContext);
  const aiResult = await runGeminiPrompt(
    buildDetailedPrompt(question, answer, rubricContext),
    normalizeDetailedResult
  );

  return mergeDetailedResult(aiResult, structureAnalysis);
};

const generateAssignmentRubric = async ({ title, description, requiredPages = 0 }) => {
  return runGeminiPrompt(
    buildRubricPrompt({ title, description, requiredPages }),
    normalizeRubricResult,
    { requiredPages }
  );
};

const buildFallbackRubricFromTopic = ({ title, description, requiredPages = 0 }) => {
  const text = `${String(title || '')} ${String(description || '')}`.toLowerCase();

  const hasCompare = /\b(vs|versus|compare|comparison|advantages?|disadvantages?|pros|cons)\b/.test(text);
  const hasClassification = /\b(types?|categories?|classif|taxonomy|literature|architecture|history)\b/.test(text);
  const hasApplication = /\b(application|applied|practical|implementation|use case|industry|real world|system)\b/.test(text);
  const hasExamples = /\b(example|problem|numerical|case study|calculus|math|physics|programming|coding)\b/.test(text);

  const sections = [
    {
      label: 'Topic',
      maxMarks: 10,
      required: true,
      minWords: 0,
      aliases: ['topic', 'title', 'subject'],
      guidance: 'State the exact topic and scope.',
    },
    {
      label: 'Introduction',
      maxMarks: 10,
      required: true,
      minWords: 140,
      aliases: ['introduction', 'intro'],
      guidance: 'Provide context, objective, and approach.',
    },
    {
      label: 'Core Concepts',
      maxMarks: 25,
      required: true,
      minWords: 220,
      aliases: ['core concepts', 'concept explanation', 'explanation'],
      guidance: 'Explain concepts accurately and in depth.',
    },
    {
      label: 'Conclusion',
      maxMarks: 15,
      required: true,
      minWords: 120,
      aliases: ['conclusion', 'summary'],
      guidance: 'Summarize findings and final standpoint.',
    },
    {
      label: 'References',
      maxMarks: 10,
      required: true,
      minWords: 40,
      aliases: ['references', 'bibliography', 'sources'],
      guidance: 'Use credible references.',
    },
  ];

  if (hasClassification) {
    sections.push({
      label: 'Types / Categories',
      maxMarks: 10,
      required: true,
      minWords: 140,
      aliases: ['types', 'categories', 'classification'],
      guidance: 'Cover relevant classes or categories for the topic.',
    });
  }

  if (hasCompare) {
    sections.push({
      label: 'Advantages & Disadvantages',
      maxMarks: 10,
      required: true,
      minWords: 140,
      aliases: ['advantages and disadvantages', 'pros and cons'],
      guidance: 'Compare strengths and limitations clearly.',
    });
  }

  if (hasExamples) {
    sections.push({
      label: 'Examples',
      maxMarks: 10,
      required: true,
      minWords: 140,
      aliases: ['examples', 'case studies', 'worked examples'],
      guidance: 'Provide relevant examples that support explanations.',
    });
  }

  if (hasApplication) {
    sections.push({
      label: 'Applications',
      maxMarks: 10,
      required: true,
      minWords: 140,
      aliases: ['applications', 'use cases', 'implementation'],
      guidance: 'Explain practical application in real contexts.',
    });
  }

  if (!hasClassification && !hasCompare && !hasExamples && !hasApplication) {
    sections.push({
      label: 'Critical Analysis',
      maxMarks: 20,
      required: true,
      minWords: 180,
      aliases: ['analysis', 'critical analysis', 'discussion'],
      guidance: 'Present a reasoned analytical discussion of the topic.',
    });
  }

  const rubricSections = normalizeRubricSections(sections);
  const qualityChecks = [
    'Maintain logical flow between sections.',
    'Use topic-relevant evidence instead of generic statements.',
    'Avoid copied template text.',
  ];
  const referenceGuidance = [
    'Textbooks or peer-reviewed journals',
    'Official institution or government resources',
    'Reputable academic websites',
  ];
  const generatedDescription = [
    `Prepare an academic assignment on "${String(title || 'the given topic').trim() || 'the given topic'}".`,
    'The rubric is topic-specific and not a fixed universal template.',
    requiredPages > 0 ? `Minimum length: ${requiredPages} page(s), PDF preferred.` : 'Ensure depth and clarity across required sections.',
  ].join(' ');

  const rubricText = buildRubricTextFromSections({
    sections: rubricSections,
    qualityChecks,
    referenceGuidance,
    requiredPages,
  });

  return {
    generatedDescription,
    rubricText,
    rubricSections: rubricSections.map((section) => ({
      key: section.key,
      label: section.label,
      maxMarks: section.maxMarks,
      required: section.required,
      minWords: section.minWords,
      aliases: section.headings,
      guidance: section.guidance || '',
    })),
    qualityChecks,
    referenceGuidance,
    model: 'template',
    raw: '',
  };
};

module.exports = {
  evaluateAnswer,
  evaluateDetailedAnswer,
  generateAssignmentRubric,
  buildFallbackRubricFromTopic,
  normalizeRubricSections,
};
