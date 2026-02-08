"use client";

import { useState, useEffect } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Plus, Trash2, ShieldCheck, Loader2, Pencil } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmationModal } from "@/components/Common/ConfirmationModal";
import { logger } from "@/lib/logger";

interface Credential {
  id: string;
  name?: string | null;
  deviceType: string;
  created_at: string;
}

export function PasskeySettings() {
  const toast = useToast();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const fetchCredentials = async () => {
    try {
      const res = await fetch("/api/auth/webauthn/credentials");
      if (res.ok) {
        const data = await res.json();
        setCredentials(data);
      }
    } catch (err) {
      logger.error("[Passkeys] Failed to fetch credentials", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/webauthn/register/options");
      if (!optionsRes.ok) throw new Error("Failed to get registration options");
      const options = await optionsRes.json();

      const attResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await csrfFetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });

      const verification = await verifyRes.json();
      if (verification.verified) {
        await fetchCredentials();
      } else {
        throw new Error(verification.error || "Verification failed");
      }
    } catch (err: any) {
      logger.error("[Passkeys] Registration failed", err);
      setError(err.message || "Failed to register passkey");
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = (id: string) => {
    setModalConfig({
      isOpen: true,
      title: "Remove Passkey?",
      message: "Are you sure you want to remove this passkey? You won't be able to use it to sign in anymore.",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await csrfFetch(`/api/auth/webauthn/credentials/${id}`, { method: "DELETE" });
          if (res.ok) {
            setCredentials(credentials.filter(c => c.id !== id));
            toast.success("Passkey removed");
          } else {
            toast.error("Failed to remove passkey");
          }
        } catch (err) {
          logger.error("[Passkeys] Failed to delete credential", err);
          toast.error("An error occurred while removing the passkey");
        }
      }
    });
  };

  const startEditing = (cred: Credential) => {
    setEditingId(cred.id);
    setEditName(cred.name || (cred.deviceType === "single_device" ? "Phone/Laptop Passkey" : "Security Key"));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await csrfFetch(`/api/auth/webauthn/credentials/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      if (res.ok) {
        setCredentials(credentials.map(c => (c.id === editingId ? { ...c, name: editName } : c)));
        setEditingId(null);
        toast.success("Passkey renamed");
      } else {
        toast.error("Failed to rename passkey");
      }
    } catch (err) {
      logger.error("[Passkeys] Failed to update credential", err);
      toast.error("An error occurred while renaming the passkey");
    }
  };

  return (
    <div className="rounded-2xl md:rounded-3xl glass-strong p-6 md:p-10 border border-white/10 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
            <Fingerprint className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Passkeys</h2>
            <p className="text-sm text-gray-400 mt-1">Use biometrics or security keys for faster, more secure logins</p>
          </div>
        </div>
        <button
          onClick={handleRegister}
          disabled={registering}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Passkey
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
          </div>
        ) : credentials.length > 0 ? (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-full bg-emerald-500/10">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    {editingId === cred.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-black/40 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button onClick={saveEdit} className="text-xs bg-purple-600 px-2 py-1 rounded hover:bg-purple-500">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs bg-gray-700 px-2 py-1 rounded hover:bg-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-white flex items-center gap-2">
                          {cred.name || (cred.deviceType === "single_device" ? "Phone/Laptop Passkey" : "Security Key")}
                          <button onClick={() => startEditing(cred)} className="text-gray-500 hover:text-white transition-colors" title="Rename">
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-500">
                          Added {new Date(cred.created_at).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(cred.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove Passkey"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-white/5 rounded-xl border border-dashed border-white/10">
            <Fingerprint className="w-12 h-12 text-gray-600 mx-auto mb-3 opacity-20" />
            <p className="text-gray-400 text-sm">No passkeys registered yet.</p>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          modalConfig.onConfirm();
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        }}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
      />
    </div>
  );
}
