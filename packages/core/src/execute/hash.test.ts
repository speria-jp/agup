import { describe, expect, test } from "bun:test";
import { computeHash, computeSkillHash } from "./hash.ts";

describe("computeHash", () => {
  test("H-1: same content produces same hash", () => {
    const data = { name: "test", value: "hello" };
    const hash1 = computeHash(data);
    const hash2 = computeHash(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("H-2: different key order produces same hash", () => {
    const hash1 = computeHash({ a: "1", b: "2" });
    const hash2 = computeHash({ b: "2", a: "1" });
    expect(hash1).toBe(hash2);
  });

  test("H-3: different value produces different hash", () => {
    const hash1 = computeHash({ name: "test" });
    const hash2 = computeHash({ name: "changed" });
    expect(hash1).not.toBe(hash2);
  });

  test("H-4: skill directory hash changes with added file", () => {
    const files1 = [{ path: "SKILL.md", content: "# Skill" }];
    const files2 = [
      { path: "SKILL.md", content: "# Skill" },
      { path: "extra.md", content: "Extra" },
    ];
    const hash1 = computeSkillHash("Title", files1);
    const hash2 = computeSkillHash("Title", files2);
    expect(hash1).not.toBe(hash2);
  });
});
