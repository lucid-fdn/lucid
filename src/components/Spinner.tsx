// src/components/Spinner.tsx
"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export default function Spinner() {
  return (
    <Loader2 className="h-6 w-6 animate-spin" />
  );
}
