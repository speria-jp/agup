import { fail } from "node:assert";
import { $ } from "bun";
import { inc, valid as isValidVersion, type ReleaseType } from "semver";

const packagePaths = [
  "./packages/core/package.json",
  "./packages/cli/package.json",
];

const variants: ReleaseType[] = [
  "major",
  "premajor",
  "minor",
  "preminor",
  "patch",
  "prepatch",
  "prerelease",
];

const isValidTarget = (subject: string): subject is ReleaseType =>
  (variants as string[]).includes(subject);

const isDirty = async () => (await $`git status --porcelain`.quiet()).text();

const target = Bun.argv.pop();

const first = await Bun.file(packagePaths[0]).json();
const current: string = first.version;

if (!isValidVersion(current))
  throw new Error(`Invalid current version ${current}`);

if (await isDirty())
  throw new Error(
    "There are uncommitted changes. Commit them before releasing.",
  );

const desired = isValidVersion(target)
  ? target
  : target && isValidTarget(target)
    ? inc(current, target, "beta", "1")
    : fail("invalid target version");

if (!desired) throw new Error("Failed to bump");
console.debug(current, "—>", desired);

for (const path of packagePaths) {
  const json = await Bun.file(path).json();
  await Bun.write(
    path,
    JSON.stringify(Object.assign(json, { version: desired }), null, 2),
  );
}

await $`git add ${packagePaths}`;
await $`git commit -m v${desired}`;
await $`git tag v${desired}`;
await $`git push`;
await $`git push --tags`;
