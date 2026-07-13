import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric'),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(100).optional(),
  age: z.number().int().min(13).max(120).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  age: z.number().int().min(13).max(120).optional(),
  gender: z.string().optional(),
  country: z.string().optional(),
  languages: z.string().optional(),
  interests: z.string().optional(),
  profilePicture: z
    .string()
    .refine(
      (v) => v.startsWith('/') || /^https?:\/\//.test(v),
      'Must be a relative path (e.g. /uploads/media/...) or an absolute http(s) URL'
    )
    .optional(),
  coverImage: z
    .string()
    .refine(
      (v) => v.startsWith('/') || /^https?:\/\//.test(v),
      'Must be a relative path (e.g. /uploads/media/...) or an absolute http(s) URL'
    )
    .optional(),
});

export const UpdatePreferencesSchema = z.object({
  genderPreference: z.string().optional(),
  countryPreference: z.string().optional(),
  languagePreference: z.string().optional(),
  ageRangeMin: z.number().int().optional(),
  ageRangeMax: z.number().int().optional(),
  interestsMatch: z.boolean().optional(),
  verifiedOnly: z.boolean().optional(),
  premiumOnly: z.boolean().optional(),
  invisibleMode: z.boolean().optional(),
});

export const SendMessageSchema = z.object({
  matchId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  type: z.enum(['TEXT', 'IMAGE', 'VOICE', 'VIDEO', 'EMOJI', 'GIF', 'STICKER']).default('TEXT'),
});

export const CreateConversationSchema = z.object({
  friendId: z.string().uuid(),
});

export const CreateReportSchema = z.object({
  reportedUserId: z.string().uuid(),
  category: z.enum(['NUDITY', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'FAKE_PROFILE', 'SPAM', 'UNDERAGE', 'OFFENSIVE', 'SCAMS', 'OTHER']),
  description: z.string().min(10).max(2000),
});

export const UpdatePrivacySettingsSchema = z.object({
  hideAge: z.boolean().optional(),
  hideCountry: z.boolean().optional(),
  hideOnlineStatus: z.boolean().optional(),
  hideProfilePicture: z.boolean().optional(),
  privateProfile: z.boolean().optional(),
});