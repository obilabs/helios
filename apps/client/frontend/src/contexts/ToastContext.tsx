import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const options = { duration };

    switch (type) {
      case 'success':
        toast.success(message, options);
        break;
      case 'error':
        toast.error(message, options);
        break;
      case 'warning':
        toast.warning(message, options);
        break;
      case 'info':
      default:
        toast.info(message, options);
        break;
    }
  }, []);

  const showSuccess = useCallback((message: string) => {
    toast.success(message, { duration: 3000 });
  }, []);

  const showError = useCallback((message: string) => {
    toast.error(message, { duration: 5000 }); // Errors stay longer
  }, []);

  const showWarning = useCallback((message: string) => {
    toast.warning(message, { duration: 4000 });
  }, []);

  const showInfo = useCallback((message: string) => {
    toast.info(message, { duration: 3000 });
  }, []);

  const value = useMemo(() => ({
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  }), [showToast, showSuccess, showError, showWarning, showInfo]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster position="top-right" richColors />
    </ToastContext.Provider>
  );
};