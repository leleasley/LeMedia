import { AppUser } from "@/auth";

export async function getClientUser(): Promise<AppUser | null> {
  try {
    const res = await fetch("/api/v1/auth/me");
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}
