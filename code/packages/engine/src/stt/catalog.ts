import { LANGUAGES, type SttLanguage } from "./languages";
import { MEASURED, type Measured } from "./measured";
import { cpuFloorModel, recommendedPreference } from "./recommend";

export type { SttLanguage } from "./languages";
export type BuiltinSttModelId =
  | "large-v3-turbo-q5_0"
  | "parakeet-tdt-0.6b-v3-q4_0"
  | "tiny-q5_1"
  | "tiny"
  | "base-q5_1"
  | "base"
  | "small-q5_1"
  | "small"
  | "medium-q5_0"
  | "medium"
  | "large-v3-q5_0"
  | "large-v3"
  | "large-v3-turbo-q8_0"
  | "large-v3-turbo"
  | "distil-large-v3"
  | "parakeet-tdt-0.6b-v3-q8_0"
  | "parakeet-ultra-q8_0";
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
  /** What running the model on our test recordings showed; absent for a model the person added. */
  measured?: Measured;
  origin: "builtin" | "custom";
  /** The model this one is the newer version of; the page hints at it but never switches by itself. */
  replaces?: SttModelId;
}

const WHISPER_LANGUAGES: readonly SttLanguage[] = ["auto", ...LANGUAGES.map((l) => l.code)];

const WHISPER_LICENSE = { name: "MIT", url: "https://github.com/openai/whisper/blob/main/LICENSE" };
const WHISPER_HOST = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

type WhisperSpec = Pick<SttModel, "id" | "name" | "tag" | "description" | "bytes" | "sha256"> & { file: string };

