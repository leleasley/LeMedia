"use client";

import { Check } from "lucide-react";

interface QuizOption {
  id: string;
  label: string;
  icon?: string;
}

interface QuizSingleSelectProps {
  options: QuizOption[];
  selected: string | undefined;
  onChange: (selected: string) => void;
}

export function QuizSingleSelect({ options, selected, onChange }: QuizSingleSelectProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
              isSelected
                ? "bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/10"
                : "bg-gray-800/50 border-white/10 hover:border-white/20 hover:bg-gray-800"
            }`}
          >
            {option.icon && (
              <span className="text-2xl flex-shrink-0 leading-none">{option.icon}</span>
            )}
            <span className={`text-sm font-medium flex-1 leading-relaxed ${isSelected ? "text-white" : "text-gray-300"}`}>
              {option.label}
            </span>
            {isSelected && (
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
