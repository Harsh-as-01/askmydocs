/**
 * STAGE 1 — LOAD
 *
 * Extracts raw text from a PDF buffer. This is the entry point of the RAG
 * pipeline: everything downstream (chunking, embedding, retrieval) operates
 * on the plain text produced here.
 */

// Note: we import pdf-parse's internal module directly. The package's main
// entry (index.js) runs debug/test code when it can't detect a parent module,
// which crashes under ES modules. Importing lib/pdf-parse.js skips that.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/**
 * Extract text from a PDF.
 *
 * @param {Buffer} buffer - Raw PDF file bytes.
 * @returns {Promise<{ text: string, numPages: number }>}
 * @throws  If the PDF is unreadable or contains no extractable text
 *          (e.g. a scanned/image-only PDF, which would need OCR).
 */
export async function loadPdf(buffer) {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    throw new Error(`Could not parse PDF: ${err.message}`);
  }

  // Normalize whitespace: PDFs often produce stray line breaks mid-sentence.
  // Collapsing runs of whitespace gives the chunker cleaner sentences to
  // split on, which improves embedding quality.
  const text = (parsed.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length === 0) {
    throw new Error(
      'No extractable text found in this PDF. It may be a scanned document ' +
        '(images of pages instead of real text) — those require OCR, which ' +
        'this tool does not perform.'
    );
  }

  return { text, numPages: parsed.numpages };
}
