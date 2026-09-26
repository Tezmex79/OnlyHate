import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  avatar TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'libre',
  limits TEXT,
  image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
`;

const SEED_USERS = [
  { id: 'u-mauvaisefoi', handle: 'mauvaisefoi', avatar: 'MF' },
  { id: 'u-tribunaldespates', handle: 'tribunaldespates', avatar: 'CT' },
  { id: 'u-socksandsandals', handle: 'socksandsandals', avatar: 'MS' },
];

const SEED_POSTS = [
  {
    id: 'post-setup-gaming',
    authorId: 'u-mauvaisefoi',
    title: 'Mon setup gaming a encore perdu contre le câble management',
    body: 'Poste ton coin bureau, assume les multiprises visibles et laisse la salle juger. Consentement explicite, ego remboursé sous 48h.',
    category: 'tech',
    limits: 'Roastez le setup, pas mon esthétique de bureau.',
    ageMs: 1000 * 60 * 60 * 48,
  },
  {
    id: 'post-carbonara',
    authorId: 'u-tribunaldespates',
    title: 'Carbonara crème fraîche: la Cour demande réparation',
    body: 'Ici on juge les assiettes, pas les personnes. Les vannes restent sur la recette, les attaques perso prennent la sortie.',
    category: 'food',
    limits: 'Vannes sur la recette uniquement.',
    ageMs: 1000 * 60 * 60 * 26,
  },
  {
    id: 'post-sandales',
    authorId: 'u-socksandsandals',
    title: 'J’ai porté chaussettes-sandales au premier date',
    body: 'Le public peut charger la tenue. Règle maison: pas de cible protégée, pas de doxxing, pas de haine réelle.',
    category: 'style',
    limits: null,
    ageMs: 1000 * 60 * 90,
  },
];

const SEED_REACTIONS = [
  { postId: 'post-setup-gaming', userId: 'u-tribunaldespates', key: 'brulure' },
  { postId: 'post-setup-gaming', userId: 'u-socksandsandals', key: 'cringe' },
  { postId: 'post-carbonara', userId: 'u-mauvaisefoi', key: 'brulure' },
  { postId: 'post-carbonara', userId: 'u-socksandsandals', key: 'ko' },
  { postId: 'post-sandales', userId: 'u-tribunaldespates', key: 'cringe' },
];

const SEED_COMMENTS = [
  {
    id: 'comment-sandales-1',
    postId: 'post-sandales',
    authorId: 'u-tribunaldespates',
    body: 'Le combo assume, le date probablement pas.',
    voterId: 'u-mauvaisefoi',
  },
];

const seed = (db) => {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) {
    return;
  }

  const now = Date.now();
  const insertUser = db.prepare(
    'INSERT INTO users (id, handle, password_hash, avatar, role, banned, created_at) VALUES (?, ?, NULL, ?, ?, 0, ?)',
  );
  for (const user of SEED_USERS) {
    insertUser.run(user.id, user.handle, user.avatar, 'user', now);
  }

  const insertPost = db.prepare(
    'INSERT INTO posts (id, author_id, title, body, category, limits, image_id, locked, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)',
  );
  for (const post of SEED_POSTS) {
    insertPost.run(post.id, post.authorId, post.title, post.body, post.category, post.limits, now - post.ageMs);
  }

  const insertReaction = db.prepare('INSERT INTO reactions (post_id, user_id, key) VALUES (?, ?, ?)');
  for (const reaction of SEED_REACTIONS) {
    insertReaction.run(reaction.postId, reaction.userId, reaction.key);
  }

  const insertComment = db.prepare(
    'INSERT INTO comments (id, post_id, author_id, body, hidden, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  );
  const insertVote = db.prepare('INSERT INTO comment_votes (comment_id, user_id) VALUES (?, ?)');
  for (const comment of SEED_COMMENTS) {
    insertComment.run(comment.id, comment.postId, comment.authorId, comment.body, now - 1000 * 60 * 30);
    insertVote.run(comment.id, comment.voterId);
  }
};

export const openDatabase = (dbPath) => {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  seed(db);
  return db;
};
