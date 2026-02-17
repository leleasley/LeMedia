"use client";

interface QuizSliderProps {
  labels: [string, string];
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

export function QuizSlider({ labels, min, max, value, onChange }: QuizSliderProps) {
  const steps = max - min + 1;
  const percentage = ((value - min) / (max - min)) * 100;

  const getLabel = (val: number) => {
    if (val === 1) return labels[0];
    if (val === 5) return labels[1];
    if (val === 2) return `Leaning ${labels[0]}`;
    if (val === 4) return `Leaning ${labels[1]}`;
    return "Balanced";
  };

  return (
    <div className="space-y-6">
      {/* Labels */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium transition-colors ${value <= 2 ? "text-blue-400" : "text-gray-400"}`}>
          {labels[0]}
        </span>
        <span className={`font-medium transition-colors ${value >= 4 ? "text-purple-400" : "text-gray-400"}`}>
          {labels[1]}
        </span>
      </div>

      {/* Slider */}
      <div className="relative pt-2 pb-6">
        {/* Visual track */}
        <div className="absolute top-2 left-0 right-0 h-3 bg-gray-800 rounded-full overflow-hidden pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="absolute top-2 left-0 right-0 flex items-center justify-between px-1 pointer-events-none">
          {Array.from({ length: steps }).map((_, i) => {
            const stepValue = min + i;
            const isActive = stepValue <= value;
            return (
              <div
                key={i}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  stepValue === value
                    ? "bg-white border-white scale-125 shadow-lg"
                    : isActive
                      ? "bg-purple-500 border-purple-500"
                      : "bg-gray-700 border-gray-600"
                }`}
              />
            );
          })}
        </div>

        {/* HTML Range Input */}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full h-3 bg-transparent appearance-none cursor-pointer z-10"
          style={{
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />

        <style jsx>{`
          input[type='range']::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: transparent;
            cursor: pointer;
          }
          input[type='range']::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: transparent;
            cursor: pointer;
            border: none;
          }
        `}</style>
      </div>

      {/* Current value indicator */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-full text-sm">
          <span className="text-gray-400">Current:</span>
          <span className="font-medium text-white">{getLabel(value)}</span>
        </div>
      </div>
    </div>
  );
}
