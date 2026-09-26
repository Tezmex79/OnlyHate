import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import type { Post, User } from '../types';
import { CATEGORIES } from '../constants';
import { createPost, uploadImage } from '../api';

type ComposerProps = {
  user: User;
  onCreated: (post: Post) => void;
  onStatusChange: (status: string) => void;
};

function Composer({ user, onCreated, onStatusChange }: ComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [limits, setLimits] = useState('');
  const [category, setCategory] = useState('libre');
  const [locked, setLocked] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3_000_000) {
      onStatusChange('Image trop lourde (3 Mo max).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !body.trim() || pending) return;

    setPending(true);
    try {
      let imageId: string | null = null;
      if (imagePreview) {
        const uploaded = await uploadImage(imagePreview);
        imageId = uploaded.id;
      }

      const { post } = await createPost({
        title: title.trim(),
        body: body.trim(),
        category,
        limits: limits.trim(),
        locked,
        imageId,
      });

      setTitle('');
      setBody('');
      setLimits('');
      setCategory('libre');
      setLocked(false);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onCreated(post);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      onStatusChange(code.startsWith('forbidden_content') ? 'Publication refusée: contenu hors charte.' : 'Publication refusée. Réessaie.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="publish-card" onSubmit={handleSubmit}>
      <p className="eyebrow">Créer un post · {user.handle}</p>
      <h2>Propose un contenu à roast.</h2>
      <label>
        Titre
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex: mon pitch startup mérite le pilori" maxLength={120} />
      </label>
      <label>
        Catégorie
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.emoji} {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contexte consenti
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Décris ce que les gens peuvent moquer, et ce qui reste hors limites." rows={5} maxLength={520} />
      </label>
      <label>
        Limites de moquerie (optionnel)
        <input value={limits} onChange={(event) => setLimits(event.target.value)} placeholder="Ex: roastez le code, pas l'accent" maxLength={200} />
      </label>
      <label>
        Image (optionnel, 3 Mo max)
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleFile} />
      </label>
      {imagePreview && (
        <div className="image-preview">
          <img src={imagePreview} alt="Aperçu du contenu" />
          <button type="button" className="chip chip-delete" onClick={() => setImagePreview(null)}>
            Retirer
          </button>
        </div>
      )}
      <label className="checkbox-row">
        <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} />
        <span>🔒 Tier verrouillé parodique: le contenu se débloque quand quelqu’un publie une vanne.</span>
      </label>
      <p className="consent-note">En publiant, la cible confirme accepter les roasts sur ce contenu.</p>
      <button className="button button-primary" type="submit" disabled={pending || !title.trim() || !body.trim()}>
        {pending ? 'Publication...' : 'Publier dans le feed'}
      </button>
    </form>
  );
}

export default Composer;
