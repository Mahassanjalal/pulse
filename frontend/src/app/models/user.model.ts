export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  profilePicture?: string;
  coverImage?: string;
  age?: number;
  gender?: string;
  bio?: string;
  country?: string;
  languages: string[];
  interests: string[];
  isVerified: boolean;
  isPremium: boolean;
  isGuest?: boolean;
  onlineStatus: 'online' | 'offline' | 'away';
  lastSeen?: Date;
  friendsCount: number;
  totalConversations: number;
  joinedDate: Date;
  trustScore: number;
  verificationLevel: number;
  communityRating: number;
  coins: number;
  dailyStreak: number;
  achievements: Achievement[];
  privacySettings: PrivacySettings;
  preferences: UserPreferences;
}

export interface UserPreferences {
  genderPreference?: string;
  countryPreference?: string;
  languagePreference?: string;
  ageRange: { min: number; max: number };
  interestsMatch: boolean;
  verifiedOnly: boolean;
  premiumOnly: boolean;
  invisibleMode: boolean;
}

export interface PrivacySettings {
  hideAge: boolean;
  hideCountry: boolean;
  hideOnlineStatus: boolean;
  hideProfilePicture: boolean;
  privateProfile: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'emoji' | 'gif' | 'sticker';
  timestamp: Date;
  read: boolean;
  deleted: boolean;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  userId: string;
  type: 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';
  messageId: string;
}

export interface Match {
  id: string;
  user1Id: string;
  user2Id: string;
  user2?: User;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'active' | 'ended' | 'pending';
  mutualInterests: string[];
  message?: ChatMessage[];
  isFavorite: boolean;
  canReconnect: boolean;
}

export interface FriendRequest {
  id: string;
  fromUser: User;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'friend_request' | 'friend_accepted' | 'message' | 'like' | 'profile_view' | 'premium_offer' | 'daily_reward' | 'warning' | 'report';
  title: string;
  message: string;
  read: boolean;
  timestamp: Date;
  data?: any;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: Date;
  progress: number;
  maxProgress: number;
}

export interface VideoQuality {
  status: 'excellent' | 'good' | 'fair' | 'poor';
  bitrate?: number;
  fps?: number;
  resolution?: string;
  connections: number;
}

export interface PremiumPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  discount?: number;
  isMostPopular?: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  user: User;
  rank: number;
  score: number;
  category: 'conversations' | 'friends' | 'reputation' | 'activity';
}

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedUser?: User;
  category: 'nudity' | 'harassment' | 'hate_speech' | 'violence' | 'fake_profile' | 'spam' | 'underage' | 'offensive' | 'scams' | 'other';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  timestamp: Date;
}
