export type GroupId = "administrators" | "moderators" | "users";

export type GroupDefinition = {
  id: GroupId;
  label: string;
  isAdmin?: boolean;
};

export const GROUP_DEFINITIONS: GroupDefinition[] = [
  { id: "administrators", label: "Administrators", isAdmin: true },
  { id: "moderators", label: "Moderators" },
  { id: "users", label: "Users" }
];

const GROUP_LABEL_MAP = new Map<GroupId, string>(
  GROUP_DEFINITIONS.map(group => [group.id, group.label])
);

const LEGACY_GROUP_MAP: Record<string, GroupId> = {
  admin: "administrators",
  admins: "administrators",
  administrator: "administrators",
  administrators: "administrators",
  owner: "administrators",
  mod: "moderators",
  moderator: "moderators",
  moderators: "moderators",
  user: "users",
  users: "users"
};

export const DEFAULT_GROUPS: GroupId[] = ["users"];

type NormalizeOptions = { fallbackToDefault?: boolean };

export function normalizeGroupList(
  input?: string[] | string | null,
  options: NormalizeOptions = { fallbackToDefault: true }
): GroupId[] {
  const fallback = options.fallbackToDefault !== false;
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[;,]/g)
      : [];

  const mapped = raw
    .map(value => value.trim().toLowerCase())
    .map(value => LEGACY_GROUP_MAP[value])
    .filter(Boolean) as GroupId[];

  const unique = Array.from(new Set(mapped));
  if (!unique.length && fallback) return DEFAULT_GROUPS.slice();
  return unique;
}

export function serializeGroups(input?: string[] | string | null): string {
  return normalizeGroupList(input).join(",");
}

export function isAdminGroup(groups?: string[] | string | null): boolean {
  return normalizeGroupList(groups).includes("administrators");
}

export function formatGroupLabel(groupId: string): string {
  const normalized = normalizeGroupList([groupId], { fallbackToDefault: false })[0];
  if (normalized) return GROUP_LABEL_MAP.get(normalized) ?? normalized;
  return groupId;
}

export function formatGroupLabels(groups?: string[] | string | null): string[] {
  return normalizeGroupList(groups).map(group => GROUP_LABEL_MAP.get(group) ?? group);
}
