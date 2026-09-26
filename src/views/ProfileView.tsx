import { useEffect, useState } from 'react';
import type { Post, Profile, User } from '../types';
import { BADGES } from '../constants';
import { fetchProfile } from '../api';
import PostCard from '../components/PostCard';

type ProfileViewProps = {
  handle: string;
  user: User | null;
  onOpenProfile: (handle: string) => void;
  onStatusChange: (status: string) => void;
};

function ProfileView({ handle, user, onOpenProfile, onStatusChange }: ProfileViewProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    fetchProfile(handle.replace(/^@/, ''))
      .then((data) => {
        if (isCurrent) setProfile(data);
      })
      .catch(() => {
        if (isCurrent) onStatusChange('Profil introuvable.');
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [handle, user, onStatusChange]);

  if (loading) {
    return <p className="empty-state">Chargement du profil...</p>;
  }
  if (!profile) {
    return <p className="empty-state">Profil introuvable.</p>;
  }

  const earnedBadges = BADGES.filter((badge) => profile.stats.roastsReceived >= badge.min);

  const replacePost = (updated: Post) => {
    setProfile({
      ...profile,
      posts: profile.posts.map((post) => (post.id === updated.id ? updated : post)),
    });
  };

  const removePost = (postId: string) => {
    setProfile({
      ...profile,
      posts: profile.posts.filter((post) => post.id !== postId),
      stats: { ...profile.stats, posts: Math.max(0, profile.stats.posts - 1) },
    });
  };

  return (
    <section className="page-card">
      <div className="profile-head">
        <div className="avatar avatar-big">{profile.user.avatar}</div>
        <div>
          <h1 className="page-title">{profile.user.handle}</h1>
          <p className="hero-text">
            {profile.stats.posts} posts · {profile.stats.comments} vannes ·{' '}
            {profile.stats.roastsReceived} roasts reçus · {profile.stats.koGiven} K.O. donnés
          </p>
          {profile.user.role === 'admin' && <span className="badge badge-admin">modérateur</span>}
        </div>
      </div>

      <div className="badges-row">
        <h3>Badges ({earnedBadges.length}/{BADGES.length})</h3>
        <div className="badge-grid">
          {earnedBadges.map((badge) => (
            <span key={badge.label} className="badge-item">
              <span aria-hidden="true">{badge.emoji}</span> {badge.label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="section-spacing">Contenus soumis au tribunal</h3>
      {profile.posts.length === 0 ? (
        <p className="empty-state">Aucun contenu pour le moment.</p>
      ) : (
        <div className="feed-grid">
          {profile.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              onPostUpdated={replacePost}
              onPostDeleted={removePost}
              onStatusChange={onStatusChange}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default ProfileView;
