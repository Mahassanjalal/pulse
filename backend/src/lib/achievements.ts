import { prisma } from './prisma';

/**
 * Achievement catalog. Each achievement has a stable `key` that is stored in
 * `UserAchievement.name`. Unlock logic is triggered from domain events
 * (conversation completed, friend added) via `unlockAchievement`.
 */
export const ACHIEVEMENTS = [
  { key: 'first_conversation', name: 'First Conversation', description: 'Complete your first chat', icon: 'chat_bubble', maxProgress: 1 },
  { key: 'conversations_10', name: 'Chatterbox', description: 'Have 10 conversations', icon: 'forum', maxProgress: 10 },
  { key: 'conversations_100', name: 'Social Butterfly', description: 'Have 100 conversations', icon: 'diversity_3', maxProgress: 100 },
  { key: 'first_friend', name: 'First Friend', description: 'Add your first friend', icon: 'person_add', maxProgress: 1 },
  { key: 'verified', name: 'Verified', description: 'Verify your account', icon: 'verified', maxProgress: 1 },
] as const;

export type AchievementKey = (typeof ACHIEVEMENTS)[number]['key'];

/**
 * Idempotently unlock (or progress) an achievement for a user and notify them.
 * Returns true if this call actually unlocked it for the first time.
 */
export async function unlockAchievement(
  userId: string,
  key: AchievementKey,
  progress = 1
): Promise<boolean> {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return false;

  const existing = await prisma.userAchievement.findUnique({
    where: { userId_name: { userId, name: def.name } },
  });

  if (existing) {
    if (existing.unlocked) return false;
    const next = Math.min(progress, def.maxProgress);
    const unlocked = next >= def.maxProgress;
    await prisma.userAchievement.update({
      where: { userId_name: { userId, name: def.name } },
      data: { progress: next, unlocked, unlockedAt: unlocked ? new Date() : null },
    });
    if (unlocked) {
      const { NotificationService } = await import('./notifications');
      await NotificationService.create(
        userId,
        'ACHIEVEMENT',
        'Achievement Unlocked',
        `You unlocked "${def.name}"!`
      );
    }
    return unlocked;
  }

  const unlocked = progress >= def.maxProgress;
  await prisma.userAchievement.create({
    data: {
      userId,
      name: def.name,
      description: def.description,
      icon: def.icon,
      progress: Math.min(progress, def.maxProgress),
      maxProgress: def.maxProgress,
      unlocked,
      unlockedAt: unlocked ? new Date() : null,
    },
  });

  if (unlocked) {
    // Lazy import to avoid a static cycle with notifications.ts.
    const { NotificationService } = await import('./notifications');
    await NotificationService.create(
      userId,
      'ACHIEVEMENT',
      'Achievement Unlocked',
      `You unlocked "${def.name}"!`
    );
  }

  return unlocked;
}
