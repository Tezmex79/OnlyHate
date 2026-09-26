import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.ONLYHATE_DATA_DIR ?? path.join(rootDir, 'data');
const dbPath = process.env.ONLYHATE_DB ?? path.join(dataDir, 'onlyhate.db');
const uploadsDir = process.env.ONLYHATE_UPLOADS_DIR ?? path.join(dataDir, 'uploads');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT ?? 8787);

await mkdir(dataDir, { recursive: true });
const db = openDatabase(dbPath);

const CATEGORIES = new Set(['tech', 'food', 'style', 'sport', 'libre']);
const REACTIONS = new Set(['brulure', 'cringe', 'ko']);
const REPORT_REASONS = new Set(['haine', 'doxxing', 'menace', 'hors-charte', 'autre']);
const MAX_IMAGE_BYTES = 3_000_000;

const blockedTermsPath = path.join(__dirname, 'blocked_terms.json');
let blockedTerms = [];
try {
  const raw = await readFile(blockedTermsPath, 'utf8');
  blockedTerms = JSON.parse(raw)
    .filter((term) => typeof term === 'string')
    .map((term) => normalizeText(term))
    .filter(Boolean);
} catch {
  console.error(`Impossible de charger ${blockedTermsPath}: le filtre anti-haine est inactif.`);
  blockedTerms = [];
}

/* ---------- helpers ---------- */

const httpError = (status, code) => {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
};

const sendJson = (response, status, payload) => {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
};

const notFound = (response) => sendJson(response, 404, { error: 'not_found' });

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const cleanText = (value, maxLength) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
};

const findBlockedTerm = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }
  const normalized = normalizeText(text);
  return blockedTerms.some((term) => normalized.includes(term));
};

const assertClean = (text, label) => {
  if (findBlockedTerm(text)) {
    throw httpError(403, `forbidden_content_${label}`);
  }
};

const readJson = async (request, maxBytes = 32_768) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, 'payload_too_large');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'invalid_json');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(400, 'invalid_body');
  }

  return parsed;
};

/* ---------- auth ---------- */

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored) {
    return false;
  }
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const createSession = (userId) => {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
  return token;
};

const getAuthUser = (request) => {
  const header = request.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) {
    return null;
  }
  return db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .get(token);
};

const requireAuth = (request) => {
  const user = getAuthUser(request);
  if (!user) {
    throw httpError(401, 'auth_required');
  }
  if (user.banned) {
    throw httpError(403, 'banned');
  }
  return user;
};

const requireAdmin = (request) => {
  const user = requireAuth(request);
  if (user.role !== 'admin') {
    throw httpError(403, 'admin_required');
  }
  return user;
};

const publicUser = (user) => ({
  id: user.id,
  handle: `@${user.handle}`,
  avatar: user.avatar,
  role: user.role,
});

/* ---------- post views ---------- */

