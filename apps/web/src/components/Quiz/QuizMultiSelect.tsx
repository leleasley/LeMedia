"use client";

import { Check } from "lucide-react";

interface QuizOption {
  id: string;
  label: string;
  icon?: string;
}

interface QuizMultiSelectProps {
  options: QuizOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function QuizMultiSelect({ options, selected, onChange }: QuizMultiSelectProps) {
  const toggleOption = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            key={option.id}
            onClick={() => toggleOption(option.id)}
            className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
              isSelected
                ? "bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/10"
                : "bg-gray-800/50 border-white/10 hover:border-white/20 hover:bg-gray-800"
            }`}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            {option.icon && (
              <span className="text-2xl leading-none">{option.icon}</span>
            )}
            <span className={`text-sm font-medium leading-relaxed ${isSelected ? "text-white" : "text-gray-300"}`}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
