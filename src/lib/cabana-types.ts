/**
 * CABANA subscription-platform domain types.
 *
 * These types define the Phase 1 frontend/demo contract only. They are designed
 * to map cleanly to future Supabase tables, but do not imply that those tables
 * or production payment workflows exist yet.
 */

export type CabanaId = string;
export type ISODateString = string;
export type CurrencyCode = "USD" | "EUR" | "GBP" | string;

export type ContentVisibility = "public" | "followers" | "subscribers" | "purchase";

export interface MemberProfile {
  id: CabanaId;
  userId: CabanaId;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  isPrivate: boolean;
  joinedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreatorPost {
  id: CabanaId;
  creatorProfileId: CabanaId;
  caption: string;
  visibility: ContentVisibility;
  priceCents: number | null;
  currency: CurrencyCode | null;
  status: "draft" | "scheduled" | "published" | "archived";
  publishedAt: ISODateString | null;
  scheduledAt: ISODateString | null;
  commentCount: number;
  likeCount: number;
  saveCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PostMedia {
  id: CabanaId;
  postId: CabanaId;
  ownerUserId: CabanaId;
  kind: "image" | "video" | "audio";
  storageBucket: string;
  storagePath: string;
  previewUrl: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  position: number;
  processingStatus: "uploaded" | "processing" | "ready" | "failed";
  createdAt: ISODateString;
}

export interface Comment {
  id: CabanaId;
  postId: CabanaId;
  userId: CabanaId;
  parentCommentId: CabanaId | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Like {
  userId: CabanaId;
  postId: CabanaId;
  createdAt: ISODateString;
}

export interface Save {
  userId: CabanaId;
  postId: CabanaId;
  createdAt: ISODateString;
}

export interface Follow {
  id: CabanaId;
  followerUserId: CabanaId;
  creatorProfileId: CabanaId;
  status: "active" | "blocked";
  createdAt: ISODateString;
}

export interface CreatorSubscription {
  id: CabanaId;
  memberUserId: CabanaId;
  creatorProfileId: CabanaId;
  tierName: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  priceCents: number;
  currency: CurrencyCode;
  startedAt: ISODateString;
  currentPeriodEnd: ISODateString | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: ISODateString | null;
  mockProviderReference: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Conversation {
  id: CabanaId;
  type: "direct" | "support";
  participantUserIds: CabanaId[];
  lastMessageId: CabanaId | null;
  lastMessageAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Message {
  id: CabanaId;
  conversationId: CabanaId;
  senderUserId: CabanaId;
  body: string | null;
  mediaId: CabanaId | null;
  kind: "text" | "image" | "video" | "system";
  priceCents: number | null;
  currency: CurrencyCode | null;
  unlockedAt: ISODateString | null;
  readByUserIds: CabanaId[];
  createdAt: ISODateString;
  deletedAt: ISODateString | null;
}

export type NotificationType =
  | "follow"
  | "like"
  | "comment"
  | "subscription"
  | "message"
  | "tip"
  | "purchase"
  | "payout"
  | "system";

export interface Notification {
  id: CabanaId;
  userId: CabanaId;
  actorUserId: CabanaId | null;
  type: NotificationType;
  title: string;
  body: string;
  entityType: "creator" | "post" | "comment" | "conversation" | "transaction" | "payout" | null;
  entityId: CabanaId | null;
  readAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface Tip {
  id: CabanaId;
  transactionId: CabanaId;
  senderUserId: CabanaId;
  creatorProfileId: CabanaId;
  amountCents: number;
  currency: CurrencyCode;
  message: string | null;
  status: "pending" | "completed" | "refunded";
  createdAt: ISODateString;
}

export type TransactionType =
  | "creator_subscription"
  | "product"
  | "post_unlock"
  | "paid_message"
  | "tip"
  | "refund"
  | "adjustment";

export interface Transaction {
  id: CabanaId;
  payerUserId: CabanaId | null;
  creatorProfileId: CabanaId | null;
  type: TransactionType;
  grossCents: number;
  platformFeeCents: number;
  processorFeeCents: number;
  creatorNetCents: number;
  currency: CurrencyCode;
  status: "pending" | "succeeded" | "failed" | "refunded" | "disputed";
  referenceType: "subscription" | "product" | "post" | "message" | "tip" | null;
  referenceId: CabanaId | null;
  mockProviderReference: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreatorBalance {
  id: CabanaId;
  creatorProfileId: CabanaId;
  currency: CurrencyCode;
  pendingCents: number;
  availableCents: number;
  lifetimeGrossCents: number;
  lifetimeFeesCents: number;
  lifetimeNetCents: number;
  lifetimePaidOutCents: number;
  updatedAt: ISODateString;
}

export interface Payout {
  id: CabanaId;
  creatorProfileId: CabanaId;
  amountCents: number;
  currency: CurrencyCode;
  status: "queued" | "processing" | "paid" | "failed" | "canceled";
  scheduledFor: ISODateString | null;
  paidAt: ISODateString | null;
  failureReason: string | null;
  mockProviderReference: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Report {
  id: CabanaId;
  reporterUserId: CabanaId;
  subjectType: "user" | "creator" | "post" | "comment" | "message";
  subjectId: CabanaId;
  reason: "spam" | "harassment" | "impersonation" | "copyright" | "scam" | "other";
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  assignedAdminUserId: CabanaId | null;
  resolution: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AuditLog {
  id: CabanaId;
  actorUserId: CabanaId;
  actorRole: "creator" | "moderator" | "admin" | "system";
  action: string;
  targetType: string;
  targetId: CabanaId | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: ISODateString;
}
