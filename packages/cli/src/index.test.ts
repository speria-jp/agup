import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./index.ts";

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
});
