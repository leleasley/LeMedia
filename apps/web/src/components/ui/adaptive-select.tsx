"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsIOS } from "@/hooks/useIsApple";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface AdaptiveSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  name?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * AdaptiveSelect - Uses native iOS picker on Apple devices, Radix UI Select elsewhere
 *
 * On iOS devices, this renders a native <select> element which triggers the
 * beautiful iOS picker wheel. On desktop, it uses the custom Radix UI Select
 * for a polished experience.
 */
export function AdaptiveSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className,
  triggerClassName,
  name,
  id,
  "aria-label": ariaLabel,
}: AdaptiveSelectProps) {
  const isIOS = useIsIOS();

  // During SSR or before hydration, render nothing to avoid mismatch
  if (isIOS === null) {
    return (
      <div
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2 text-sm text-gray-400",
          triggerClassName,
          className
        )}
      >
        {placeholder}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </div>
    );
  }

  // iOS: Use native select for the beautiful iOS picker
  if (isIOS) {
    return (
      <div className={cn("relative", className)}>
        <select
          value={value || ""}
          onChange={(e) => onValueChange?.(e.target.value)}
          disabled={disabled}
          name={name}
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "native-select-ios",
            "flex h-10 w-full items-center justify-between rounded-lg",
            "bg-gray-800/60 border border-gray-700/50 px-3 py-2 pr-10",
            "text-sm text-white",
            "hover:bg-gray-800/80 hover:border-gray-600/50",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all cursor-pointer",
            triggerClassName
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
      </div>
    );
  }

  // Desktop: Use Radix UI Select for custom styling
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(triggerClassName, className)}
        id={id}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * NativeSelect - Always uses native <select> element
 *
 * Use this when you specifically want the native picker on all platforms,
 * such as for critical form inputs or when iOS feel is important everywhere.
 */
export function NativeSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className,
  name,
  id,
  "aria-label": ariaLabel,
}: AdaptiveSelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value || ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        disabled={disabled}
        name={name}
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "native-select-ios",
          "flex h-10 w-full items-center justify-between rounded-lg",
          "bg-gray-800/60 border border-gray-700/50 px-3 py-2 pr-10",
          "text-sm text-white",
          "hover:bg-gray-800/80 hover:border-gray-600/50",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all cursor-pointer"
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
    </div>
  );
}

export { type SelectOption as AdaptiveSelectOption };
