const fs = require('fs/promises');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const resolveBackendPath = (filePath) => {
  if (!filePath) return '';
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(__dirname, '..', filePath);
};

const extractPDFText = async (filePath) => {
  const resolved = resolveBackendPath(filePath);
  if (!resolved) return '';

  const dataBuffer = await fs.readFile(resolved);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const data = await parser.getText();
    return String(data.text || '').trim();
  } finally {
    await parser.destroy();
  }
};

const extractPDFPageCount = async (filePath) => {
  const resolved = resolveBackendPath(filePath);
  if (!resolved) return null;

  const dataBuffer = await fs.readFile(resolved);
  const parser = new PDFParse({ data: dataBuffer });

  try {
    const info = await parser.getInfo();
    const totalPages = Number(info?.total);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return null;
    return Math.trunc(totalPages);
  } finally {
    await parser.destroy();
  }
};

module.exports = { extractPDFText, extractPDFPageCount };
