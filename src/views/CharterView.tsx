const RULES = [
  {
    title: 'Roast le contenu, jamais la personne',
    detail: 'Les vannes portent sur le post: le code, la recette, la tenue, le pitch. Aucune attaque sur l’identité, l’origine, la religion, le genre, l’orientation ou le handicap.',
  },
  {
    title: 'Consentement explicite',
    detail: 'En publiant, la cible accepte les roasts sur ce contenu et peut fixer des limites par post. Respectez-les.',
  },
  {
    title: 'Zéro doxxing',
    detail: 'Aucune donnée privée: adresse, téléphone, employeur, photos volées. Le signalement « Doxxing » entraîne un masquage immédiat.',
  },
  {
    title: 'Zéro haine réelle',
    detail: 'OnlyHate est une parodie. Les insultes identitaires, menaces et discours de haine sont bloqués à la publication et signalables.',
  },
  {
    title: 'Signalement confidentiel',
    detail: 'Le bouton 🛡️ envoie un rapport aux modérateurs avec motif. Personne d’autre ne voit les signalements.',
  },
  {
    title: 'Modération active',
    detail: 'Les modérateurs peuvent masquer un contenu, écarter un signalement ou bannir un compte qui enfreint la charte.',
  },
];

function CharterView() {
  return (
    <section className="page-card">
      <p className="eyebrow">Charte anti-dérapage</p>
      <h1 className="page-title">Moquerie cadrée, haine réelle dehors.</h1>
      <p className="hero-text">
        OnlyHate reprend les codes premium des plateformes de créateurs pour en faire un tribunal
        satirique. La ligne rouge est simple: tout ce qui vise une personne plutôt qu’un contenu
        sort du jeu.
      </p>
      <ul className="rules-list">
        {RULES.map((rule) => (
          <li key={rule.title}>
            <h3>{rule.title}</h3>
            <p>{rule.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CharterView;
