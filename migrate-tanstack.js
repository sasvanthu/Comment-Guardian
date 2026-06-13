import fs from "fs";
import path from "path";

const routesDir = path.join(process.cwd(), "src", "routes");

function processFile(filePath) {
  if (!filePath.endsWith(".tsx")) return;
  let content = fs.readFileSync(filePath, "utf-8");

  // 1. Remove tanstack imports
  content = content.replace(/import\s+{([^}]+)}\s+from\s+"@tanstack\/react-router";/g, (match, p1) => {
    if (p1.includes("Link")) {
      return `import { Link } from "react-router-dom";`;
    }
    return "";
  });
  content = content.replace(/import\s+{([^}]+)}\s+from\s+"@tanstack\/react-start";/g, "");

  // 2. Remove createFileRoute boilerplate
  // export const Route = createFileRoute("/admin")({ component: AdminSettings });
  // => export default AdminSettings;
  let componentName = null;
  content = content.replace(/export\s+const\s+Route\s*=\s*createFileRoute\([^)]*\)\(\{[\s\S]*?component:\s*([A-Za-z0-9_]+)[^}]*\}\);/, (match, p1) => {
    componentName = p1;
    return `export default ${p1};`;
  });

  // 3. Remove useServerFn usage
  // const translate = useServerFn(translateText); => const translate = translateText;
  content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*useServerFn\(([a-zA-Z0-9_]+)\);/g, "const $1 = $2;");

  // If the file exports a component and doesn't export default, add it.
  if (componentName) {
    if (!content.includes(`export default ${componentName};`)) {
       content += `\nexport default ${componentName};\n`;
    }
  } else {
    // If it's something like export const Route = createFileRoute("/")({ component: function() { ... } })
    // We'll have to manually fix it, but let's hope they are named.
  }

  // 4. Remove useSearch, useParams and replace with react-router-dom equivalents (basic)
  content = content.replace(/useSearch\({[^}]*}\)/g, "(() => ({}))()"); // Hack, will need manual fix if used heavily

  fs.writeFileSync(filePath, content);
  console.log(`Processed: ${filePath}`);
}

function walkDir(dir) {
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

walkDir(routesDir);
console.log("Done.");