const buildPostViews = (viewer, options = {}) => {
  const isAdmin = viewer?.role === 'admin';
  const clauses = [];
  const params = [];

  if (!isAdmin) {
    clauses.push('p.hidden = 0');
  }
  if (options.category) {
    clauses.push('p.category = ?');
    params.push(options.category);
  }
  if (options.authorId) {
    clauses.push('p.author_id = ?');
    params.push(options.authorId);
  }
  if (options.postId) {
    clauses.push('p.id = ?');
    params.push(options.postId);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT p.*, u.handle AS author_handle, u.avatar AS author_avatar, i.filename AS image_filename
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN images i ON i.id = p.image_id${where}
       ORDER BY p.created_at DESC`,
    )
    .all(...params);

  if (rows.length === 0) {
    return [];
  }

  const postIds = rows.map((row) => row.id);
  const placeholders = postIds.map(() => '?').join(', ');

  const reactionRows = db
    .prepare(
      `SELECT r.post_id, r.key, COUNT(*) AS count FROM reactions r
       WHERE r.post_id IN (${placeholders}) GROUP BY r.post_id, r.key`,
    )
    .all(...postIds);

  const commentRows = db
    .prepare(
      `SELECT c.*, u.handle AS author_handle, u.avatar AS author_avatar,
              (SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = c.id) AS upvotes
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id IN (${placeholders})${isAdmin ? '' : ' AND c.hidden = 0'}
       ORDER BY c.created_at ASC`,
    )
    .all(...postIds);

  let myReactions = new Map();
  let commentedPostIds = new Set();
  let myCommentVotes = new Set();

  if (viewer) {
    const reactionRowsMine = db
      .prepare(`SELECT post_id, key FROM reactions WHERE user_id = ? AND post_id IN (${placeholders})`)
      .all(viewer.id, ...postIds);
    myReactions = new Map(reactionRowsMine.map((row) => [row.post_id, row.key]));

    const commentRowsMine = db
      .prepare(`SELECT DISTINCT post_id FROM comments WHERE author_id = ? AND hidden = 0 AND post_id IN (${placeholders})`)
      .all(viewer.id, ...postIds);
    commentedPostIds = new Set(commentRowsMine.map((row) => row.post_id));

    const commentIds = commentRows.map((row) => row.id);
    if (commentIds.length > 0) {
      const voteRows = db
        .prepare(
          `SELECT comment_id FROM comment_votes WHERE user_id = ? AND comment_id IN (${commentIds.map(() => '?').join(', ')})`,
        )
        .all(viewer.id, ...commentIds);
      myCommentVotes = new Set(voteRows.map((row) => row.comment_id));
    }
  }

  const reactionCounts = new Map();
  for (const row of reactionRows) {
    if (!reactionCounts.has(row.post_id)) {
      reactionCounts.set(row.post_id, { brulure: 0, cringe: 0, ko: 0 });
    }
    reactionCounts.get(row.post_id)[row.key] = row.count;
  }

  const commentsByPost = new Map();
  for (const row of commentRows) {
    if (!commentsByPost.has(row.post_id)) {
      commentsByPost.set(row.post_id, []);
    }
    commentsByPost.get(row.post_id).push({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      hidden: Boolean(row.hidden),
      author: { id: row.author_id, handle: `@${row.author_handle}`, avatar: row.author_avatar },
      upvotes: row.upvotes,
      myUpvote: myCommentVotes.has(row.id),
    });
  }

  const views = rows.map((row) => {
    const isAuthor = viewer?.id === row.author_id;
    const unlocked = !row.locked || isAuthor || isAdmin || commentedPostIds.has(row.id);
    const counts = reactionCounts.get(row.id) ?? { brulure: 0, cringe: 0, ko: 0 };

    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      limits: row.limits,
      imageUrl: row.image_filename ? `/uploads/${row.image_filename}` : null,
      locked: Boolean(row.locked),
      hidden: Boolean(row.hidden),
      createdAt: row.created_at,
      author: { id: row.author_id, handle: `@${row.author_handle}`, avatar: row.author_avatar },
      reactions: counts,
      myReaction: myReactions.get(row.id) ?? null,
      unlocked,
      comments: commentsByPost.get(row.id) ?? [],
    };
  });

  if (options.sort === 'top') {
    views.sort((a, b) => {
      const totalA = a.reactions.brulure + a.reactions.cringe + a.reactions.ko;
      const totalB = b.reactions.brulure + b.reactions.cringe + b.reactions.ko;
      return totalB - totalA || b.createdAt - a.createdAt;
    });
  }

  return views;
};

const getVisiblePost = (viewer, postId) => {
  const views = buildPostViews(viewer, { postId });
  return views[0] ?? null;
};

/* ---------- uploads ---------- */

const imageSignatures = [
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

const detectImageType = (buffer) => {
  for (const signature of imageSignatures) {
    if (signature.bytes.every((byte, index) => buffer[index] === byte)) {
      return signature.ext;
    }
  }
  return null;
};

const saveUpload = async (request, user) => {
  const body = await readJson(request, MAX_IMAGE_BYTES * 2);
  const match = typeof body.dataUrl === 'string' ? body.dataUrl.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/) : null;

  if (!match) {
    throw httpError(400, 'invalid_image');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw httpError(413, 'image_too_large');
  }

  const ext = detectImageType(buffer);
  if (!ext) {
    throw httpError(400, 'unsupported_image');
  }

  const id = randomUUID();
  const filename = `${id}.${ext}`;
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), buffer);
  db.prepare('INSERT INTO images (id, user_id, filename, created_at) VALUES (?, ?, ?, ?)').run(id, user.id, filename, Date.now());

  return { id, url: `/uploads/${filename}` };
};

/* ---------- routes ---------- */

const handleAuth = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/auth/register' && request.method === 'POST') {
    const body = await readJson(request);
    const handle = cleanText(body.handle, 21).replace(/^@/, '').toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const avatar = cleanText(body.avatar, 3) || '😈';

    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      throw httpError(400, 'invalid_handle');
    }
    if (password.length < 8 || password.length > 128) {
      throw httpError(400, 'invalid_password');
    }
    assertClean(handle, 'handle');

    if (db.prepare('SELECT id FROM users WHERE handle = ?').get(handle)) {
      throw httpError(409, 'handle_taken');
    }

    const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users WHERE password_hash IS NOT NULL').get().count === 0;
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users (id, handle, password_hash, avatar, role, banned, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    ).run(id, handle, hashPassword(password), avatar, isFirstUser ? 'admin' : 'user', Date.now());

    const token = createSession(id);
    sendJson(response, 201, { token, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    return;
  }

  if (requestUrl.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson(request);
    const handle = cleanText(body.handle, 21).replace(/^@/, '').toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';

    const user = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw httpError(401, 'invalid_credentials');
    }
    if (user.banned) {
      throw httpError(403, 'banned');
    }

    const token = createSession(user.id);
    sendJson(response, 200, { token, user: publicUser(user) });
    return;
  }

  if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
    const header = request.headers.authorization ?? '';
    if (header.startsWith('Bearer ')) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(header.slice(7).trim());
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === '/api/me' && request.method === 'GET') {
    const user = getAuthUser(request);
    if (!user || user.banned) {
      sendJson(response, 200, { user: null });
      return;
    }
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  notFound(response);
};

const handlePosts = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/posts' && request.method === 'GET') {
    const viewer = getAuthUser(request);
    const category = requestUrl.searchParams.get('category');
    const sort = requestUrl.searchParams.get('sort') === 'top' ? 'top' : 'recent';

    if (category && !CATEGORIES.has(category)) {
      throw httpError(400, 'unknown_category');
    }

    sendJson(response, 200, { posts: buildPostViews(viewer && !viewer.banned ? viewer : null, { category, sort }) });
    return;
  }

  if (requestUrl.pathname === '/api/posts' && request.method === 'POST') {
    const user = requireAuth(request);
    const body = await readJson(request);
    const title = cleanText(body.title, 120);
    const text = cleanText(body.body, 520);
    const limits = cleanText(body.limits, 200) || null;
    const category = CATEGORIES.has(body.category) ? body.category : 'libre';
    const locked = body.locked === true;
    const imageId = typeof body.imageId === 'string' ? body.imageId : null;

    if (!title || !text) {
      throw httpError(400, 'title_and_body_required');
    }
    assertClean(title, 'title');
    assertClean(text, 'body');
    assertClean(limits, 'limits');

    if (imageId) {
      const image = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(imageId, user.id);
      if (!image) {
        throw httpError(400, 'unknown_image');
      }
    }

    const id = randomUUID();
    db.prepare(
      'INSERT INTO posts (id, author_id, title, body, category, limits, image_id, locked, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    ).run(id, user.id, title, text, category, limits, imageId, locked ? 1 : 0, Date.now());

    sendJson(response, 201, { post: getVisiblePost(user, id) });
    return;
  }

  let match = requestUrl.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (match && request.method === 'DELETE') {
    const user = requireAuth(request);
    const [, postId] = match;

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post || (post.author_id !== user.id && user.role !== 'admin')) {
      throw httpError(404, 'post_not_found');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?)`,
      ).run(postId);
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM reactions WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM reports WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    if (post.image_id) {
      const image = db.prepare('SELECT * FROM images WHERE id = ?').get(post.image_id);
      if (image) {
        db.prepare('DELETE FROM images WHERE id = ?').run(image.id);
        await unlink(path.join(uploadsDir, image.filename)).catch(() => {});
      }
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/posts\/([^/]+)\/reactions\/([^/]+)$/);
  if (match && request.method === 'POST') {
    const user = requireAuth(request);
    const [, postId, reactionKey] = match;

    if (!REACTIONS.has(reactionKey)) {
      throw httpError(400, 'unknown_reaction');
    }

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post || (post.hidden && user.role !== 'admin')) {
      throw httpError(404, 'post_not_found');
    }

    const existing = db
      .prepare('SELECT key FROM reactions WHERE post_id = ? AND user_id = ?')
      .get(postId, user.id);

    if (existing?.key === reactionKey) {
      db.prepare('DELETE FROM reactions WHERE post_id = ? AND user_id = ?').run(postId, user.id);
    } else {
      db.prepare(
        'INSERT INTO reactions (post_id, user_id, key) VALUES (?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET key = excluded.key',
      ).run(postId, user.id, reactionKey);
    }

    sendJson(response, 200, { post: getVisiblePost(user, postId) });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (match && request.method === 'POST') {
    const user = requireAuth(request);
    const [, postId] = match;
    const body = await readJson(request);
    const text = cleanText(body.body, 280);

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post || (post.hidden && user.role !== 'admin')) {
      throw httpError(404, 'post_not_found');
    }
    if (!text) {
      throw httpError(400, 'comment_required');
    }
    assertClean(text, 'comment');

    db.prepare('INSERT INTO comments (id, post_id, author_id, body, hidden, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
      randomUUID(),
      postId,
      user.id,
      text,
      Date.now(),
    );

    sendJson(response, 201, { post: getVisiblePost(user, postId) });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/comments\/([^/]+)\/upvote$/);
  if (match && request.method === 'POST') {
    const user = requireAuth(request);
    const [, commentId] = match;

    const comment = db
      .prepare('SELECT c.*, p.hidden AS post_hidden FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?')
      .get(commentId);
    if (!comment || (comment.hidden && user.role !== 'admin') || (comment.post_hidden && user.role !== 'admin')) {
      throw httpError(404, 'comment_not_found');
    }

    const existing = db.prepare('SELECT 1 AS one FROM comment_votes WHERE comment_id = ? AND user_id = ?').get(commentId, user.id);
    if (existing) {
      db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?').run(commentId, user.id);
    } else {
      db.prepare('INSERT INTO comment_votes (comment_id, user_id) VALUES (?, ?)').run(commentId, user.id);
    }

    const upvotes = db.prepare('SELECT COUNT(*) AS count FROM comment_votes WHERE comment_id = ?').get(commentId).count;
    sendJson(response, 200, { upvotes, myUpvote: !existing });
    return;
  }

  notFound(response);
};

