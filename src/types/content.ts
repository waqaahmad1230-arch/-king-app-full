export type PublicationStatus = 'published' | 'approved' | 'pending' | 'rejected' | 'unpublished';

export type FeedContentType = 'photo' | 'video';

export interface UserPost {
  id: string;
  contentType: FeedContentType;
  publicationStatus: PublicationStatus;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  mediaUrl: string;
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  lastCommentId?: string;
  createdAt: any;
  updatedAt?: any;
  source?: 'home_composer' | 'channel';
}

export interface ContentComment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  createdAt: any;
}

export interface CentralFeedItem {
  id: string;
  sourceCollection: 'user_posts' | 'videos';
  contentType: FeedContentType;
  publicationStatus: PublicationStatus;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  title: string;
  caption: string;
  mediaUrl: string;
  thumbnailUrl: string;
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  duration?: string;
  createdAt: any;
  createdAtMs: number;
}

export type UnifiedLatestKind = 'photo' | 'video' | 'product' | 'game';

export interface UnifiedLatestItem {
  id: string;
  uniqueKey: string;
  kind: UnifiedLatestKind;
  title: string;
  subtitle?: string;
  thumbnailUrl: string;
  authorUid?: string;
  authorName?: string;
  authorPhoto?: string;
  createdAt: any;
  createdAtMs: number;
  postItem?: CentralFeedItem;
  productItem?: import('./catalog').CatalogProduct;
  gameItem?: import('../services/dailyGameSync').DailyGame;
}
