-- Outside accounts LeMedia connects to for itself (e.g. GitHub, to read Zurg/rex release feeds).
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "config" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
