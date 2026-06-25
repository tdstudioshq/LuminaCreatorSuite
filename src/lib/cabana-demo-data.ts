import type {
  Comment,
  Conversation,
  CreatorPost,
  CreatorSubscription,
  Follow,
  Like,
  MemberProfile,
  Message,
  Notification,
  PostMedia,
  Save,
  Transaction,
} from "@/lib/cabana-types";

const DEMO_NOW = Date.parse("2026-06-25T12:00:00.000Z");
const DAY_MS = 86_400_000;

export const DEMO_CREATOR_PROFILE_ID = "demo-creator-aurora";
export const DEMO_CREATOR_USER_ID = "demo-user-aurora";

function timestamp(daysAgo: number, hours = 0) {
  return new Date(DEMO_NOW - daysAgo * DAY_MS - hours * 3_600_000).toISOString();
}

function demoId(prefix: string, index: number) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

const MEMBER_NAMES = [
  ["Maya Chen", "mayachen"],
  ["Jordan Blake", "jordanblake"],
  ["Sofia Reyes", "sofireyes"],
  ["Noah Williams", "noahw"],
  ["Amara Okafor", "amarao"],
  ["Leo Martin", "leomartin"],
] as const;

export function createDemoMembers(count = MEMBER_NAMES.length): MemberProfile[] {
  return Array.from({ length: count }, (_, index) => {
    const [displayName, username] = MEMBER_NAMES[index % MEMBER_NAMES.length];
    return {
      id: demoId("member-profile", index),
      userId: demoId("member-user", index),
      displayName,
      username: `${username}${index >= MEMBER_NAMES.length ? index + 1 : ""}`,
      avatarUrl: null,
      bio: index % 2 === 0 ? "Collecting good music, design, and late-night ideas." : "",
      isPrivate: index === 4,
      joinedAt: timestamp(80 - index * 8),
      updatedAt: timestamp(index + 1),
    };
  });
}

export function createDemoPosts(count = 6): CreatorPost[] {
  const captions = [
    "A private look at the new visual world. Built slowly, released with intention.",
    "Studio notes from this week — color, texture, and the shape of the next drop.",
    "Subscribers get the full cut tonight. This is the first frame.",
    "The archive opens for 48 hours.",
    "A quiet morning in the studio before everything changes.",
    "New chapter. Same standards.",
  ];

  return Array.from({ length: count }, (_, index) => ({
    id: demoId("post", index),
    creatorProfileId: DEMO_CREATOR_PROFILE_ID,
    caption: captions[index % captions.length],
    visibility: index === 1 || index === 2 ? "subscribers" : index === 3 ? "purchase" : "public",
    priceCents: index === 3 ? 900 : null,
    currency: index === 3 ? "USD" : null,
    status: "published",
    publishedAt: timestamp(index * 2 + 1),
    scheduledAt: null,
    commentCount: 3 + index * 2,
    likeCount: 42 + index * 17,
    saveCount: 8 + index * 4,
    createdAt: timestamp(index * 2 + 1, 1),
    updatedAt: timestamp(index * 2 + 1),
  }));
}

export function createDemoPostMedia(posts = createDemoPosts()): PostMedia[] {
  return posts.map((post, index) => ({
    id: demoId("post-media", index),
    postId: post.id,
    ownerUserId: DEMO_CREATOR_USER_ID,
    kind: index === 2 ? "video" : "image",
    storageBucket: "demo-post-media",
    storagePath: `aurora/${post.id}/hero-${index + 1}.jpg`,
    previewUrl: null,
    mimeType: index === 2 ? "video/mp4" : "image/jpeg",
    width: 1200,
    height: 1500,
    durationSeconds: index === 2 ? 18 : null,
    position: 0,
    processingStatus: "ready",
    createdAt: post.createdAt,
  }));
}

export function createDemoComments(
  posts = createDemoPosts(),
  members = createDemoMembers(),
  count = 12,
): Comment[] {
  const bodies = [
    "This feels like a film still.",
    "The color direction is perfect.",
    "Waiting for the full release.",
    "Instant save.",
    "The detail in this is unreal.",
    "This is why I subscribed.",
  ];

  return Array.from({ length: count }, (_, index) => ({
    id: demoId("comment", index),
    postId: posts[index % posts.length].id,
    userId: members[index % members.length].userId,
    parentCommentId: null,
    body: bodies[index % bodies.length],
    status: "visible",
    createdAt: timestamp(index % 9, index % 5),
    updatedAt: timestamp(index % 9, index % 5),
  }));
}

export function createDemoLikes(posts = createDemoPosts(), members = createDemoMembers()): Like[] {
  return posts.flatMap((post, postIndex) =>
    members.slice(0, 3 + (postIndex % 3)).map((member, memberIndex) => ({
      userId: member.userId,
      postId: post.id,
      createdAt: timestamp(postIndex + memberIndex),
    })),
  );
}

export function createDemoSaves(posts = createDemoPosts(), members = createDemoMembers()): Save[] {
  return posts.map((post, index) => ({
    userId: members[index % members.length].userId,
    postId: post.id,
    createdAt: timestamp(index + 1),
  }));
}

export function createDemoFollows(members = createDemoMembers()): Follow[] {
  return members.map((member, index) => ({
    id: demoId("follow", index),
    followerUserId: member.userId,
    creatorProfileId: DEMO_CREATOR_PROFILE_ID,
    status: "active",
    createdAt: timestamp(40 - index * 4),
  }));
}

