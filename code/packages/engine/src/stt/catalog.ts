export type SttLanguage = "auto" | "en" | "de" | "ar";
export type SttModelId = "large-v3-turbo-q5_0" | "parakeet-tdt-0.6b-v3-q4_0";

export interface ModelFile {
  /** File name inside <modelsDir>/stt. */
  file: string;
  url: string;
  /** Lower-case hex SHA-256 of the whole file; a download that does not match is deleted. */
  sha256: string;
  bytes: number;
}

export interface SttModel extends ModelFile {
  id: SttModelId;
  /** Which whisper.cpp engine runs the file. */
  engine: "whisper" | "parakeet";
  label: string;
  languages: readonly SttLanguage[];
}

export const STT_MODELS: readonly SttModel[] = [
  {
    id: "large-v3-turbo-q5_0",
    engine: "whisper",
    label: "Accurate",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    bytes: 574041195,
    languages: ["auto", "en", "de", "ar"],
  },
  {
    id: "parakeet-tdt-0.6b-v3-q4_0",
    engine: "parakeet",
    label: "Fast (English and German)",
    file: "ggml-parakeet-tdt-0.6b-v3-q4_0.bin",
    url: "https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q4_0.bin",
    sha256: "aa7fe2f5fb47d863ca23e8b1d490632d63a2599f515268b6d6bd656158dad45e",
    bytes: 355615679,
    languages: ["auto", "en", "de"],
  },
];

export const DEFAULT_STT_MODEL: SttModelId = "large-v3-turbo-q5_0";

/** Silero voice activity model, loaded next to every speech model. */
export const STT_VAD: ModelFile = {
  file: "ggml-silero-v5.1.2.bin",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
  sha256: "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf",
  bytes: 885098,
};
