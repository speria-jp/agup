import { describe, expect, test } from "bun:test";
import { parseCliArgs, parseConfirmationAnswer } from "./index.ts";

describe("parseCliArgs", () => {
  test("parses global options before the command", () => {
    const parsed = parseCliArgs(["--config", "configs/dev.yaml", "--state", "tmp/dev.state.json", "plan"]);

    expect(parsed).toEqual({
      command: "plan",
      options: {
        autoApprove: false,
        configPath: "configs/dev.yaml",
        statePath: "tmp/dev.state.json",
      },
      showHelp: false,
    });
  });

  test("parses global options after the command", () => {
    const parsed = parseCliArgs(["apply", "--yes", "--config", "configs/dev.yaml", "--state", "tmp/dev.state.json"]);

    expect(parsed).toEqual({
      command: "apply",
      options: {
        autoApprove: true,
        configPath: "configs/dev.yaml",
        statePath: "tmp/dev.state.json",
      },
      showHelp: false,
    });
  });

  test("treats version flag as the version command", () => {
    expect(parseCliArgs(["--version"])).toEqual({
      command: "version",
      options: {
        autoApprove: false,
        configPath: "agup.yaml",
        statePath: "agup.state.json",
      },
      showHelp: false,
    });
  });

  test("treats help flag as usage output trigger", () => {
    expect(parseCliArgs(["--help"])).toEqual({
      command: null,
      options: {
        autoApprove: false,
        configPath: "agup.yaml",
        statePath: "agup.state.json",
      },
      showHelp: true,
    });
  });

  test("throws when --config is missing a value", () => {
    expect(() => parseCliArgs(["plan", "--config"])).toThrow("Missing value for --config.");
  });

  test("throws when --state is missing a value", () => {
    expect(() => parseCliArgs(["plan", "--state"])).toThrow("Missing value for --state.");
  });

  test("throws on unknown options", () => {
    expect(() => parseCliArgs(["plan", "--wat"])).toThrow("Unknown option: --wat");
  });

  test("throws when help flag is combined with another command", () => {
    expect(() => parseCliArgs(["plan", "--help"])).toThrow(
      "The help flag cannot be combined with another command.",
    );
  });

  test("throws when version and help flags are combined", () => {
    expect(() => parseCliArgs(["--help", "--version"])).toThrow(
      "The version flag cannot be combined with the help flag.",
    );
  });
});

describe("parseConfirmationAnswer", () => {
  test("accepts y and yes in a case-insensitive way", () => {
    expect(parseConfirmationAnswer("y")).toBe(true);
    expect(parseConfirmationAnswer("YES")).toBe(true);
    expect(parseConfirmationAnswer(" yes ")).toBe(true);
  });

  test("rejects empty and non-affirmative answers", () => {
    expect(parseConfirmationAnswer("")).toBe(false);
    expect(parseConfirmationAnswer("n")).toBe(false);
    expect(parseConfirmationAnswer("no")).toBe(false);
  });
});
