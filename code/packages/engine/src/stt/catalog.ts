import { LANGUAGES, type SttLanguage } from "./languages";

export type { SttLanguage } from "./languages";
export type BuiltinSttModelId = "large-v3-turbo-q5_0" | "parakeet-tdt-0.6b-v3-q4_0";
/** A model the person added from a file: "custom-" and the first twelve hex digits of its SHA-256. */
export type CustomSttModelId = `custom-${string}`;
export type SttModelId = BuiltinSttModelId | CustomSttModelId;
export const isCustomModelId = (id: string): id is CustomSttModelId => /^custom-[0-9a-f]{12}$/.test(id);

export interface ModelFile {
  /** File name inside <modelsDir>/stt. */
  file: string;
  url: string;
  /** Other hosts with the same file, tried in order when `url` cannot be reached. */
  mirrors?: readonly string[];
  /** Lower-case hex SHA-256 of the whole file; a download that does not match is deleted. */
  sha256: string;
  bytes: number;
}

/** A published accuracy figure: always shown with the language it was measured in and where it comes from. */
export interface Accuracy {
  /** One wrong word in this many. */
  wrongWordOneIn: number;
  testLanguage: SttLanguage;
  source: string;
}

export interface SttModel extends ModelFile {
  id: SttModelId;
  /** Which whisper.cpp engine runs the file. */
  engine: "whisper" | "parakeet";
  /** Full name, e.g. "Whisper Large v3 Turbo". */
  name: string;
  label: string;
  /** One word that sets it apart in lists. */
  tag: string;
  description: string;
  languages: readonly SttLanguage[];
  /** The model can choose the language itself. */
  detects: boolean;
  license: { name: string; url: string };
  accuracy?: Accuracy;
  /** Seconds to transcribe a ten second sentence on a typical computer. */
  speedSeconds?: number;
  origin: "builtin" | "custom";
  /** The model this one is the newer version of; the page hints at it but never switches by itself. */
  replaces?: SttModelId;
}

const WHISPER_LANGUAGES: readonly SttLanguage[] = ["auto", ...LANGUAGES.map((l) => l.code)];

export const STT_MODELS: readonly SttModel[] = [
  {
    id: "large-v3-turbo-q5_0",
    engine: "whisper",
    name: "Whisper Large v3 Turbo",
    label: "Accurate",
    tag: "Accurate",
    description: "Best accuracy in German, Arabic and many more languages. Quick with a graphics card.",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    bytes: 574041195,
    languages: WHISPER_LANGUAGES,
    detects: true,
    license: { name: "MIT", url: "https://github.com/openai/whisper/blob/main/LICENSE" },
    accuracy: { wrongWordOneIn: 25, testLanguage: "en", source: "published English benchmark" },
    speedSeconds: 2,
    origin: "builtin",
  },
  {
    id: "parakeet-tdt-0.6b-v3-q4_0",
    engine: "parakeet",
    name: "Parakeet v3",
    label: "Fast (English and German)",
    tag: "Fast",
    description: "Very fast on any computer. English and German only.",
    file: "ggml-parakeet-tdt-0.6b-v3-q4_0.bin",
    url: "https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q4_0.bin",
    sha256: "aa7fe2f5fb47d863ca23e8b1d490632d63a2599f515268b6d6bd656158dad45e",
    bytes: 355615679,
    languages: ["en", "de"],
    detects: false,
    license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
    accuracy: { wrongWordOneIn: 18, testLanguage: "en", source: "published English benchmark" },
    speedSeconds: 1,
    origin: "builtin",
  },
];

export const DEFAULT_STT_MODEL: SttModelId = "large-v3-turbo-q5_0";

/** The model Speak Kit prefers for a language when both fit: the fast one for English, the accurate one elsewhere. */
export const PREFERRED_MODEL: Record<string, SttModelId> = { en: "parakeet-tdt-0.6b-v3-q4_0" };

/** Silero voice activity model, loaded next to every speech model. */
export const STT_VAD: ModelFile = {
  file: "ggml-silero-v5.1.2.bin",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
  sha256: "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf",
  bytes: 885098,
};
