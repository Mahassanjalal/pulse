-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "languages" TEXT NOT NULL DEFAULT '[]',
    "interests" TEXT NOT NULL DEFAULT '[]',
    "profilePicture" TEXT,
    "coverImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeen" DATETIME,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "googleId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'EMAIL',
    "premiumUntil" DATETIME,
    "friendsCount" INTEGER NOT NULL DEFAULT 0,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "verificationLevel" INTEGER NOT NULL DEFAULT 0,
    "communityRating" REAL NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaim" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER'
);
INSERT INTO "new_User" ("age", "bio", "coins", "communityRating", "country", "coverImage", "createdAt", "dailyStreak", "displayName", "email", "friendsCount", "gender", "id", "interests", "isGuest", "isPremium", "isVerified", "languages", "lastDailyClaim", "lastSeen", "password", "premiumUntil", "profilePicture", "role", "status", "totalConversations", "trustScore", "updatedAt", "username", "verificationLevel") SELECT "age", "bio", "coins", "communityRating", "country", "coverImage", "createdAt", "dailyStreak", "displayName", "email", "friendsCount", "gender", "id", "interests", "isGuest", "isPremium", "isVerified", "languages", "lastDailyClaim", "lastSeen", "password", "premiumUntil", "profilePicture", "role", "status", "totalConversations", "trustScore", "updatedAt", "username", "verificationLevel" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
