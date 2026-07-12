import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const password = await argon2.hash('password123');

  const users = [
    { email: 'demo@pulse.com', username: 'demo', displayName: 'Demo User', password, age: 24, gender: 'MALE', country: 'US', languages: JSON.stringify(['English']), interests: JSON.stringify(['Gaming', 'Music', 'Tech']), profilePicture: 'https://i.pravatar.cc/200?img=1' },
    { email: 'sarah@pulse.com', username: 'sarah_v', displayName: 'Sarah V.', password, age: 22, gender: 'FEMALE', country: 'UK', languages: JSON.stringify(['English', 'French']), interests: JSON.stringify(['Music', 'Art', 'Travel']), profilePicture: 'https://i.pravatar.cc/200?img=5' },
    { email: 'alex@pulse.com', username: 'alex_jax', displayName: 'Alex Jax', password, age: 26, gender: 'MALE', country: 'JP', languages: JSON.stringify(['English', 'Japanese']), interests: JSON.stringify(['Gaming', 'Coding', 'Anime']), profilePicture: 'https://i.pravatar.cc/200?img=12' },
    { email: 'mira@pulse.com', username: 'mira_z', displayName: 'Mira Zhang', password, age: 23, gender: 'FEMALE', country: 'CN', languages: JSON.stringify(['Chinese', 'English']), interests: JSON.stringify(['Photography', 'Travel', 'Food']), profilePicture: 'https://i.pravatar.cc/200?img=15' },
    { email: 'kai@pulse.com', username: 'kai_sterling', displayName: 'Kai Sterling', password, age: 25, gender: 'MALE', country: 'AU', languages: JSON.stringify(['English']), interests: JSON.stringify(['Sports', 'Fitness', 'Music']), profilePicture: 'https://i.pravatar.cc/200?img=20' },
    { email: 'chloe@pulse.com', username: 'chloe_s', displayName: 'Chloe S.', password, age: 21, gender: 'FEMALE', country: 'FR', languages: JSON.stringify(['French', 'English']), interests: JSON.stringify(['Travel', 'Vlog', 'Dancing']), profilePicture: 'https://i.pravatar.cc/200?img=25' },
    { email: 'leo@pulse.com', username: 'leo_jax', displayName: 'Leo Jax', password, age: 28, gender: 'MALE', country: 'DE', languages: JSON.stringify(['German', 'English']), interests: JSON.stringify(['Gaming', 'Chat', 'Music']), profilePicture: 'https://i.pravatar.cc/200?img=30' },
    { email: 'lily@pulse.com', username: 'lily_k', displayName: 'Lily Kim', password, age: 20, gender: 'FEMALE', country: 'KR', languages: JSON.stringify(['Korean', 'English']), interests: JSON.stringify(['K-pop', 'Fashion', 'Art']), profilePicture: 'https://i.pravatar.cc/200?img=35' },
    { email: 'admin@pulse.com', username: 'admin', displayName: 'Pulse Admin', password, age: 30, gender: 'OTHER', country: 'US', languages: JSON.stringify(['English']), interests: JSON.stringify(['Moderation', 'Safety']), profilePicture: 'https://i.pravatar.cc/200?img=68', role: 'ADMIN' },
  ];

  const created = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        ...userData,
        trustScore: 50 + Math.floor(Math.random() * 50),
        coins: 100 + Math.floor(Math.random() * 2000),
      },
    });
    created.push(user);
    console.log(`  Created user: ${user.username}`);

    // Seed the achievement catalog as locked entries so the UI has data to show.
    const ACHIEVEMENTS = [
      { key: 'first_conversation', name: 'First Conversation', description: 'Complete your first chat', icon: 'chat_bubble', maxProgress: 1 },
      { key: 'conversations_10', name: 'Chatterbox', description: 'Have 10 conversations', icon: 'forum', maxProgress: 10 },
      { key: 'conversations_100', name: 'Social Butterfly', description: 'Have 100 conversations', icon: 'diversity_3', maxProgress: 100 },
      { key: 'first_friend', name: 'First Friend', description: 'Add your first friend', icon: 'person_add', maxProgress: 1 },
      { key: 'verified', name: 'Verified', description: 'Verify your account', icon: 'verified', maxProgress: 1 },
    ];
    for (const a of ACHIEVEMENTS) {
      await prisma.userAchievement.upsert({
        where: { userId_name: { userId: user.id, name: a.name } },
        update: {},
        create: { userId: user.id, name: a.name, description: a.description, icon: a.icon, maxProgress: a.maxProgress, progress: 0, unlocked: false },
      });
    }
  }

  // Create a match between demo user and sarah
  const demo = created[0]!;
  const sarah = created[1]!;
  const match = await prisma.match.upsert({
    where: { id: 'seed-demo-sarah-match' },
    update: {},
    create: {
      id: 'seed-demo-sarah-match',
      user1Id: demo.id,
      user2Id: sarah.id,
      status: 'ENDED',
      mutualInterests: JSON.stringify(['Music']),
      duration: 245,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 3355000),
    },
  });

  await prisma.message.deleteMany({ where: { matchId: match.id } });
  await prisma.message.createMany({
    data: [
      { matchId: match.id, senderId: sarah.id, receiverId: demo.id, content: 'Hey! Where are you from?', type: 'TEXT' },
      { matchId: match.id, senderId: demo.id, receiverId: sarah.id, content: "I'm from Tokyo! You?", type: 'TEXT' },
      { matchId: match.id, senderId: sarah.id, receiverId: demo.id, content: "Amazing! I've always wanted to visit Japan!", type: 'TEXT' },
      { matchId: match.id, senderId: demo.id, receiverId: sarah.id, content: 'You should! What are your interests?', type: 'TEXT' },
      { matchId: match.id, senderId: sarah.id, receiverId: demo.id, content: 'I love music and art!', type: 'TEXT' },
    ],
  });

  console.log('  Created demo conversation with messages');

  // Seed coin packages first (idempotent upsert so re-running seed is safe).
  const COIN_PACKAGES = [
    { id: 'coins_100', name: 'Starter', coins: 100, priceUsd: 0.99, bonus: 0, popular: false },
    { id: 'coins_550', name: 'Popular', coins: 550, priceUsd: 4.99, bonus: 50, popular: true },
    { id: 'coins_1200', name: 'Pro', coins: 1200, priceUsd: 9.99, bonus: 150, popular: false },
    { id: 'coins_3000', name: 'Legend', coins: 3000, priceUsd: 19.99, bonus: 500, popular: false },
  ];
  for (const pkg of COIN_PACKAGES) {
    await prisma.coinPackage.upsert({
      where: { id: pkg.id },
      update: {},
      create: pkg,
    });
  }
  console.log('  Created coin packages');

  // Create a friend request (idempotent: skip if one already exists).
  await prisma.friendRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: sarah.id, toUserId: demo.id } },
    update: {},
    create: { fromUserId: sarah.id, toUserId: demo.id, status: 'PENDING' },
  });
  // Seed default system settings (toggled live by admins in the panel).
  const SYSTEM_SETTINGS = [
    { key: 'maintenanceMode', value: 'false', description: 'Put the app into read-only maintenance mode' },
    { key: 'registrationOpen', value: 'true', description: 'Allow new user registrations' },
    { key: 'matchmakingEnabled', value: 'true', description: 'Allow users to start matching' },
    { key: 'minAge', value: '18', description: 'Minimum allowed age for new accounts' },
  ];
  for (const s of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log('  Created system settings');

  console.log('Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
