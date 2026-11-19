export type FriendshipDocStatus = 'pending' | 'accepted';

export type RelationshipFriendState =
  | 'none'
  | 'outgoing_pending'
  | 'incoming_pending'
  | 'friends';

export type StatusPrivacyMode =
  | 'public'
  | 'friends'
  | 'followers'
  | 'selected'
  | 'except'
  | 'only_me';

export interface FriendshipRecord {
  id: string;
  userA: string;
  userB: string;
  users: [string, string];
  status: FriendshipDocStatus;
  requestedBy: string;
  targetUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FollowRecord {
  id: string;
  followerUid: string;
  targetUid: string;
  createdAt?: unknown;
}

export interface BlockRecord {
  id: string;
  blockerUid: string;
  blockedUid: string;
  createdAt?: unknown;
}

export interface StatusPrivacySettings {
  visibility: StatusPrivacyMode;
  selectedUids: string[];
  exceptUids: string[];
  updatedAt?: string;
}

export interface RelationshipWithUser {
  friendState: RelationshipFriendState;
  friendshipId: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isBlockedByMe: boolean;
}

export interface SocialUserProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export interface StatusPrivacyOptionMeta {
  value: StatusPrivacyMode;
  label: string;
  description: string;
  requiresPicker: boolean;
}

export const STATUS_PRIVACY_OPTIONS: StatusPrivacyOptionMeta[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone on KING App can see your future Status updates.',
    requiresPicker: false,
  },
  {
    value: 'friends',
    label: 'Friends',
    description: 'Only mutual accepted friends can see your future Status updates.',
    requiresPicker: false,
  },
  {
    value: 'followers',
    label: 'Followers',
    description: 'Users who follow your KING Channel can see your future Status updates.',
    requiresPicker: false,
  },
  {
    value: 'selected',
    label: 'Selected people',
    description: 'Only specific people you choose can see your future Status updates.',
    requiresPicker: true,
  },
  {
    value: 'except',
    label: 'Except selected people',
    description: 'Your audience except the specific people you exclude.',
    requiresPicker: true,
  },
  {
    value: 'only_me',
    label: 'Only me',
    description: 'Private. Only you can see your future Status updates.',
    requiresPicker: false,
  },
];

export type StatusMediaType = 'image' | 'video' | 'text';
export type StatusTextStyle = 'classic' | 'bold' | 'editorial' | 'mono';
export type StatusEditorTextFont = 'sans' | 'serif' | 'mono' | 'display' | 'handwritten';
export type StatusCloudinaryDeliveryType = 'upload' | 'authenticated' | 'none';
export type StatusReactionEmoji = '❤️' | '🔥' | '👑' | '😂' | '😮' | '👏';

export const STATUS_REACTION_EMOJIS: readonly StatusReactionEmoji[] = [
  '❤️',
  '🔥',
  '👑',
  '😂',
  '😮',
  '👏',
] as const;

export interface StatusWhatsAppCta {
  enabled: boolean;
  url: string;
  label: string;
}

export type StatusOverlayTextEffect = 'none' | 'shadow' | 'outline';

export interface StatusMediaOverlay {
  id: string;
  kind: 'text' | 'sticker';
  content: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  scale: number; // e.g. 0.5..2.8
  rotation?: number; // degrees -180..180
  font?: StatusEditorTextFont;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  bgMode?: 'none' | 'dark' | 'accent' | 'custom';
  bgColor?: string;
  effect?: StatusOverlayTextEffect;
}

export interface StatusVideoEdits {
  trimStartSec: number;
  trimEndSec: number;
  muted: boolean;
  overlays: StatusMediaOverlay[];
}

export interface StatusAudioTrack {
  mode: 'original' | 'royalty_free' | 'custom_audio';
  label: string;
  presetId?: string;
  audioUrl?: string;
  cloudinaryPublicId?: string;
}

export interface StatusRecord {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  type: StatusMediaType;
  mediaUrl: string;
  thumbnailUrl: string;
  cloudinaryPublicId: string;
  cloudinaryResourceType: 'image' | 'video' | 'raw' | '';
  cloudinaryDeliveryType: StatusCloudinaryDeliveryType;
  caption: string;
  textContent: string;
  bgGradient: string;
  textStyle: StatusTextStyle;
  durationSec: number;
  audioTrack: StatusAudioTrack;
  whatsappCta?: StatusWhatsAppCta;
  videoEdits?: StatusVideoEdits;
  privacyMode: StatusPrivacyMode;
  allowedUids?: string[];
  excludedUids?: string[];
  viewsCount: number;
  likesCount: number;
  createdAtMs: number;
  expiresAtMs: number;
  viewedByMe?: boolean;
  myReaction?: StatusReactionEmoji | null;
}

export interface StatusAuthorGroup {
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  statuses: StatusRecord[];
  hasUnseen: boolean;
  latestCreatedAtMs: number;
  isOwn: boolean;
}

export interface StatusViewRecord {
  id: string;
  statusId: string;
  statusOwnerUid: string;
  viewerUid: string;
  viewerName: string;
  viewerPhoto: string;
  viewedAtMs: number;
}

export interface StatusLikeRecord {
  id: string;
  statusId: string;
  statusOwnerUid: string;
  userUid: string;
  userName: string;
  userPhoto: string;
  emoji: StatusReactionEmoji;
  createdAtMs: number;
}

export interface StatusReplyRecord {
  id: string;
  statusId: string;
  statusOwnerUid: string;
  senderUid: string;
  senderName: string;
  senderPhoto: string;
  message: string;
  createdAtMs: number;
}

export interface AppNotificationRecord {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhoto: string;
  type: 'status_reaction' | 'status_reply' | 'friend_request' | 'friend_accepted' | 'new_follower';
  statusId: string;
  title: string;
  body: string;
  emoji?: string;
  read: boolean;
  createdAtMs: number;
}
