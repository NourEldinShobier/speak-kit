/**
 * The rewrite pass's writer on this computer: a small text model (Gemma 4 E2B) run by llama.cpp through node-llama-cpp in a child process.
 * Does: the model file's catalog entry, load and unload of the model host, one tidy-up job at a time with abort, thinking switched off.
 * Does not: choose when to rewrite, decide what a rewrite may change (the dictation package checks that), or download anything but its one model file.
 */
export { LocalWriter, type WriterOptions } from "./engine";
export { WRITER_MODEL, type WriterModel } from "./catalog";
