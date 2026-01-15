"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ShieldExclamationIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
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
      console.error(error);
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
          <div className="fixed inset-0 bg-black/75 transition-opacity" />
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-gray-900 border border-white/10 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
                    <ShieldExclamationIcon className="h-6 w-6 text-red-500" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-white">
                      Reset Authentication
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-400">
                        Select which authentication methods you want to reset for this user. This action cannot be undone.
                      </p>
                      
                      <div className="mt-4 space-y-3">
                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer">
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

                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer">
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

                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer">
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

                        <label className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer">
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
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleReset}
                    disabled={resetting}
                  >
                    {resetting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset Selected"}
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-white/10 hover:bg-white/20 sm:mt-0 sm:w-auto"
                    onClick={onClose}
                    disabled={resetting}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