export function createDemoSubscriptions(members = createDemoMembers()): CreatorSubscription[] {
  return members.slice(0, 4).map((member, index) => ({
    id: demoId("creator-subscription", index),
    memberUserId: member.userId,
    creatorProfileId: DEMO_CREATOR_PROFILE_ID,
    tierName: index < 3 ? "Inner Circle" : "Backstage",
    status: index === 3 ? "trialing" : "active",
    priceCents: index < 3 ? 1900 : 3900,
    currency: "USD",
    startedAt: timestamp(45 - index * 7),
    currentPeriodEnd: timestamp(-7 - index),
    cancelAtPeriodEnd: index === 2,
    canceledAt: null,
    mockProviderReference: `mock_sub_${index + 1}`,
    createdAt: timestamp(45 - index * 7),
    updatedAt: timestamp(index),
  }));
}

export function createDemoConversations(members = createDemoMembers()): Conversation[] {
  return members.slice(0, 4).map((member, index) => ({
    id: demoId("conversation", index),
    type: "direct",
    participantUserIds: [DEMO_CREATOR_USER_ID, member.userId],
    lastMessageId: demoId("message", index * 2 + 1),
    lastMessageAt: timestamp(index, index + 1),
    createdAt: timestamp(24 - index * 3),
    updatedAt: timestamp(index, index + 1),
  }));
}

export function createDemoMessages(
  conversations = createDemoConversations(),
  members = createDemoMembers(),
): Message[] {
  return conversations.flatMap((conversation, index) => {
    const member = members[index % members.length];
    return [
      {
        id: demoId("message", index * 2),
        conversationId: conversation.id,
        senderUserId: member.userId,
        body: "The new drop looks incredible. Is the full set going live this week?",
        mediaId: null,
        kind: "text" as const,
        priceCents: null,
        currency: null,
        unlockedAt: null,
        readByUserIds: [member.userId, DEMO_CREATOR_USER_ID],
        createdAt: timestamp(index + 1, 2),
        deletedAt: null,
      },
      {
        id: demoId("message", index * 2 + 1),
        conversationId: conversation.id,
        senderUserId: DEMO_CREATOR_USER_ID,
        body: "Yes — subscribers see it Friday night. I’ll send the preview first.",
        mediaId: null,
        kind: "text" as const,
        priceCents: null,
        currency: null,
        unlockedAt: null,
        readByUserIds: [DEMO_CREATOR_USER_ID],
        createdAt: timestamp(index, index + 1),
        deletedAt: null,
      },
    ];
  });
}

export function createDemoNotifications(members = createDemoMembers()): Notification[] {
  const types: Notification["type"][] = [
    "subscription",
    "message",
    "follow",
    "comment",
    "tip",
    "system",
  ];

  return types.map((type, index) => ({
    id: demoId("notification", index),
    userId: DEMO_CREATOR_USER_ID,
    actorUserId: type === "system" ? null : members[index % members.length].userId,
    type,
    title:
      type === "subscription"
        ? "New Inner Circle member"
        : type === "message"
          ? "New message"
          : type === "tip"
            ? "You received a demo tip"
            : "New CABANA activity",
    body:
      type === "system"
        ? "Phase 1 demo data is active. No real payment or notification was sent."
        : `${members[index % members.length].displayName} created new demo activity.`,
    entityType: type === "message" ? "conversation" : type === "comment" ? "comment" : "creator",
    entityId: type === "system" ? null : demoId("demo-entity", index),
    readAt: index > 2 ? timestamp(index - 1) : null,
    createdAt: timestamp(index, index),
  }));
}

export function createDemoTransactions(subscriptions = createDemoSubscriptions()): Transaction[] {
  return subscriptions.map((subscription, index) => {
    const grossCents = subscription.priceCents;
    const platformFeeCents = Math.round(grossCents * 0.1);
    const processorFeeCents = Math.round(grossCents * 0.03);
    return {
      id: demoId("transaction", index),
      payerUserId: subscription.memberUserId,
      creatorProfileId: subscription.creatorProfileId,
      type: "creator_subscription",
      grossCents,
      platformFeeCents,
      processorFeeCents,
      creatorNetCents: grossCents - platformFeeCents - processorFeeCents,
      currency: subscription.currency,
      status: "succeeded",
      referenceType: "subscription",
      referenceId: subscription.id,
      mockProviderReference: `mock_txn_${index + 1}`,
      createdAt: subscription.startedAt,
      updatedAt: subscription.updatedAt,
    };
  });
}

export function createCabanaDemoData() {
  const members = createDemoMembers();
  const posts = createDemoPosts();
  const postMedia = createDemoPostMedia(posts);
  const comments = createDemoComments(posts, members);
  const likes = createDemoLikes(posts, members);
  const saves = createDemoSaves(posts, members);
  const follows = createDemoFollows(members);
  const subscriptions = createDemoSubscriptions(members);
  const conversations = createDemoConversations(members);
  const messages = createDemoMessages(conversations, members);
  const notifications = createDemoNotifications(members);
  const transactions = createDemoTransactions(subscriptions);

  return {
    members,
    posts,
    postMedia,
    comments,
    likes,
    saves,
    follows,
    subscriptions,
    conversations,
    messages,
    notifications,
    transactions,
  };
}

export const CABANA_DEMO_DATA = createCabanaDemoData();
