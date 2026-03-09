"use client";

/**
 * Trigger a POST-based logout with CSRF token.
 * Submits a hidden form so the browser follows the 303 redirect naturally
 * (cookies are set/cleared by the server response).
 */
export function performLogout() {
    // Read the CSRF token from the cookie
    const csrfMatch = document.cookie.match(/(?:^|; )lemedia_csrf=([^;]*)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/logout";
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "csrf_token";
    input.value = csrfToken;
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
}
