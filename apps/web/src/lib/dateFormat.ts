/**
 * Format a date string for display.
 * Avoids hydration mismatch by using a consistent ISO-like format.
 */
export function formatDate(dateString: string): string {
    try {
        const date = new Date(dateString);
        // Use ISO string components to avoid toLocaleString mismatch
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch {
        return 'Invalid date';
    }
}