/** A model of the official whisper.cpp repository: the same engine, one more size or precision. */
const whisper = (m: WhisperSpec): SttModel => ({
  ...m,
  engine: "whisper",
  label: m.tag,
  url: `${WHISPER_HOST}/${m.file}`,
  languages: WHISPER_LANGUAGES,
  detects: true,
  license: WHISPER_LICENSE,
  measured: MEASURED[m.id as keyof typeof MEASURED],
  origin: "builtin",
});

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
    measured: MEASURED["large-v3-turbo-q5_0"],
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
    license: { name: "CC BY 4.0", url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" },
    measured: MEASURED["parakeet-tdt-0.6b-v3-q4_0"],
    origin: "builtin",
  },
  whisper({
    id: "tiny-q5_1",
    name: "Whisper Tiny (5-bit)",
    tag: "Tiny",
    description: "The smallest download and the quickest on a weak computer. Misses many words, so use it only when nothing larger runs.",
    file: "ggml-tiny-q5_1.bin",
    sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
    bytes: 32152673,
  }),
  whisper({
    id: "tiny",
    name: "Whisper Tiny",
    tag: "Tiny",
    description: "The smallest Whisper model at full precision. Misses many words.",
    file: "ggml-tiny.bin",
    sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    bytes: 77691713,
  }),
  whisper({
    id: "base-q5_1",
    name: "Whisper Base (5-bit)",
    tag: "Basic",
    description: "Small and quick on any computer. Fine for short English; weaker in German and Arabic.",
    file: "ggml-base-q5_1.bin",
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    bytes: 59707625,
  }),
  whisper({
    id: "base",
    name: "Whisper Base",
    tag: "Basic",
    description: "Whisper Base at full precision.",
    file: "ggml-base.bin",
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    bytes: 147951465,
  }),
  whisper({
    id: "small-q5_1",
    name: "Whisper Small (5-bit)",
    tag: "Balanced",
    description: "A middle size: good English, usable German and Arabic, and a small download.",
    file: "ggml-small-q5_1.bin",
    sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    bytes: 190085487,
  }),
  whisper({
    id: "small",
    name: "Whisper Small",
    tag: "Balanced",
    description: "Whisper Small at full precision.",
    file: "ggml-small.bin",
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    bytes: 487601967,
  }),
  whisper({
    id: "medium-q5_0",
    name: "Whisper Medium (5-bit)",
    tag: "Balanced",
    description: "More accurate than Small in every language we measured; needs a graphics card or a strong processor to feel quick.",
    file: "ggml-medium-q5_0.bin",
    sha256: "19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f",
    bytes: 539212467,
  }),
  whisper({
    id: "medium",
    name: "Whisper Medium",
    tag: "Balanced",
    description: "Whisper Medium at full precision. A large file for little gain over the 5-bit one.",
    file: "ggml-medium.bin",
    sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
    bytes: 1533763059,
  }),
  whisper({
    id: "large-v3-q5_0",
    name: "Whisper Large v3 (5-bit)",
    tag: "Accurate",
    description: "The full large model, compressed. Slower than Large v3 Turbo for about the same accuracy.",
    file: "ggml-large-v3-q5_0.bin",
    sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
    bytes: 1081140203,
  }),
  whisper({
    id: "large-v3",
    name: "Whisper Large v3",
    tag: "Accurate",
    description: "The largest Whisper model at full precision. A 3 GB file; needs a graphics card with plenty of memory.",
    file: "ggml-large-v3.bin",
    sha256: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
    bytes: 3095033483,
  }),
  whisper({
    id: "large-v3-turbo-q8_0",
    name: "Whisper Large v3 Turbo (8-bit)",
    tag: "Accurate",
    description: "Large v3 Turbo with less compression than the default; a larger file for a small gain in accuracy.",
    file: "ggml-large-v3-turbo-q8_0.bin",
    sha256: "317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1",
    bytes: 874188075,
  }),
  whisper({
    id: "large-v3-turbo",
    name: "Whisper Large v3 Turbo (full precision)",
    tag: "Accurate",
    description: "Large v3 Turbo without compression. A 1.6 GB file.",
    file: "ggml-large-v3-turbo.bin",
    sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
    bytes: 1624555275,
  }),
  {
    id: "distil-large-v3",
    engine: "whisper",
    name: "Distil-Whisper Large v3",
    label: "English",
    tag: "English",
    description: "A shortened large model for English only. Quick with a graphics card.",
    file: "ggml-distil-large-v3.bin",
    url: "https://huggingface.co/distil-whisper/distil-large-v3-ggml/resolve/main/ggml-distil-large-v3.bin",
    sha256: "2883a11b90fb10ed592d826edeaee7d2929bf1ab985109fe9e1e7b4d2b69a298",
    bytes: 1519521155,
    languages: ["en"],
    detects: false,
    license: { name: "MIT", url: "https://huggingface.co/distil-whisper/distil-large-v3-ggml" },
    measured: MEASURED["distil-large-v3"],
    origin: "builtin",
  },
  {
    id: "parakeet-tdt-0.6b-v3-q8_0",
    engine: "parakeet",
    name: "Parakeet v3 (8-bit)",
    label: "Fast (English and German)",
    tag: "Fast",
    description: "Parakeet v3 with less compression than the default. English and German only.",
    file: "ggml-parakeet-tdt-0.6b-v3-q8_0.bin",
    url: "https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q8_0.bin",
    sha256: "4d64e9e96c2792186d072fde0034df0ad670cf680a2f53069052ead827fd600e",
    bytes: 668757119,
    languages: ["en", "de"],
    detects: false,
    license: { name: "CC BY 4.0", url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3" },
    measured: MEASURED["parakeet-tdt-0.6b-v3-q8_0"],
    origin: "builtin",
  },
  {
    id: "parakeet-ultra-q8_0",
    engine: "parakeet",
    name: "Parakeet Ultra (8-bit)",
    label: "Fast (English and German)",
    tag: "Fast",
    description: "A retrained Parakeet v3 from Moondream, as fast as Parakeet v3 and as accurate on our recordings. English and German only.",
    file: "ggml-parakeet-ultra-q8_0.bin",
    url: "https://huggingface.co/s1lvrn0/parakeet-ultra-ggml/resolve/main/ggml-parakeet-ultra-q8_0.bin",
    sha256: "0ec111f8124874c0ec43fe263ae84043e3ee7b2049fd37539ab55be6e1cf8b7b",
    bytes: 668757119,
    languages: ["en", "de"],
    detects: false,
    license: { name: "CC BY 4.0", url: "https://huggingface.co/moondream/parakeet-ultra" },
    measured: MEASURED["parakeet-ultra-q8_0"],
    origin: "builtin",
  },
];

export const DEFAULT_STT_MODEL: SttModelId = "large-v3-turbo-q5_0";

/** The model recommended per language on a computer with a graphics card, derived from what the test recordings showed. */
export const PREFERRED_MODEL: Record<string, SttModelId> = recommendedPreference(STT_MODELS, "gpu") as Record<string, SttModelId>;

/** The same on a computer without a usable graphics card, where only models that are quick enough on the CPU count. */
export const PREFERRED_MODEL_CPU: Record<string, SttModelId> = recommendedPreference(STT_MODELS, "cpu") as Record<string, SttModelId>;

/** The models the short lists offer: the default, the ones recommended for some language, and the floor model for a weak computer. The Engines page lists all of them. */
export const FEATURED_STT_MODELS: ReadonlySet<string> = new Set([
  DEFAULT_STT_MODEL,
  ...Object.values(PREFERRED_MODEL),
  ...Object.values(PREFERRED_MODEL_CPU),
  cpuFloorModel(STT_MODELS)?.id ?? DEFAULT_STT_MODEL,
]);

/** Silero voice activity model, loaded next to every speech model. */
export const STT_VAD: ModelFile = {
  file: "ggml-silero-v5.1.2.bin",
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
  sha256: "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf",
  bytes: 885098,
};
