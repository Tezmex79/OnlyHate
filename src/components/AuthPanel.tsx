import { FormEvent, useState } from 'react';
import type { User } from '../types';
import { login, register } from '../api';

type AuthPanelProps = {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onAuthed: (user: User, token: string) => void;
  onStatusChange: (status: string) => void;
};

const AVATARS = ['😈', '🔥', '🍝', '🧦', '⚽', '💀', '🍳', '🗿'];

function AuthPanel({ mode, onModeChange, onAuthed, onStatusChange }: AuthPanelProps) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result =
        mode === 'register'
          ? await register({ handle: handle.trim(), password, avatar })
          : await login({ handle: handle.trim(), password });
      onAuthed(result.user, result.token);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const messages: Record<string, string> = {
        handle_taken: 'Ce pseudo est déjà pris.',
        invalid_handle: 'Pseudo invalide: 3 à 20 caractères (lettres, chiffres, _).',
        invalid_password: 'Mot de passe: 8 caractères minimum.',
        invalid_credentials: 'Pseudo ou mot de passe incorrect.',
      };
      onStatusChange(messages[code] ?? 'Connexion impossible pour le moment.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="publish-card" onSubmit={handleSubmit}>
      <p className="eyebrow">Rejoindre le tribunal</p>
      <h2>{mode === 'register' ? 'Crée ton compte moqueur.' : 'Retourne te faire chambrer.'}</h2>

      <div className="tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`tab${mode === 'register' ? ' tab-active' : ''}`}
          onClick={() => onModeChange('register')}
        >
          Inscription
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`tab${mode === 'login' ? ' tab-active' : ''}`}
          onClick={() => onModeChange('login')}
        >
          Connexion
        </button>
      </div>

      <label>
        Pseudo
        <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="Ex: poil_de_mythe" maxLength={20} />
      </label>
      <label>
        Mot de passe
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" />
      </label>
      {mode === 'register' && (
        <fieldset className="avatar-picker">
          <legend>Avatar</legend>
          {AVATARS.map((item) => (
            <button
              key={item}
              type="button"
              className={`avatar-option${avatar === item ? ' avatar-selected' : ''}`}
              onClick={() => setAvatar(item)}
              aria-label={`Choisir l'avatar ${item}`}
            >
              {item}
            </button>
          ))}
        </fieldset>
      )}

      <button className="button button-primary" type="submit" disabled={pending || !handle.trim() || !password}>
        {mode === 'register' ? 'Créer le compte' : 'Se connecter'}
      </button>
      <p className="consent-note">Le premier compte créé devient modérateur de la plateforme.</p>
    </form>
  );
}

export default AuthPanel;
