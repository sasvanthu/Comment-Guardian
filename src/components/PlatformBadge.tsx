import { Twitter, Facebook, Instagram, Youtube } from "lucide-react";
import type { Platform } from "@/lib/types";

const tone: Record<Platform, string> = {
  twitter: "border-twitter/55 text-twitter",
  facebook: "border-facebook/55 text-facebook",
  instagram: "border-pink-400/55 text-pink-300",
  youtube: "border-red-500/55 text-red-500",
};
const icons: Record<Platform, React.ComponentType<{ className?: string }>> = {
  twitter: Twitter, facebook: Facebook, instagram: Instagram, youtube: Youtube,
};

export function PlatformBadge({ platform, size = "sm" }: { platform: Platform; size?: "sm" | "md" }) {
  const Icon = icons[platform];
  const label = platform === "twitter" ? "Twitter / X" : platform === "youtube" ? "YouTube" : platform[0].toUpperCase() + platform.slice(1);
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
