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
  role?: 'USER' | 'ADMIN' | 'MODERATOR';
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
  matchId?: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'emoji' | 'gif' | 'sticker';
  timestamp: Date;
  createdAt?: string;
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
  popular?: boolean;
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

export interface Conversation {
  id: string;
  peer: {
    id: string;
    displayName: string;
    profilePicture: string;
    status: string;
  };
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface Friend {
  friendId: string;
  peer: {
    id: string;
    displayName: string;
    profilePicture: string;
    status: string;
    lastSeen: string;
  };
  isFavorite: boolean;
}

export interface FriendRequestItem {
  id: string;
  fromUser?: { id: string; displayName: string; profilePicture: string; country: string };
  toUser?: { id: string; displayName: string; profilePicture: string; country: string };
  status: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  unread: boolean;
  timestamp: Date;
  data?: any;
}

export interface SubscriptionInfo {
  id: string;
  planType: string;
  price: number;
  period: string;
  features: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface DashboardStats {
  coins: number;
  dailyStreak: number;
  friendsCount: number;
  totalConversations: number;
  trustScore: number;
  isPremium: boolean;
  displayName: string;
  profilePicture: string;
  achievements: any[];
}

export interface TrendingUser {
  id: string;
  displayName: string;
  profilePicture: string;
  interests: any;
  isVerified: boolean;
  isPremium: boolean;
  country: string;
  status: string;
}

export interface DiscoverUser {
  id: string;
  displayName: string;
  profilePicture: string;
  country: string;
  interests: string;
  languages: string;
  age: number;
  isVerified: boolean;
  isPremium: boolean;
  status: string;
  trustScore: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  age?: number;
  gender?: string;
  bio?: string;
  country?: string;
  languages: string;
  interests: string;
  profilePicture?: string;
  coverImage?: string;
  isVerified: boolean;
  isPremium: boolean;
  status: string;
  trustScore: number;
  verificationLevel: number;
  communityRating: number;
  friendsCount: number;
  totalConversations: number;
  createdAt: string;
  privacySettings?: any;
  isPrivate?: boolean;
}
