import { ToastProvider, ToastViewport } from "./ui-toast";

export function Toaster() {
  return (
    <ToastProvider>
      <ToastViewport />
    </ToastProvider>
  );
}
