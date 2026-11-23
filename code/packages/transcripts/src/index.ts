/**
 * Transcripts from audio: a store with a manifest and retention, BM25 search, chunked transcription that resumes, and the facade the app uses.
 * Everything that touches a disk, the engine or the clock comes in through `createTranscripts(deps)`.
 */
export { createTranscripts, type Detail, type Outcome, type Row, type Transcripts, type TranscriptsDeps } from "./transcripts";
export { nodeFs, DiskFullError, type Fs } from "./fs";
export { viewOf, type NoteDoc, type NotesRecord, type NotesState, type NotesView, type Summarise, type SummariseResult } from "./notes";
export { writeNotes } from "./notes-writer";
export { clock, plainText } from "./text";
export { findMatches, snippetAround, tokenize, SearchIndex, type Match } from "./search";
export { checkFile, failures, knownExtension, sniff, AUDIO_FORMATS, FORMAT_LIST, MAX_BYTES, MAX_COMPRESSED_BYTES, MAX_HOURS, type AudioFormat, type Check } from "./formats";
export { decodeWav, decodeWavAsync, encodeWav16k, wavInfo, WavError, WavTooLong } from "./wav";
export { planChunks, RATE, type Chunk } from "./chunker";
export { runJob, HUNG, type ChunkResult, type JobResult } from "./job";
export { createGate, createGates, createPreempt, JobQueue, QueueFullError } from "./queue";
export { AUDIO_CAP_BYTES, AUDIO_DAYS, TEXT_DAYS, audioTotal, daysLeft, sweep, type Sweep } from "./retention";
export { openStore, Store, StoreError } from "./store";
export { provisionalTitle } from "./title";
export type { Entry, Failure, FailureCode, Segment, Status, Transcript } from "./types";
