export type ReactionKey = 'brulure' | 'cringe' | 'ko';

export type CommunityStats = {
  users: number;
  posts: number;
  comments: number;
  reactions: number;
  reactionSplit: Record<ReactionKey, number>;
  topRoast: {
    id: string;
    title: string;
    body: string;
    category: string;
    createdAt: number;
    totalReactions: number;
    author: { id: string; handle: string; avatar: string };
    reactions: Record<ReactionKey, number>;
  } | null;
};

export type User = {
  id: string;
  handle: string;
  avatar: string;
  role: 'user' | 'admin';
};

export type CommentItem = {
  id: string;
  body: string;
  createdAt: number;
  hidden: boolean;
  author: { id: string; handle: string; avatar: string };
  upvotes: number;
  myUpvote: boolean;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  category: string;
  limits: string | null;
  imageUrl: string | null;
  locked: boolean;
  hidden: boolean;
  createdAt: number;
  author: { id: string; handle: string; avatar: string };
  reactions: Record<ReactionKey, number>;
  myReaction: ReactionKey | null;
  unlocked: boolean;
  comments: CommentItem[];
};

export type Profile = {
  user: User;
  stats: {
    posts: number;
    comments: number;
    roastsReceived: number;
    koGiven: number;
  };
  posts: Post[];
};

export type ReportItem = {
  id: string;
  reason: string;
  createdAt: number;
  reporter: string;
  post: { id: string; title: string; body: string; hidden: boolean; author: string } | null;
  comment:
    | { id: string; body: string; hidden: boolean; author: string; postId: string; postTitle: string }
    | null;
};
