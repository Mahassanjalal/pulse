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
        friendsCount: Math.floor(Math.random() * 50),
        totalConversations: Math.floor(Math.random() * 200),
      },
    });
    created.push(user);
    console.log(`  Created user: ${user.username}`);
  }

  // Create a match between demo user and sarah
  const demo = created[0]!;
  const sarah = created[1]!;
  const match = await prisma.match.create({
    data: {
      user1Id: demo.id,
      user2Id: sarah.id,
      status: 'ENDED',
      mutualInterests: JSON.stringify(['Music']),
      duration: 245,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 3355000),
    },
  });

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

  // Create a friend request
  await prisma.friendRequest.create({
    data: { fromUserId: sarah.id, toUserId: demo.id, status: 'PENDING' },
  });
  console.log('  Created demo friend request');

  console.log('Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
