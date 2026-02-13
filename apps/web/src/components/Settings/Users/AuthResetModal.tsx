"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ShieldExclamationIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { logger } from "@/lib/logger";
import { csrfFetch } from "@/lib/csrf-client";

interface AuthResetModalProps {
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function AuthResetModal({ userId, isOpen, onClose }: AuthResetModalProps) {
  const [resetting, setResetting] = useState(false);
  const [options, setOptions] = useState({
    unlinkSso: false,
    resetOtp: false,
    removePasskeys: false,
    logoutSessions: false,
  });
  const toast = useToast();

  const handleReset = async () => {
    setResetting(true);
    try {
      if (options.unlinkSso || options.resetOtp || options.removePasskeys) {
        const res = await csrfFetch(`/api/v1/admin/users/${userId}/reset-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unlinkSso: options.unlinkSso,
            resetOtp: options.resetOtp,
            removePasskeys: options.removePasskeys,
          }),
        });
        if (!res.ok) {
          throw new Error("Failed to reset authentication");
        }
      }

      if (options.logoutSessions) {
        const res = await csrfFetch(`/api/v1/admin/users/${userId}/logout-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (!res.ok) {
          throw new Error("Failed to logout sessions");
        }
      }

      toast.success("Selected actions completed");
      onClose();
      setOptions({ unlinkSso: false, resetOtp: false, removePasskeys: false, logoutSessions: false });
    } catch (error) {
      logger.error("[AuthReset] Failed to apply selected actions", error);
      toast.error("Failed to apply selected actions");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative sm:my-8 sm:w-full sm:max-w-lg">
                {/* Animated gradient border glow */}
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 opacity-60 blur-sm animate-pulse" />
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 opacity-30" />
                
                {/* Main modal container */}
                <div className="relative transform overflow-hidden rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 px-5 pb-5 pt-5 text-left shadow-[0_0_50px_rgba(239,68,68,0.15)] backdrop-blur-2xl sm:p-6">
                  <div className="absolute right-0 top-0 pr-4 pt-4 sm:pr-5 sm:pt-5">
                    <button
                      type="button"
                      className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                      onClick={onClose}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  
                  <div className="sm:flex sm:items-start">
                    {/* Icon with glow effect */}
                    <div className="relative mx-auto flex-shrink-0 sm:mx-0">
                      <div className="absolute inset-0 rounded-xl bg-red-500 opacity-20 blur-lg" />
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                        <ShieldExclamationIcon className="h-6 w-6 text-red-400" aria-hidden="true" />
                      </div>
                    </div>
                    
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                      <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-white">
                        Reset Authentication
                      </Dialog.Title>
                      <div className="mt-2">
                        <p className="text-sm text-gray-400 leading-relaxed">
                          Select which authentication methods you want to reset for this user. This action cannot be undone.
                        </p>
                        
                        <div className="mt-4 space-y-2">
                          <label className="flex items-center space-x-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all duration-200">
                            <input
                              type="checkbox"
                              checked={options.unlinkSso}
                              onChange={(e) => setOptions({ ...options, unlinkSso: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="block text-sm font-medium text-white">Unlink SSO (OIDC)</span>
                              <span className="block text-xs text-gray-400">Disconnect linked external account</span>
                            </div>
                          </label>

                          <label className="flex items-center space-x-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all duration-200">
                            <input
                              type="checkbox"
                              checked={options.resetOtp}
                              onChange={(e) => setOptions({ ...options, resetOtp: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="block text-sm font-medium text-white">Reset MFA (OTP)</span>
                              <span className="block text-xs text-gray-400">Clear authenticator app configuration</span>
                            </div>
                          </label>

                          <label className="flex items-center space-x-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all duration-200">
                            <input
                              type="checkbox"
                              checked={options.removePasskeys}
                              onChange={(e) => setOptions({ ...options, removePasskeys: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="block text-sm font-medium text-white">Remove All Passkeys</span>
                              <span className="block text-xs text-gray-400">Delete all registered WebAuthn credentials</span>
                            </div>
                          </label>

                          <label className="flex items-center space-x-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all duration-200">
                            <input
                              type="checkbox"
                              checked={options.logoutSessions}
                              onChange={(e) => setOptions({ ...options, logoutSessions: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="block text-sm font-medium text-white">Logout All Sessions</span>
                              <span className="block text-xs text-gray-400">Invalidate every active device for this user</span>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="mt-5 sm:mt-6 pt-4 border-t border-white/5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50"
                      onClick={onClose}
                      disabled={resetting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      onClick={handleReset}
                      disabled={resetting}
                    >
                      {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Reset Selected
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
