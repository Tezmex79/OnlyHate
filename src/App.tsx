import { useCallback, useEffect, useState } from 'react';
import type { CommunityStats, Post, ReactionKey, User } from './types';
import { CATEGORIES, REACTIONS, categoryEmoji, categoryLabel, formatAge } from './constants';
import { clearToken, fetchMe, fetchPosts, fetchStats, logout, setToken } from './api';
import AuthPanel from './components/AuthPanel';
import Composer from './components/Composer';
import PostCard from './components/PostCard';
import CharterView from './views/CharterView';
import ModerationView from './views/ModerationView';
import ProfileView from './views/ProfileView';

type View = 'home' | 'feed' | 'auth' | 'charter' | 'profile' | 'moderation';

const FEED_ERROR = 'Impossible de charger le feed. Vérifie le serveur OnlyHate.';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>('home');
  const [profileHandle, setProfileHandle] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<'recent' | 'top'>('recent');
  const [status, setStatus] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [composerOpen, setComposerOpen] = useState(false);

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

  useEffect(() => {
    let isCurrent = true;
    fetchStats()
      .then(({ stats: next }) => {
        if (isCurrent) setStats(next);
      })
      .catch(() => {
        // Panneau décoratif : on garde les zéros plutôt qu'une bannière d'erreur.
      });
    return () => {
      isCurrent = false;
    };
  }, [user]);

  const openProfile = useCallback((handle: string) => {
    setProfileHandle(handle);
    setView('profile');
  }, []);

  const openAuth = useCallback((mode: 'login' | 'register') => {
    setAuthMode(mode);
    setView('auth');
  }, []);

  const handleAuthed = (authUser: User, token: string) => {
    setToken(token);
    setUser(authUser);
    setStatus(`Bienvenue ${authUser.handle}. Le tribunal t’attend.`);
    setView('home');
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // session possiblement déjà expirée
    }
    clearToken();
    setUser(null);
    setView('home');
    setStatus('Déconnecté. Reste honorable.');
  };

  const replacePost = (updated: Post) => {
    const previous = posts.find((post) => post.id === updated.id);
    setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)));
    if (!previous) return;
    setStats((current) => {
      if (!current) return current;
      const reactionSplit = { ...current.reactionSplit };
      let delta = 0;
      (Object.keys(reactionSplit) as ReactionKey[]).forEach((key) => {
        const diff = updated.reactions[key] - previous.reactions[key];
        reactionSplit[key] += diff;
        delta += diff;
      });
      return { ...current, reactions: current.reactions + delta, reactionSplit };
    });
  };

  const removePost = (postId: string) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
    setStats((current) => (current ? { ...current, posts: Math.max(0, current.posts - 1) } : current));
  };

  const prependPost = (created: Post) => {
    setPosts((current) => [created, ...current]);
    setStats((current) => (current ? { ...current, posts: current.posts + 1 } : current));
  };

  const prependPostIfVisible = (created: Post) => {
    setPosts((current) =>
      category === 'all' || created.category === category ? [created, ...current] : current,
    );
    setStats((current) => (current ? { ...current, posts: current.posts + 1 } : current));
  };

  const navItems: { label: string; target: View | 'logout' | 'own-profile' }[] = [
    { label: 'Accueil', target: 'home' },
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
        <a
          className="brand"
          href="#top"
          aria-label="OnlyHate accueil"
          onClick={(event) => {
            if (view !== 'home') {
              event.preventDefault();
              setView('home');
            }
          }}
        >
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
            <>
              <button type="button" className="nav-link" onClick={() => openAuth('login')}>
                Connexion
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => openAuth('register')}
              >
                Créer un compte
              </button>
            </>
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

      {view === 'home' && (
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
                <a
                  className="button button-primary"
                  href="#publish"
                  onClick={(event) => {
                    if (!user) {
                      event.preventDefault();
                      openAuth('register');
                    }
                  }}
                >
                  Ouvrir le confessionnal
                </a>
                <button type="button" className="button button-secondary" onClick={() => setView('feed')}>
                  Voir les roasts
                </button>
              </div>
            </div>

            <aside className="hero-panel" aria-label="Aperçu live">
              <div className="panel-header">
                <span>Live hate-o-meter</span>
                <strong>{(stats?.reactions ?? 0).toLocaleString('fr-FR')}</strong>
              </div>
              <div className="panel-stats">
                <div>
                  <strong>{(stats?.users ?? 0).toLocaleString('fr-FR')}</strong>
                  <span>membres</span>
                </div>
                <div>
                  <strong>{(stats?.posts ?? 0).toLocaleString('fr-FR')}</strong>
                  <span>fails</span>
                </div>
                <div>
                  <strong>{(stats?.comments ?? 0).toLocaleString('fr-FR')}</strong>
                  <span>commentaires</span>
                </div>
              </div>
              <div className="meter" aria-hidden="true">
                {REACTIONS.map(({ key }) => (
                  <span
                    key={key}
                    className={`meter-seg meter-seg-${key}`}
                    style={{
                      width:
                        stats && stats.reactions > 0
                          ? `${(stats.reactionSplit[key] / stats.reactions) * 100}%`
                          : '0%',
                    }}
                  />
                ))}
              </div>
              <p className="meter-legend">
                {REACTIONS.map(({ key, emoji }, index) => (
                  <span key={key}>
                    {index > 0 && ' · '}
                    {emoji} {(stats?.reactionSplit[key] ?? 0).toLocaleString('fr-FR')}
                  </span>
                ))}
              </p>
              <div className="featured-card">
                <span className="badge">Top roast</span>
                {stats?.topRoast ? (
                  <>
                    <h2>“{stats.topRoast.title}”</h2>
                    <p>
                      <button
                        type="button"
                        className="link-author"
                        onClick={() => openProfile(stats!.topRoast!.author.handle)}
                      >
                        {stats.topRoast.author.handle}
                      </button>
                      {' · '}
                      {categoryEmoji(stats.topRoast.category)} {categoryLabel(stats.topRoast.category)} ·{' '}
                      il y a {formatAge(stats.topRoast.createdAt)} · {stats.topRoast.totalReactions}{' '}
                      réaction{stats.topRoast.totalReactions > 1 ? 's' : ''}
                    </p>
                  </>
                ) : (
                  <h2>Pas encore de roast. Ouvre le confessionnal.</h2>
                )}
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
              <div className="publish-card">
                <p className="eyebrow">Rejoindre le tribunal</p>
                <h2>Connecte-toi pour publier ton fail.</h2>
                <p className="hero-text">
                  Crée ton compte, fixe tes limites et laisse la salle juger.
                </p>
                <div className="hero-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => openAuth('register')}
                  >
                    Créer un compte
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => openAuth('login')}
                  >
                    Connexion
                  </button>
                </div>
                <p className="consent-note">
                  Le premier compte créé devient modérateur de la plateforme.
                </p>
              </div>
            ))}
          </section>
        </>
      )}

      {view === 'feed' && (
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
            <div className="sort-row" role="group" aria-label="Trier le feed">
              <span>Tri</span>
              <button
                type="button"
                className={`chip${sort === 'recent' ? ' chip-active' : ''}`}
                onClick={() => setSort('recent')}
              >
                Récents
              </button>
              <button
                type="button"
                className={`chip${sort === 'top' ? ' chip-active' : ''}`}
                onClick={() => setSort('top')}
              >
                Top roasts
              </button>
            </div>
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
      )}

      {view === 'feed' && user && (
        <button
          type="button"
          className="fab"
          onClick={() => setComposerOpen(true)}
        >
          <span className="fab-plus" aria-hidden="true">
            +
          </span>
          Nouveau post
        </button>
      )}

      {view === 'feed' && user && composerOpen && (
        <div className="composer-overlay">
          <section className="composer-float" role="dialog" aria-label="Créer un post">
            <button
              type="button"
              className="composer-close"
              aria-label="Fermer le formulaire"
              onClick={() => setComposerOpen(false)}
            >
              ×
            </button>
            <Composer
              user={user}
              onCreated={(created) => {
                prependPostIfVisible(created);
                setComposerOpen(false);
              }}
              onStatusChange={setStatus}
            />
          </section>
        </div>
      )}

      {view === 'auth' && (
        <section className="auth-view">
          <AuthPanel
            mode={authMode}
            onModeChange={setAuthMode}
            onAuthed={handleAuthed}
            onStatusChange={setStatus}
          />
        </section>
      )}
    </main>
  );
}

export default App;
