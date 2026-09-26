import { FormEvent, useState } from 'react';
import type { CommentItem, Post, User } from '../types';
import { REACTIONS, REPORT_REASONS, categoryEmoji, categoryLabel, formatAge } from '../constants';
import { addComment, deletePost, reactToPost, reportContent, upvoteComment } from '../api';

type PostCardProps = {
  post: Post;
  user: User | null;
  onPostUpdated: (post: Post) => void;
  onPostDeleted: (postId: string) => void;
  onStatusChange: (status: string) => void;
  onOpenProfile: (handle: string) => void;
};

type ReportTarget = { postId?: string; commentId?: string };

function CommentRow({
  comment,
  user,
  onUpvote,
  onReport,
  onOpenProfile,
  disabled,
}: {
  comment: CommentItem;
  user: User | null;
  onUpvote: (commentId: string) => void;
  onReport: (target: ReportTarget) => void;
  onOpenProfile: (handle: string) => void;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false);

  const handleUpvote = async () => {
    if (!user || pending) return;
    setPending(true);
    try {
      await upvoteComment(comment.id);
      onUpvote(comment.id);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="comment-row">
      <span className="avatar avatar-small" aria-hidden="true">
        {comment.author.avatar}
      </span>
      <div className="comment-main">
        <div className="comment-head">
          <button type="button" className="link-author" onClick={() => onOpenProfile(comment.author.handle)}>
            {comment.author.handle}
          </button>
          <span className="comment-age">{formatAge(comment.createdAt)}</span>
          {comment.hidden && <span className="badge badge-admin">masqué</span>}
        </div>
        <p className={comment.hidden ? 'comment-body comment-hidden' : 'comment-body'}>{comment.body}</p>
        <div className="comment-actions">
          <button
            type="button"
            className={`chip chip-upvote${comment.myUpvote ? ' chip-active' : ''}`}
            onClick={() => void handleUpvote()}
            disabled={disabled || !user}
            aria-label={`Upvoter la vanne de ${comment.author.handle}`}
          >
            😂 {comment.upvotes}
          </button>
          <button
            type="button"
            className="chip chip-report"
            onClick={() => onReport({ commentId: comment.id })}
            disabled={disabled || !user}
          >
            🛡️ Signaler
          </button>
        </div>
      </div>
    </li>
  );
}

function PostCard({ post, user, onPostUpdated, onPostDeleted, onStatusChange, onOpenProfile }: PostCardProps) {
  const [commentDraft, setCommentDraft] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [pending, setPending] = useState(false);

  const isOwner = user?.id === post.author.id;
  const isAdmin = user?.role === 'admin';

  const handleReaction = async (reactionKey: string) => {
    if (!user) {
      onStatusChange('Connecte-toi pour réagir.');
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      const { post: updated } = await reactToPost(post.id, reactionKey);
      onPostUpdated(updated);
    } finally {
      setPending(false);
    }
  };

  const handleComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body) return;
    if (pending) return;
    setPending(true);
    try {
      const { post: updated } = await addComment(post.id, body);
      setCommentDraft('');
      onPostUpdated(updated);
      if (post.locked && !post.unlocked) {
        onStatusChange('Vanne publiée: contenu verrouillé débloqué.');
      }
    } catch {
      onStatusChange('Vanne refusée. Vérifie le contenu.');
    } finally {
      setPending(false);
    }
  };

  const handleReportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportTarget) return;
    const form = event.currentTarget;
    const reason = new FormData(form).get('reason');
    if (typeof reason !== 'string' || !reason) return;
    if (pending) return;
    setPending(true);
    try {
      await reportContent({ ...reportTarget, reason });
      setReportTarget(null);
      onStatusChange('Signalement envoyé à la modération.');
    } catch {
      onStatusChange('Signalement impossible pour le moment.');
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (pending) return;
    setPending(true);
    try {
      await deletePost(post.id);
      onPostDeleted(post.id);
    } catch {
      onStatusChange('Suppression impossible.');
    } finally {
      setPending(false);
    }
  };

  const applyUpvote = (commentId: string) => {
    onPostUpdated({
      ...post,
      comments: post.comments.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              upvotes: comment.myUpvote ? comment.upvotes - 1 : comment.upvotes + 1,
              myUpvote: !comment.myUpvote,
            }
          : comment,
      ),
    });
  };

  return (
    <article className="post-card">
      <div className="post-cover" aria-hidden="true">
        <span>{post.author.avatar}</span>
      </div>
      <div className="post-body">
        <div className="creator-row">
          <div className="avatar">{post.author.avatar}</div>
          <div>
            <button type="button" className="link-author" onClick={() => onOpenProfile(post.author.handle)}>
              {post.author.handle}
            </button>
            <p>
              {categoryEmoji(post.category)} {categoryLabel(post.category)} · {formatAge(post.createdAt)}
            </p>
          </div>
          <span className={`tier${post.locked ? ' tier-locked' : ''}`}>
            {post.locked ? '🔒 Verrouillé' : 'Publication consentie'}
          </span>
        </div>

        <div className="post-content">
          {post.hidden && <span className="badge badge-admin">masqué (visible modérateur)</span>}
          <h3>{post.title}</h3>

          {post.locked && !post.unlocked ? (
            <div className="locked-box">
              <p>🔒 Contenu verrouillé: publie une vanne pour le débloquer.</p>
            </div>
          ) : (
            <>
              {post.imageUrl && (
                <img className="post-image" src={post.imageUrl} alt={`Contenu de ${post.title}`} />
              )}
              <p>{post.body}</p>
            </>
          )}

          {post.limits && (
            <p className="limits-note">Limites fixées par la cible: {post.limits}</p>
          )}
        </div>

        <div className="reaction-row" aria-label={`Réactions pour ${post.title}`}>
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.key}
              type="button"
              className={post.myReaction === reaction.key ? 'chip-active' : ''}
              onClick={() => void handleReaction(reaction.key)}
              disabled={pending}
              aria-label={`${reaction.label}: ${post.reactions[reaction.key]} réactions`}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
              <span>{reaction.label}</span>
              <strong>{post.reactions[reaction.key]}</strong>
            </button>
          ))}
          <button
            type="button"
            className="chip chip-report"
            onClick={() => setReportTarget({ postId: post.id })}
            disabled={!user}
          >
            🛡️ Signaler
          </button>
          {(isOwner || isAdmin) && (
            <button type="button" className="chip chip-delete" onClick={() => void handleDelete()} disabled={pending}>
              🗑️ {isAdmin && !isOwner ? 'Supprimer (admin)' : 'Supprimer'}
            </button>
          )}
        </div>

        {reportTarget && (
          <form className="report-form" onSubmit={handleReportSubmit}>
            <label>
              Motif du signalement
              <select name="reason" defaultValue="hors-charte">
                {REPORT_REASONS.map((reason) => (
                  <option key={reason.key} value={reason.key}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="report-actions">
              <button className="button button-primary" type="submit">
                Envoyer
              </button>
              <button type="button" className="button button-secondary" onClick={() => setReportTarget(null)}>
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="comments">
          <h4>Vannes ({post.comments.length})</h4>
          {post.comments.length === 0 ? (
            <p className="empty-state">Aucune vanne. La salle attend.</p>
          ) : (
            <ul className="comment-list">
              {post.comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  user={user}
                  onUpvote={applyUpvote}
                  onReport={setReportTarget}
                  onOpenProfile={onOpenProfile}
                  disabled={pending}
                />
              ))}
            </ul>
          )}

          {user ? (
            <form className="comment-form" onSubmit={handleComment}>
              <input
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Lâche ta vanne (280 caractères)..."
                maxLength={280}
                aria-label="Nouvelle vanne"
              />
              <button className="button button-primary" type="submit" disabled={pending || !commentDraft.trim()}>
                Vanne
              </button>
            </form>
          ) : (
            <p className="empty-state">Connecte-toi pour lancer une vanne.</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default PostCard;
