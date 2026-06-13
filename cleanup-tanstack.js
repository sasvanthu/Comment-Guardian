import fs from "fs";
import path from "path";

function processFile(filePath) {
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return;
  let content = fs.readFileSync(filePath, "utf-8");
  let original = content;

  // Replace react-router imports
  content = content.replace(/import\s+{([^}]+)}\s+from\s+"@tanstack\/react-router";/g, (match, p1) => {
    let newImports = [];
    if (p1.includes("Link")) newImports.push("Link");
    if (p1.includes("useNavigate")) newImports.push("useNavigate");
    // mock useRouterState
    if (newImports.length > 0) return `import { ${newImports.join(", ")} } from "react-router-dom";`;
    return "";
  });

  // Mock useRouterState
  content = content.replace(/useRouterState\(\)/g, "{ location: { pathname: window.location.pathname } }");
  content = content.replace(/useRouter\(\)/g, "{ invalidate: () => window.location.reload() }");

  // Remove react-start imports and useServerFn
  content = content.replace(/import\s+{([^}]+)}\s+from\s+"@tanstack\/react-start(?:[^"]*)";/g, "");
  content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*useServerFn\(([a-zA-Z0-9_]+)\);/g, "const $1 = $2;");

  // Replace react-query imports with standard React hooks or just comment them out if complex
  // For now, let's replace with a local mock or just keep them and reinstall react-query.
  // Actually it's easier to reinstall react-query because it's widely used and usually people just want to remove the SSR/Routing part of TanStack Start.
  
  // Remove createServerFn wrapper
  // export const myFn = createServerFn({ method: "POST" }).inputValidator(...).handler(async ({ data }) => { ... })
  // We'll use regex to strip it.
  content = content.replace(/export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*createServerFn\(\{[^}]*\}\)\s*(?:\.inputValidator\([^)]*\)\s*)?\.handler\(\s*async\s*\(\{\s*data\s*\}\)\s*=>\s*\{([\s\S]*?)\}\s*\);/g, "export const $1 = async (data: any) => {$2};");
  content = content.replace(/export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*createServerFn\(\{[^}]*\}\)\s*(?:\.validator\([^)]*\)\s*)?\.handler\(\s*async\s*\(\{\s*data\s*\}\)\s*=>\s*\{([\s\S]*?)\}\s*\);/g, "export const $1 = async (data: any) => {$2};");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Cleaned up: ${filePath}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walkDir(filePath);
    } else {
      processFile(filePath);
    }
  }
}

walkDir(path.join(process.cwd(), "src"));
console.log("Cleanup done.");
