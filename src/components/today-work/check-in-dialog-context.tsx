"use client";

import { createContext, useContext } from "react";

const CheckInDialogContext = createContext<(() => void) | null>(null);

export function CheckInDialogProvider({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <CheckInDialogContext.Provider value={onClose}>{children}</CheckInDialogContext.Provider>
  );
}

export function useCheckInDialogClose() {
  return useContext(CheckInDialogContext);
}
