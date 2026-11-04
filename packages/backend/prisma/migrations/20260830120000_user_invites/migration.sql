-- User invites: admin creates invite, user sets password via token link.

CREATE TABLE "UserInvite" (
    "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email"      TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "role"       TEXT NOT NULL DEFAULT 'user',
    "invitedBy"  INTEGER,
    "expiresAt"  DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");
CREATE INDEX "UserInvite_email_idx" ON "UserInvite"("email");
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");
