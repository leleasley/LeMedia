"use client";

import { useState } from "react";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

type CreateLocalUserModalProps = {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
};

export function CreateLocalUserModal({ open, onClose, onComplete }: CreateLocalUserModalProps) {
    const toast = useToast();
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
    });
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const validate = () => {
        const newErrors: { [key: string]: string } = {};

        if (!formData.username.trim()) {
            newErrors.username = "Username is required";
        }

        if (!formData.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "Invalid email format";
        }

        if (!formData.password) {
            newErrors.password = "Password is required";
        } else if (formData.password.length < 8) {
            newErrors.password = "Password must be at least 8 characters";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleCreate = async () => {
        if (!validate()) return;

        setCreating(true);
        try {
            const res = await csrfFetch("/api/v1/admin/users/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || "Failed to create user");
            }

            toast.success("User created successfully");
            onComplete();
            onClose();
            setFormData({ username: "", email: "", password: "" });
            setErrors({});
        } catch (err: any) {
            const msg = err?.message ?? "Failed to create user";
            toast.error(msg);
        } finally {
            setCreating(false);
        }
    };

    const handleClose = () => {
        setFormData({ username: "", email: "", password: "" });
        setErrors({});
        onClose();
    };

    return (
        <Modal open={open} title="Create Local User" onClose={handleClose}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">
                        Username
                    </label>
                    <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter username"
                    />
                    {errors.username && (
                        <p className="mt-1 text-xs text-red-400">{errors.username}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">
                        Email
                    </label>
                    <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter email"
                    />
                    {errors.email && (
                        <p className="mt-1 text-xs text-red-400">{errors.email}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">
                        Password
                    </label>
                    <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Enter password (min 8 characters)"
                    />
                    {errors.password && (
                        <p className="mt-1 text-xs text-red-400">{errors.password}</p>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 transition"
                        onClick={handleClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={creating}
                        onClick={handleCreate}
                    >
                        {creating ? "Creating..." : "Create User"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
