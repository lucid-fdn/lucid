// components/MatrixThinkingText.tsx
"use client";

import React from "react";

export default function MatrixThinkingText() {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-yellow-300">Thinking</span>
      <span className="flex space-x-1">
        <span className="w-1 h-1 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
        <span className="w-1 h-1 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
        <span className="w-1 h-1 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
      </span>
    </div>
  );
}
