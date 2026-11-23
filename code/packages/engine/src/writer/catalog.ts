import type { ModelFile } from "../stt/catalog";

/** The text model that tidies dictated text on this computer (the rewrite pass's "On this computer" writer). */
export interface WriterModel extends ModelFile {
  id: string;
  name: string;
  description: string;
  license: { name: string; url: string };
}

/**
 * Gemma 4 E2B, instruction tuned, quantization-aware trained at 4 bits, published by Google (Apache 2.0). The file sits in the same models
 * folder as the speech models, so disk use, the folder button and "delete downloaded models" cover it.
 */
export const WRITER_MODEL: WriterModel = {
  id: "writer-gemma-4-e2b",
  name: "Gemma 4 E2B",
  description: "Tidies punctuation, capitals and speech-recognition mistakes in dictated text, in the language you spoke. Runs on this computer, offline.",
  file: "gemma-4-E2B_q4_0-it.gguf",
  url: "https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/main/gemma-4-E2B_q4_0-it.gguf",
  sha256: "fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634",
  bytes: 3349516256,
  license: { name: "Apache 2.0", url: "https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf" },
};
