/**
 * Transcripts from audio: a store with a manifest, trash and retention, BM25 search, exporters, chunked transcription that resumes, and the facade the app uses.
 * Everything that touches a disk, the engine or the clock comes in through `createTranscripts(deps)`.
 */
export { createTranscripts, type Detail, type Outcome, type Row, type Transcripts, type TranscriptsDeps } from "./transcripts";
export { nodeFs, DiskFullError, type Fs } from "./fs";
export { FORMATS, clock, cues, plainText, render, type Format } from "./export";
export { findMatches, snippetAround, tokenize, SearchIndex, type Match } from "./search";
export { checkFile, failures, knownExtension, sniff, AUDIO_FORMATS, FORMAT_LIST, MAX_BYTES, MAX_COMPRESSED_BYTES, MAX_HOURS, type AudioFormat, type Check } from "./formats";
export { decodeWav, decodeWavAsync, encodeWav16k, wavInfo, WavError, WavTooLong } from "./wav";
export { planChunks, RATE, type Chunk } from "./chunker";
export { runJob, HUNG, type ChunkResult, type JobResult } from "./job";
export { createGate, JobQueue, QueueFullError } from "./queue";
export { DEFAULT_POLICY, audioTotal, daysLeft, normalizePolicy, sweep, type Policy, type Sweep } from "./retention";
export { freePath, removeIfUnchanged, safeName, saveExport, sha256, type Saved } from "./files";
export { openStore, Store, StoreError } from "./store";
export { provisionalTitle } from "./title";
export type { Entry, ExportedFile, Failure, FailureCode, Segment, Source, Status, Transcript } from "./types";
