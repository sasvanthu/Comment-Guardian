import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';

async function createServer() {
  const app = express();
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    const url = req.originalUrl;
    try {
      // 1. Read index.html
      let template = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
      
      // 2. Apply Vite HTML transforms
      template = await vite.transformIndexHtml(url, template);
      
      // 3. Load the server entry
      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
      
      // 4. Render the app HTML
      const appHtml = render(url);
      
      // 5. Inject the app-rendered HTML into the template
      const html = template.replace(`<!--ssr-outlet-->`, appHtml);
      
      // 6. Send the rendered HTML back
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  const port = process.env.PORT || 5173;
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

createServer();
