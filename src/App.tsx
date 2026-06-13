import { Routes, Route } from "react-router-dom";

// Import all pages
import Dashboard from "./routes/index";
import Admin from "./routes/admin";
import Auth from "./routes/auth";
import Blacklist from "./routes/blacklist";
import Comments from "./routes/comments";
import Cyberbullying from "./routes/cyberbullying";
import Moderation from "./routes/moderation";
import Negative from "./routes/negative";
import Reports from "./routes/reports";
import Research from "./routes/research";
import Review from "./routes/review";
import Settings from "./routes/settings";
import Translator from "./routes/translator";
import Workflows from "./routes/workflows";
import { AuthProvider } from "./hooks/use-auth";
import { AuthGate } from "./components/AuthGate";
import { Toaster } from "./components/ui/sonner";

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/blacklist" element={<Blacklist />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/cyberbullying" element={<Cyberbullying />} />
          <Route path="/moderation" element={<Moderation />} />
          <Route path="/negative" element={<Negative />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/research" element={<Research />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/translator" element={<Translator />} />
          <Route path="/workflows" element={<Workflows />} />
        </Routes>
      </AuthGate>
      <Toaster theme="dark" position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
