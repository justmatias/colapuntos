"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors group"
    >
      <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
      {label}
    </Link>
  );
}
