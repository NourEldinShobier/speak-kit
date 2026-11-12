import { describe, expect, it } from "vitest";
import { splitCommand, withAudio } from "./commandline";

describe("splitCommand", () => {
  it("splits at spaces", () => {
    expect(splitCommand("whisper-cli  -m base.en -l en")).toEqual(["whisper-cli", "-m", "base.en", "-l", "en"]);
  });

  it("groups quoted words and drops the quotes", () => {
    expect(splitCommand("\"C:\\Program Files\\stt\\stt.exe\" --model 'my model'")).toEqual(["C:\\Program Files\\stt\\stt.exe", "--model", "my model"]);
  });

  it("keeps an empty quoted argument", () => {
    expect(splitCommand('tool "" x')).toEqual(["tool", "", "x"]);
  });

  it("keeps backslashes as they are", () => {
    expect(splitCommand("C:\\tools\\stt.exe -d D:\\models")).toEqual(["C:\\tools\\stt.exe", "-d", "D:\\models"]);
  });

  it("joins a quote inside a word", () => {
    expect(splitCommand('--prompt="hello world"')).toEqual(["--prompt=hello world"]);
  });

  it.each(["", "   ", '"unclosed', "tool 'unclosed"])("is undefined for %j", (line) => {
    expect(splitCommand(line)).toBeUndefined();
  });
});

describe("withAudio", () => {
  it("puts the file where {audio} stands, every time", () => {
    expect(withAudio(["stt", "--in", "{audio}", "--copy={audio}"], "a.wav")).toEqual(["stt", "--in", "a.wav", "--copy=a.wav"]);
  });

  it("adds the file at the end when the command does not say", () => {
    expect(withAudio(["stt", "-l", "en"], "a.wav")).toEqual(["stt", "-l", "en", "a.wav"]);
  });
});
