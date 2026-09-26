import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Post, User } from './types';
import { CATEGORIES } from './constants';
import { clearToken, fetchMe, fetchPosts, logout, setToken } from './api';
import AuthPanel from './components/AuthPanel';
import Composer from './components/Composer';
import PostCard from './components/PostCard';
import CharterView from './views/CharterView';
import ModerationView from './views/ModerationView';
import ProfileView from './views/ProfileView';

type View = 'feed' | 'charter' | 'profile' | 'moderation';

const FEED_ERROR = 'Impossible de charger le feed. Vérifie le serveur OnlyHate.';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>('feed');
  const [profileHandle, setProfileHandle] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<'recent' | 'top'>('recent');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let isCurrent = true;
    fetchMe()
      .then(({ user: me }) => {
        if (isCurrent) setUser(me);
      })
      .catch(() => {
        clearToken();
      })
      .finally(() => {
        if (isCurrent) setAuthChecked(true);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setFeedLoading(true);
    fetchPosts(category === 'all' ? null : category, sort)
      .then(({ posts: items }) => {
        if (isCurrent) {
          setPosts(items);
          setStatus((current) => (current === FEED_ERROR ? '' : current));
        }
      })
      .catch(() => {
        if (isCurrent) setStatus(FEED_ERROR);
      })
      .finally(() => {
        if (isCurrent) setFeedLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [category, sort, user]);

  const totalReactions = useMemo(
    () =>
      posts.reduce(
        (sum, post) =>
          sum + Object.values(post.reactions).reduce((postSum, count) => postSum + count, 0),
        0,
      ),
    [posts],
  );

  const openProfile = useCallback((handle: string) => {
    setProfileHandle(handle);
    setView('profile');
  }, []);

  const handleAuthed = (authUser: User, token: string) => {
    setToken(token);
    setUser(authUser);
    setStatus(`Bienvenue ${authUser.handle}. Le tribunal t’attend.`);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // session possiblement déjà expirée
    }
    clearToken();
    setUser(null);
    setView('feed');
    setStatus('Déconnecté. Reste honorable.');
  };

  const replacePost = (updated: Post) => {
    setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)));
  };

  const removePost = (postId: string) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  };

  const prependPost = (created: Post) => {
    setPosts((current) => [created, ...current]);
  };

  const navItems: { label: string; target: View | 'logout' | 'own-profile' }[] = [
    { label: 'Feed', target: 'feed' },
    { label: 'Charte', target: 'charter' },
    ...(user ? [{ label: 'Mon profil', target: 'own-profile' as const }] : []),
    ...(user?.role === 'admin' ? [{ label: 'Modération', target: 'moderation' as const }] : []),
  ];

  const handleNav = (target: View | 'logout' | 'own-profile') => {
    if (target === 'logout') {
      void handleLogout();
      return;
    }
    if (target === 'own-profile') {
      openProfile(user!.handle);
      return;
    }
    setView(target);
  };

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Navigation principale">
        <a className="brand" href="#top" aria-label="OnlyHate accueil">
          <span className="brand-mark">OH</span>
          <span>OnlyHate</span>
        </a>
        <div className="nav-actions" aria-label="Actions">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-link${view === item.target ? ' nav-active' : ''}`}
              onClick={() => handleNav(item.target)}
            >
              {item.label}
            </button>
          ))}
          {user ? (
            <button type="button" className="nav-link" onClick={() => handleNav('logout')}>
              {user.avatar} Déconnexion
            </button>
          ) : (
            <button type="button" className="button button-ghost" onClick={() => setView('feed')}>
              Rejoindre
            </button>
          )}
        </div>
      </nav>

      {status && (
        <p className="status-banner" role="status">
          {status}
          <button type="button" onClick={() => setStatus('')} aria-label="Fermer le message">
            ×
          </button>
        </p>
      )}

      {view === 'charter' && <CharterView />}

      {view === 'profile' && (
        <ProfileView
          handle={profileHandle}
          user={user}
          onOpenProfile={openProfile}
          onStatusChange={setStatus}
        />
      )}

      {view === 'moderation' && user?.role === 'admin' && (
        <ModerationView onStatusChange={setStatus} />
      )}

      {view === 'feed' && (
        <>
          <section className="hero" id="top">
            <div className="hero-copy">
              <p className="eyebrow">Plateforme satirique · roasts consentis</p>
              <h1>Le réseau où l’on vient se faire chambrer, pas se faire haïr.</h1>
              <p className="hero-text">
                Publie tes fails, fixe tes limites, laisse la salle juger. La règle: méchant avec
                le post, jamais avec la personne.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#publish">
                  Ouvrir le confessionnal
                </a>
                <a className="button button-secondary" href="#feed-list">
                  Voir les roasts
                </a>
              </div>
            </div>

            <aside className="hero-panel" aria-label="Aperçu live">
              <div className="panel-header">
                <span>Live hate-o-meter</span>
                <strong>{totalReactions.toLocaleString('fr-FR')}</strong>
              </div>
              <div className="meter" aria-hidden="true">
                <span />
              </div>
              <div className="featured-card">
                <span className="badge">Top roast</span>
                <h2>“Ton logo respire la réunion Teams non préparée.”</h2>
                <p>Validé par la cible · 92% drôle · 0% haine réelle</p>
              </div>
            </aside>
          </section>

          <section className="layout-grid">
            <aside className="rules-card" id="rules">
              <p className="eyebrow">Charte anti-dérapage</p>
              <h2>Moquerie cadrée, modération native.</h2>
              <ul>
                <li>Roast sur le contenu, jamais sur l’identité.</li>
                <li>Consentement visible avant publication.</li>
                <li>Signalement confidentiel 🛡️ avec motif.</li>
              </ul>
              <button type="button" className="button button-secondary" onClick={() => setView('charter')}>
                Lire la charte complète
              </button>
            </aside>

            {authChecked && (user ? (
              <Composer user={user} onCreated={prependPost} onStatusChange={setStatus} />
            ) : (
              <AuthPanel onAuthed={handleAuthed} onStatusChange={setStatus} />
            ))}
          </section>

          <section className="feed-section" id="feed-list">
            <div className="feed-controls">
              <p className="eyebrow">Feed premium</p>
              <div className="chip-row" role="group" aria-label="Filtrer par catégorie">
                <button
                  type="button"
                  className={`chip${category === 'all' ? ' chip-active' : ''}`}
                  onClick={() => setCategory('all')}
                >
                  Tout
                </button>
                {CATEGORIES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`chip${category === item.key ? ' chip-active' : ''}`}
                    onClick={() => setCategory(item.key)}
                  >
                    {item.emoji} {item.label}
                  </button>
                ))}
              </div>
              <label className="sort-row">
                Tri
                <select value={sort} onChange={(event) => setSort(event.target.value === 'top' ? 'top' : 'recent')}>
                  <option value="recent">Récents</option>
                  <option value="top">Top roasts</option>
                </select>
              </label>
            </div>

            {feedLoading ? (
              <p className="empty-state">Chargement du tribunal...</p>
            ) : posts.length === 0 ? (
              <p className="empty-state">Aucun contenu dans cette catégorie. Le tribunal s’ennuie.</p>
            ) : (
              <div className="feed-grid">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    user={user}
                    onPostUpdated={replacePost}
                    onPostDeleted={removePost}
                    onStatusChange={setStatus}
                    onOpenProfile={openProfile}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default App;
