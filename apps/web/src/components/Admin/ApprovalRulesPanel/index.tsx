"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  X,
  Save,
  AlertCircle,
} from "lucide-react";
import { ConfirmModal, useConfirm } from "@/components/Common/ConfirmModal";
import { useToast } from "@/components/Providers/ToastProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Rule {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  ruleType: string;
  conditions: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

type RuleType = "user_trust" | "popularity" | "time_based" | "genre" | "content_rating";

type Genre = { id: number; name: string };

const RULE_TYPE_DESCRIPTIONS: Record<RuleType, string> = {
  user_trust: "Auto-approve for users after X approved requests",
  popularity: "Auto-approve popular content (vote average/popularity threshold)",
  time_based: "Auto-approve during specific hours",
  genre: "Auto-approve specific genres",
  content_rating: "Auto-approve based on content rating (G, PG, etc)",
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: `${hour.toString().padStart(2, "0")}:00`,
}));

const RATING_OPTIONS = [
  "G",
  "PG",
  "PG-13",
  "R",
  "NC-17",
  "TV-Y",
  "TV-Y7",
  "TV-G",
  "TV-PG",
  "TV-14",
  "TV-MA",
  "NR",
  "UNRATED",
];

const RULE_TYPE_CONDITION_FIELDS: Record<RuleType, Array<{
  key: string;
  label: string;
  type: "number" | "string" | "array";
  placeholder?: string;
}>> = {
  user_trust: [
    { key: "minApprovedRequests", label: "Min Approved Requests", type: "number", placeholder: "5" },
  ],
  popularity: [
    { key: "minVoteAverage", label: "Min Vote Average (0-10)", type: "number", placeholder: "7.0" },
    { key: "minPopularity", label: "Min Popularity", type: "number", placeholder: "100" },
  ],
  time_based: [
    { key: "allowedHours", label: "Allowed Hours", type: "array", placeholder: "Select hours" },
  ],
  genre: [
    { key: "allowedGenres", label: "Allowed Genres", type: "array", placeholder: "Select genres" },
  ],
  content_rating: [
    { key: "allowedRatings", label: "Allowed Ratings", type: "array", placeholder: "Select ratings" },
  ],
};

function RuleForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initialData?: Rule;
  onSubmit: (data: Partial<Rule>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<Partial<Rule>>(
    initialData || {
      name: "",
      description: "",
      enabled: true,
      priority: 0,
      ruleType: "user_trust",
      conditions: {},
    }
  );
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);

  useEffect(() => {
    if (form.ruleType !== "genre") return;
    if (genres.length > 0) return;

    const loadGenres = async () => {
      setGenresLoading(true);
      try {
        const [movieRes, tvRes] = await Promise.all([
          fetch("/api/v1/tmdb/genres?type=movie", { cache: "no-store" }),
          fetch("/api/v1/tmdb/genres?type=tv", { cache: "no-store" }),
        ]);
        const [movieData, tvData] = await Promise.all([
          movieRes.ok ? movieRes.json() : Promise.resolve({ genres: [] }),
          tvRes.ok ? tvRes.json() : Promise.resolve({ genres: [] }),
        ]);

        const byId = new Map<number, Genre>();
        for (const genre of [...(movieData.genres ?? []), ...(tvData.genres ?? [])]) {
          if (!genre?.id || !genre?.name) continue;
          byId.set(Number(genre.id), { id: Number(genre.id), name: String(genre.name) });
        }

        const merged = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        setGenres(merged);
      } finally {
        setGenresLoading(false);
      }
    };

    void loadGenres();
  }, [form.ruleType, genres.length]);

  const selectedGenreIds = useMemo(() => {
    const raw = form.conditions?.allowedGenres;
    if (!Array.isArray(raw)) return [] as number[];
    return raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }, [form.conditions]);

  const selectedHours = useMemo(() => {
    const raw = form.conditions?.allowedHours;
    if (!Array.isArray(raw)) return [] as number[];
    return raw
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 23)
      .sort((a, b) => a - b);
  }, [form.conditions]);

  const selectedRatings = useMemo(() => {
    const raw = form.conditions?.allowedRatings;
    if (!Array.isArray(raw)) return [] as string[];
    return raw
      .map((value) => String(value).trim())
      .filter(Boolean);
  }, [form.conditions]);

  const toggleGenre = (genreId: number) => {
    const has = selectedGenreIds.includes(genreId);
    const next = has
      ? selectedGenreIds.filter((id) => id !== genreId)
      : [...selectedGenreIds, genreId];
    setForm({
      ...form,
      conditions: {
        ...form.conditions,
        allowedGenres: next,
      },
    });
  };

  const toggleHour = (hour: number) => {
    const has = selectedHours.includes(hour);
    const next = has
      ? selectedHours.filter((value) => value !== hour)
      : [...selectedHours, hour].sort((a, b) => a - b);
    setForm({
      ...form,
      conditions: {
        ...form.conditions,
        allowedHours: next,
      },
    });
  };

  const toggleRating = (rating: string) => {
    const has = selectedRatings.includes(rating);
    const next = has
      ? selectedRatings.filter((value) => value !== rating)
      : [...selectedRatings, rating];
    setForm({
      ...form,
      conditions: {
        ...form.conditions,
        allowedRatings: next,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  const conditionFields = RULE_TYPE_CONDITION_FIELDS[form.ruleType as RuleType] || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4 glass-strong rounded-lg p-6 border border-white/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Rule Name *
          </label>
          <input
            type="text"
            value={form.name || ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Trust Level 1"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Priority
          </label>
          <input
            type="number"
            value={form.priority || 0}
            onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
            min="0"
            max="1000"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Higher priority runs first</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
        <textarea
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional description"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Rule Type *
          </label>
          <Select
            value={form.ruleType || "user_trust"}
            onValueChange={(value) => setForm({ ...form, ruleType: value, conditions: {} })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select rule type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RULE_TYPE_DESCRIPTIONS).map(([key, desc]) => (
                <SelectItem key={key} value={key}>
                  {key.replace(/_/g, " ").toUpperCase()} - {desc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled ?? true}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-300">Enabled</span>
          </label>
        </div>
      </div>

      {/* Condition Fields */}
      {conditionFields.length > 0 && (
        <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <p className="text-xs font-semibold text-gray-400 uppercase">Conditions</p>
          {conditionFields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {field.label}
              </label>
              {form.ruleType === "genre" && field.key === "allowedGenres" ? (
                <div className="space-y-2">
                  {genresLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading genres...
                    </div>
                  ) : genres.length === 0 ? (
                    <p className="text-sm text-gray-500">Unable to load genres.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/70 p-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {genres.map((genre) => {
                          const checked = selectedGenreIds.includes(genre.id);
                          return (
                            <label
                              key={genre.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleGenre(genre.id)}
                                className="w-4 h-4 accent-blue-600"
                              />
                              <span className="text-sm text-gray-200">{genre.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {selectedGenreIds.length} genre{selectedGenreIds.length === 1 ? "" : "s"} selected
                  </p>
                </div>
              ) : form.ruleType === "time_based" && field.key === "allowedHours" ? (
                <div className="space-y-2">
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/70 p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                      {HOUR_OPTIONS.map((hour) => {
                        const checked = selectedHours.includes(hour.value);
                        return (
                          <label
                            key={hour.value}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleHour(hour.value)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            <span className="text-sm text-gray-200">{hour.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {selectedHours.length} hour{selectedHours.length === 1 ? "" : "s"} selected
                  </p>
                </div>
              ) : form.ruleType === "content_rating" && field.key === "allowedRatings" ? (
                <div className="space-y-2">
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/70 p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {RATING_OPTIONS.map((rating) => {
                        const checked = selectedRatings.includes(rating);
                        return (
                          <label
                            key={rating}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRating(rating)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            <span className="text-sm text-gray-200">{rating}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {selectedRatings.length} rating{selectedRatings.length === 1 ? "" : "s"} selected
                  </p>
                </div>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={
                    field.type === "array"
                      ? (form.conditions?.[field.key] || []).join(",")
                      : form.conditions?.[field.key] ?? ""
                  }
                  onChange={(e) => {
                    const value = field.type === "array"
                      ? e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((s) => {
                            const num = parseInt(s, 10);
                            return isNaN(num) ? s : num;
                          })
                      : field.type === "number"
                      ? parseFloat(e.target.value)
                      : e.target.value;
                    setForm({
                      ...form,
                      conditions: { ...form.conditions, [field.key]: value },
                    });
                  }}
                  placeholder={field.placeholder}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {initialData ? "Update Rule" : "Create Rule"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ApprovalRulesPanel() {
  const { data, isLoading, mutate } = useSWR<{ rules: Rule[] }>(
    "/api/admin/approval-rules"
  );
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, modalProps } = useConfirm();
  const toast = useToast();

  const getCsrfToken = () => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") ?? "";
  };

  const handleCreate = async (data: Partial<Rule>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/approval-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setIsCreating(false);
        mutate();
      } else {
        const err = await response.json();
        setError(err.error || "Failed to create rule");
      }
    } catch (err) {
      setError("Failed to create rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (id: number, data: Partial<Rule>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/approval-rules/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setEditingId(null);
        mutate();
      } else {
        const err = await response.json();
        setError(err.error || "Failed to update rule");
      }
    } catch (err) {
      setError("Failed to update rule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Are you sure you want to delete this rule?", { title: "Delete Rule", destructive: true, confirmLabel: "Delete" });
    if (!ok) return;

    try {
      const response = await fetch(`/api/admin/approval-rules/${id}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": getCsrfToken(),
        },
      });

      if (response.ok) {
        mutate();
      } else {
        toast.error("Failed to delete rule");
      }
    } catch (err) {
      toast.error("Failed to delete rule");
    }
  };

  const rules = data?.rules ?? [];
  const editingRule = rules.find((r) => r.id === editingId);

  return (
    <div className="space-y-6">
      <ConfirmModal {...modalProps} />
      {error && (
        <div className="flex gap-3 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Create/Edit Form */}
      {isCreating || editingId ? (
        <RuleForm
          initialData={editingRule}
          onSubmit={(data) =>
            editingRule
              ? handleUpdate(editingRule.id, data)
              : handleCreate(data)
          }
          onCancel={() => {
            setIsCreating(false);
            setEditingId(null);
            setError(null);
          }}
          isSubmitting={isSubmitting}
        />
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <Plus className="h-5 w-5" />
          Create New Rule
        </button>
      )}

      {/* Rules List */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Approval Rules</h3>
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-500" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-8 glass-strong rounded-lg border border-white/10 text-gray-400">
            No rules yet. Create one to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="glass-strong rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-white">{rule.name}</h4>
                      {!rule.enabled && (
                        <span className="px-2 py-0.5 bg-gray-700/50 text-gray-300 text-xs rounded font-medium">
                          Disabled
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-200 text-xs rounded font-medium">
                        Priority: {rule.priority}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-gray-400 mb-2">{rule.description}</p>
                    )}
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        <span className="font-medium">Type:</span>{" "}
                        {rule.ruleType.replace(/_/g, " ").toUpperCase()}
                      </p>
                      {Object.keys(rule.conditions).length > 0 && (
                        <p>
                          <span className="font-medium">Conditions:</span>{" "}
                          {JSON.stringify(rule.conditions)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => setEditingId(rule.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
                      title="Edit rule"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                      title="Delete rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
