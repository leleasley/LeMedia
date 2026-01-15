"use client";

import { cn } from "@/lib/utils";
import { ChangeEvent } from "react";

interface AnimatedCheckboxProps {
    id: string;
    label: string;
    description?: string;
    checked?: boolean;
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
}

export function AnimatedCheckbox({
    id,
    label,
    description,
    checked = false,
    onChange,
    disabled = false,
}: AnimatedCheckboxProps) {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
    };

    return (
        <label
            htmlFor={id}
            className={cn(
                "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer",
                !disabled && "hover:bg-white/5",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <div className="relative mt-0.5 h-5 w-5 shrink-0">
                <input
                    type="checkbox"
                    id={id}
                    checked={checked}
                    onChange={handleChange}
                    disabled={disabled}
                    className="peer absolute inset-0 h-5 w-5 cursor-pointer opacity-0"
                />
                <div className="h-5 w-5 rounded border-2 border-gray-600 bg-gray-800 transition-all duration-200 peer-checked:border-indigo-500 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent peer-disabled:border-gray-700 peer-disabled:bg-gray-900/70" />
                {/* Checkmark */}
                <svg
                    className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 origin-center scale-0 text-white opacity-0 transition-all duration-200 ease-out peer-checked:scale-100 peer-checked:opacity-100"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </div>
            <div className="flex-1">
                <div className="font-medium text-white">{label}</div>
                {description && (
                    <div className="text-sm text-gray-400 mt-0.5">{description}</div>
                )}
            </div>
        </label>
    );
}