const handleReports = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/reports' && request.method === 'POST') {
    const user = requireAuth(request);
    const body = await readJson(request);
    const reason = body.reason;
    const postId = typeof body.postId === 'string' ? body.postId : null;
    const commentId = typeof body.commentId === 'string' ? body.commentId : null;

    if (!REPORT_REASONS.has(reason) || (postId === null) === (commentId === null)) {
      throw httpError(400, 'invalid_report');
    }

    let target;
    if (postId) {
      target = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
    } else {
      target = db.prepare('SELECT id FROM comments WHERE id = ?').get(commentId);
    }
    if (!target) {
      throw httpError(404, 'target_not_found');
    }

    db.prepare(
      'INSERT INTO reports (id, post_id, comment_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(randomUUID(), postId, commentId, user.id, reason, 'open', Date.now());

    sendJson(response, 201, { ok: true });
    return;
  }

  notFound(response);
};

const handleUploads = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/uploads' && request.method === 'POST') {
    const user = requireAuth(request);
    sendJson(response, 201, await saveUpload(request, user));
    return;
  }

  notFound(response);
};

const handleUsers = async (request, response, requestUrl) => {
  const match = requestUrl.pathname.match(/^\/api\/users\/([a-z0-9_]{3,20})$/);
  if (match && request.method === 'GET') {
    const viewer = getAuthUser(request);
    const [, handle] = match;

    const user = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
    if (!user) {
      throw httpError(404, 'user_not_found');
    }

    const stats = {
      posts: db.prepare('SELECT COUNT(*) AS count FROM posts WHERE author_id = ?').get(user.id).count,
      comments: db.prepare('SELECT COUNT(*) AS count FROM comments WHERE author_id = ?').get(user.id).count,
      roastsReceived: db
        .prepare(
          'SELECT COUNT(*) AS count FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.author_id = ?',
        )
        .get(user.id).count,
      koGiven: db.prepare('SELECT COUNT(*) AS count FROM reactions WHERE user_id = ? AND key = ?').get(user.id, 'ko').count,
    };

    sendJson(response, 200, {
      user: publicUser(user),
      stats,
      posts: buildPostViews(viewer && !viewer.banned ? viewer : null, { authorId: user.id }),
    });
    return;
  }

  notFound(response);
};

