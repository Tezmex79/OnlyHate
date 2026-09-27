import type { CommunityStats, Post, Profile, ReportItem, User } from './types';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'onlyhate_token';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    let code = 'request_failed';
    try {
      const payload = (await response.json()) as { error?: string };
      code = payload.error ?? code;
    } catch {
      // réponse sans corps JSON
    }
    throw new ApiError(response.status, code);
  }

  return (await response.json()) as T;
}

export const register = (input: { handle: string; password: string; avatar: string }) =>
  api<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body: input });

export const login = (input: { handle: string; password: string }) =>
  api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: input });

export const logout = () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' });

export const fetchMe = () => api<{ user: User | null }>('/api/me');

export const fetchStats = () => api<{ stats: CommunityStats }>('/api/stats');

export const fetchPosts = (category: string | null, sort: 'recent' | 'top') =>
  api<{ posts: Post[] }>(
    `/api/posts?${new URLSearchParams({ ...(category ? { category } : {}), sort })}`,
  );

export const createPost = (input: {
  title: string;
  body: string;
  category: string;
  limits: string;
  locked: boolean;
  imageId: string | null;
}) => api<{ post: Post }>('/api/posts', { method: 'POST', body: input });

export const deletePost = (postId: string) =>
  api<{ ok: true }>(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });

export const reactToPost = (postId: string, reaction: string) =>
  api<{ post: Post }>(`/api/posts/${encodeURIComponent(postId)}/reactions/${reaction}`, {
    method: 'POST',
  });

export const addComment = (postId: string, body: string) =>
  api<{ post: Post }>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: { body },
  });

export const upvoteComment = (commentId: string) =>
  api<{ upvotes: number; myUpvote: boolean }>(`/api/comments/${encodeURIComponent(commentId)}/upvote`, {
    method: 'POST',
  });

export const reportContent = (input: { postId?: string; commentId?: string; reason: string }) =>
  api<{ ok: true }>('/api/reports', { method: 'POST', body: input });

export const uploadImage = (dataUrl: string) =>
  api<{ id: string; url: string }>('/api/uploads', { method: 'POST', body: { dataUrl } });

export const fetchProfile = (handle: string) =>
  api<Profile>(`/api/users/${encodeURIComponent(handle.replace(/^@/, ''))}`);

export const fetchReports = () => api<{ reports: ReportItem[] }>('/api/admin/reports');

export const dismissReport = (reportId: string) =>
  api<{ ok: true }>(`/api/admin/reports/${encodeURIComponent(reportId)}/dismiss`, { method: 'POST' });

export const setPostHidden = (postId: string, hidden: boolean) =>
  api<{ ok: true }>(`/api/admin/posts/${encodeURIComponent(postId)}/${hidden ? 'hide' : 'unhide'}`, {
    method: 'POST',
  });

export const setCommentHidden = (commentId: string, hidden: boolean) =>
  api<{ ok: true }>(
    `/api/admin/comments/${encodeURIComponent(commentId)}/${hidden ? 'hide' : 'unhide'}`,
    { method: 'POST' },
  );
