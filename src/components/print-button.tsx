"use client";

import type { ReactNode } from "react";
import { Button } from "./ui";

/** Opens the browser's print dialog, where the page can also be saved as a PDF. */
export function PrintButton({ children, variant = "default" }: { children: ReactNode; variant?: "default" | "primary" }) {
  return (
    <Button variant={variant} type="button" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
