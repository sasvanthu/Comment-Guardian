import { Twitter, Facebook, Instagram, Youtube, Linkedin } from "lucide-react";
import type { Platform } from "@/lib/types";

/* Simple Pinterest SVG icon since lucide-react doesn't have one */
function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

const tone: Record<Platform, string> = {
  twitter: "border-twitter/55 text-twitter",
  facebook: "border-facebook/55 text-facebook",
  instagram: "border-pink-400/55 text-pink-300",
  youtube: "border-red-500/55 text-red-500",
  linkedin: "border-blue-600/55 text-blue-400",
  pinterest: "border-red-600/55 text-red-400",
};
const icons: Record<Platform, React.ComponentType<{ className?: string }>> = {
  twitter: Twitter, facebook: Facebook, instagram: Instagram, youtube: Youtube,
  linkedin: Linkedin, pinterest: PinterestIcon,
};

const labelMap: Record<Platform, string> = {
  twitter: "Twitter / X",
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export function PlatformBadge({ platform, size = "sm" }: { platform: Platform; size?: "sm" | "md" }) {
  const Icon = icons[platform];
  const label = labelMap[platform] ?? platform[0].toUpperCase() + platform.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 border bg-transparent font-mono uppercase tracking-[0.14em] ${tone[platform]} ${
        size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-[2px] text-[10px]"
      }`}
      style={{ borderRadius: 4 }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