const handleAdmin = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/admin/reports' && request.method === 'GET') {
    requireAdmin(request);

    const rows = db
      .prepare(
        `SELECT r.*, ru.handle AS reporter_handle
         FROM reports r JOIN users ru ON ru.id = r.reporter_id
         WHERE r.status = 'open'
         ORDER BY r.created_at ASC`,
      )
      .all();

    const reports = rows.map((row) => {
      const item = {
        id: row.id,
        reason: row.reason,
        createdAt: row.created_at,
        reporter: `@${row.reporter_handle}`,
        post: null,
        comment: null,
      };

      if (row.post_id) {
        const post = db
          .prepare('SELECT p.*, u.handle AS author_handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?')
          .get(row.post_id);
        if (post) {
          item.post = {
            id: post.id,
            title: post.title,
            body: post.body,
            hidden: Boolean(post.hidden),
            author: `@${post.author_handle}`,
          };
        }
      } else if (row.comment_id) {
        const comment = db
          .prepare(
            `SELECT c.*, u.handle AS author_handle, p.title AS post_title, p.id AS post_id
             FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
             WHERE c.id = ?`,
          )
          .get(row.comment_id);
        if (comment) {
          item.comment = {
            id: comment.id,
            body: comment.body,
            hidden: Boolean(comment.hidden),
            author: `@${comment.author_handle}`,
            postId: comment.post_id,
            postTitle: comment.post_title,
          };
        }
      }

      return item;
    });

    sendJson(response, 200, { reports });
    return;
  }

  let match = requestUrl.pathname.match(/^\/api\/admin\/reports\/([^/]+)\/dismiss$/);
  if (match && request.method === 'POST') {
    requireAdmin(request);
    const [, reportId] = match;
    const result = db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ? AND status = 'open'").run(reportId);
    if (result.changes === 0) {
      throw httpError(404, 'report_not_found');
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/admin\/posts\/([^/]+)\/(hide|unhide)$/);
  if (match && request.method === 'POST') {
    requireAdmin(request);
    const [, postId, action] = match;
    const result = db
      .prepare('UPDATE posts SET hidden = ? WHERE id = ?')
      .run(action === 'hide' ? 1 : 0, postId);
    if (result.changes === 0) {
      throw httpError(404, 'post_not_found');
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/admin\/comments\/([^/]+)\/(hide|unhide)$/);
  if (match && request.method === 'POST') {
    requireAdmin(request);
    const [, commentId, action] = match;
    const result = db
      .prepare('UPDATE comments SET hidden = ? WHERE id = ?')
      .run(action === 'hide' ? 1 : 0, commentId);
    if (result.changes === 0) {
      throw httpError(404, 'comment_not_found');
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  match = requestUrl.pathname.match(/^\/api\/admin\/users\/([^/]+)\/(ban|unban)$/);
  if (match && request.method === 'POST') {
    const admin = requireAdmin(request);
    const [, userId, action] = match;

    if (userId === admin.id) {
      throw httpError(400, 'cannot_ban_self');
    }

    const result = db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(action === 'ban' ? 1 : 0, userId);
    if (result.changes === 0) {
      throw httpError(404, 'user_not_found');
    }
    if (action === 'ban') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  notFound(response);
};

const handleApi = async (request, response, requestUrl) => {
  if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname.startsWith('/api/auth/') || requestUrl.pathname === '/api/me') {
    await handleAuth(request, response, requestUrl);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/posts') || requestUrl.pathname.startsWith('/api/comments/')) {
    await handlePosts(request, response, requestUrl);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/reports')) {
    await handleReports(request, response, requestUrl);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/uploads')) {
    await handleUploads(request, response, requestUrl);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/users/')) {
    await handleUsers(request, response, requestUrl);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/admin/')) {
    await handleAdmin(request, response, requestUrl);
    return;
  }

  notFound(response);
};

/* ---------- static ---------- */

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

const resolveWithin = (baseDir, relativePath) => {
  const filePath = path.normalize(path.join(baseDir, relativePath));
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    return null;
  }
  return filePath;
};

const serveFile = async (response, filePath, cacheControl) => {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return false;
  }
  if (!fileStat.isFile()) {
    return false;
  }

  response.writeHead(200, {
    'content-type': mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
    'cache-control': cacheControl,
  });
  createReadStream(filePath).pipe(response);
  return true;
};

const serveStatic = async (request, response, requestUrl) => {
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith('/uploads/')) {
    const filePath = resolveWithin(uploadsDir, pathname.slice('/uploads/'.length));
    const served = filePath ? await serveFile(response, filePath, 'public, max-age=86400') : false;
    if (!served) {
      notFound(response);
    }
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolveWithin(distDir, relativePath);
  const cacheControl = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';

  let served = filePath ? await serveFile(response, filePath, cacheControl) : false;
  if (!served && request.method === 'GET') {
    served = await serveFile(response, path.join(distDir, 'index.html'), 'no-cache');
  }
  if (!served) {
    notFound(response);
  }
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(request, response, requestUrl);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      notFound(response);
      return;
    }

    await serveStatic(request, response, requestUrl);
  } catch (error) {
    const status = error.status ?? 500;
    const code = error.code ?? 'server_error';
    if (status >= 500) {
      console.error(error);
    }
    sendJson(response, status, { error: code });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`OnlyHate server ready on http://127.0.0.1:${port}`);
});
