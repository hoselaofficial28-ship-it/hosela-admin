import { NotebookPen } from "lucide-react";

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
}

export function BrandMark({ className = "w-9 h-9", iconClassName = "w-5 h-5" }: BrandMarkProps) {
  return (
    <div
      className={`${className} relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white shadow-sm flex items-center justify-center`}
    >
      <div className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-amber-300/70" />
      <div className="absolute -left-3 -bottom-3 h-9 w-9 rounded-full bg-emerald-300/45" />
      <NotebookPen className={`${iconClassName} relative z-10`} />
    </div>
  );
}
