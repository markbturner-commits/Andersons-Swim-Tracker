// Named error classes for the PDF pipeline.
// Every catch site in /api/parse-pdf and /api/results/confirm must name one of these;
// the UI maps `error.code` → message. No generic `Error`s, no silent failures.

export type PdfErrorCode =
  | "PDF_TEXT_EXTRACTION_EMPTY"
  | "PDF_FORMAT_UNRECOGNIZED"
  | "LLM_PARSE_ERROR"
  | "LLM_UNAVAILABLE"
  | "LLM_RATE_LIMITED"
  | "DUPLICATE_FILE"
  | "FILE_TOO_LARGE"
  | "FILE_WRONG_TYPE"
  | "NO_RESULTS_FOUND";

export class PdfPipelineError extends Error {
  readonly code: PdfErrorCode;
  readonly userMessage: string;

  constructor(code: PdfErrorCode, userMessage: string, message?: string) {
    super(message ?? userMessage);
    this.code = code;
    this.userMessage = userMessage;
    this.name = new.target.name;
  }
}

export class PdfTextExtractionEmpty extends PdfPipelineError {
  constructor(message?: string) {
    super(
      "PDF_TEXT_EXTRACTION_EMPTY",
      "PDF contains no extractable text — likely a scanned image. Try manual entry.",
      message,
    );
  }
}

export class PdfFormatUnrecognized extends PdfPipelineError {
  constructor(coverage?: number) {
    super(
      "PDF_FORMAT_UNRECOGNIZED",
      "We couldn't recognize this PDF's format. Trying the AI parser as a fallback…",
      coverage !== undefined ? `Regex coverage ${(coverage * 100).toFixed(1)}% below threshold` : undefined,
    );
  }
}

export class LLMParseError extends PdfPipelineError {
  constructor(detail?: string) {
    super(
      "LLM_PARSE_ERROR",
      "AI parser returned invalid data — please use manual entry.",
      detail,
    );
  }
}

export class LLMUnavailable extends PdfPipelineError {
  constructor(detail?: string) {
    super(
      "LLM_UNAVAILABLE",
      "AI parser is temporarily unavailable. Try again in a minute or use manual entry.",
      detail,
    );
  }
}

export class LLMRateLimited extends PdfPipelineError {
  constructor(detail?: string) {
    super(
      "LLM_RATE_LIMITED",
      "AI parser is rate-limited. Wait a moment and try again.",
      detail,
    );
  }
}

export class DuplicateFile extends PdfPipelineError {
  readonly uploadId: string;
  constructor(uploadId: string) {
    super(
      "DUPLICATE_FILE",
      "You've already uploaded this exact PDF. Showing your prior parse results.",
    );
    this.uploadId = uploadId;
  }
}

export class FileTooLarge extends PdfPipelineError {
  constructor(sizeMb: number) {
    super(
      "FILE_TOO_LARGE",
      `PDF is too large (${sizeMb.toFixed(1)} MB). Max upload size is 10 MB.`,
    );
  }
}

export class FileWrongType extends PdfPipelineError {
  constructor(mime: string) {
    super(
      "FILE_WRONG_TYPE",
      `That file isn't a PDF (got ${mime}). Please upload a meet results PDF.`,
    );
  }
}

export class NoResultsFound extends PdfPipelineError {
  constructor() {
    super(
      "NO_RESULTS_FOUND",
      "We couldn't find any results in this PDF. Try manual entry instead.",
    );
  }
}
