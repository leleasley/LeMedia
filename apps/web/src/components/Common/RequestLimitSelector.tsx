import React from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface RequestLimitSelectorProps {
    limit: number;
    days: number;
    onChange: (limit: number, days: number) => void;
    disabled?: boolean;
}

const PRESETS = [
    { limit: 0, days: 7, label: "Unlimited" },
    { limit: 1, days: 1, label: "1 per day" },
    { limit: 2, days: 1, label: "2 per day" },
    { limit: 5, days: 1, label: "5 per day" },
    { limit: 10, days: 1, label: "10 per day" },
    { limit: 1, days: 3, label: "1 per 3 days" },
    { limit: 2, days: 3, label: "2 per 3 days" },
    { limit: 5, days: 3, label: "5 per 3 days" },
    { limit: 10, days: 3, label: "10 per 3 days" },
    { limit: 1, days: 7, label: "1 per 7 days" },
    { limit: 2, days: 7, label: "2 per 7 days" },
    { limit: 5, days: 7, label: "5 per 7 days" },
    { limit: 10, days: 7, label: "10 per 7 days" },
    { limit: 25, days: 7, label: "25 per 7 days" },
    { limit: 35, days: 7, label: "35 per 7 days" },
    { limit: 50, days: 7, label: "50 per 7 days" },
];

export const RequestLimitSelector: React.FC<RequestLimitSelectorProps> = ({
    limit,
    days,
    onChange,
    disabled = false,
}) => {
    // Find the matching preset index
    const selectedValue = PRESETS.find(
        (p) => p.limit === limit && (p.limit === 0 || p.days === days)
    );

    // If no exact match (e.g. custom value from DB that isn't in presets), 
    // we should probably handle it. For now, let's default to "Custom" if needed
    // or just show the closest or add a temporary option.
    // However, for simplicity, if it's unlimited (limit 0), we ignore days.
    
    // Create a value string for the select
    const valueString = selectedValue
        ? `${selectedValue.limit}-${selectedValue.days}`
        : `${limit}-${days}`;

    // Check if current value is in presets
    const isCustom = !selectedValue;

    return (
        <div className="w-full">
            <Select
                value={valueString}
                onValueChange={(value) => {
                    const [newLimit, newDays] = value.split("-").map(Number);
                    onChange(newLimit, newDays);
                }}
                disabled={disabled}
            >
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {PRESETS.map((preset) => (
                        <SelectItem
                            key={`${preset.limit}-${preset.days}`}
                            value={`${preset.limit}-${preset.days}`}
                        >
                            {preset.label}
                        </SelectItem>
                    ))}
                    {isCustom && (
                        <SelectItem value={`${limit}-${days}`}>
                            Custom ({limit === 0 ? "Unlimited" : `${limit} per ${days} days`})
                        </SelectItem>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
};
