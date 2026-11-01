import type { Format } from "../../../shared/library/contract";
import type { Parsed } from "../../../shared/library/text";
import { htmlToParsed } from "./html";
import { parseFile } from ".";

export type ParseJob = { type: "file"; name: string; bytes: Uint8Array } | { type: "page"; html: string; url: string };
export interface ParseResult {
  format: Format;
  parsed: Parsed;
}
export type ParseFn = (job: ParseJob) => Promise<ParseResult>;

/** The parsing itself, in the calling thread. The app runs it in a worker (parse-runner.ts); tests call it directly. */
export const runParseJob: ParseFn = async (job) => (job.type === "file" ? parseFile(job.name, job.bytes) : { format: "html", parsed: htmlToParsed(job.html, { readable: true, url: job.url }) });
