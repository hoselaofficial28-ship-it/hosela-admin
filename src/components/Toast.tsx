"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
}

export default function Toast({ message, type = "success", onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${visible ? "animate-toast" : "opacity-0 translate-y-4"}`}>
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}>
        {type === "success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {message}
        <button onClick={() => { setVisible(false); setTimeout(onClose, 300); }} className="ml-2 hover:opacity-70">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
