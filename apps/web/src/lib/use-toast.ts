"use client";

import * as React from "react";
import type { ToastProps } from "./ui-toast";

type ToastData = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

type ToastState = {
  toasts: ToastData[];
};

type ToastAction =
  | { type: "ADD_TOAST"; toast: ToastData }
  | { type: "UPDATE_TOAST"; toast: Partial<ToastData> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

const TOAST_LIMIT = 4;
const TOAST_REMOVE_DELAY = 5000;

let toastCount = 0;
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const reducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toast.id ? { ...toast, ...action.toast } : toast,
        ),
      };
    case "DISMISS_TOAST":
      if (action.toastId) {
        addToRemoveQueue(action.toastId);
      } else {
        state.toasts.forEach((toast) => addToRemoveQueue(toast.id));
      }
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toastId || action.toastId === undefined
            ? {
                ...toast,
                open: false,
              }
            : toast,
        ),
      };
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.toastId),
      };
    default:
      return state;
  }
};

const listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

const generateToastId = () => {
  toastCount = (toastCount + 1) % Number.MAX_SAFE_INTEGER;
  return toastCount.toString();
};

export function toast({ title, description, ...props }: Omit<ToastData, "id">) {
  const id = generateToastId();

  const update = (updates: Partial<ToastData>) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...updates, id },
    });

  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      title,
      description,
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) {
          dismiss();
        }
      },
    },
  });

  return { id, dismiss, update };
}

export function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}
