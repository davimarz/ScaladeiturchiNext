import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

function findChromiumPackageRoot(resolvedPath) {
  let dir = dirname(resolvedPath.replace(/^file:\/\//, ""));
  for (let i = 0; i < 8; i++) {
    const packageJson = join(dir, "package.json");
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, "utf8"));
        if (pkg.name === "@sparticuz/chromium") return dir;
      } catch {}
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function main() {
  const chromiumResolvedPath = import.meta.resolve("@sparticuz/chromium");
  const chromiumRoot = findChromiumPackageRoot(chromiumResolvedPath);
  if (!chromiumRoot) throw new Error("Unable to locate @sparticuz/chromium package root");

  const binDir = join(chromiumRoot, "bin");
  if (!existsSync(binDir)) throw new Error("Chromium bin directory not found at " + binDir);

  const publicDir = join(projectRoot, "public");
  const outputPath = join(publicDir, "chromium-pack.tar");
  execSync(`mkdir -p "${publicDir}" && tar -cf "${outputPath}" -C "${binDir}" .`, {
    stdio: "inherit",
    cwd: projectRoot,
  });
  console.log("Chromium archive created:", outputPath);
}

main().catch((error) => {
  console.error("Failed to package Chromium:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
