# QuizLive — serveur auto-hébergé

Version avec un vrai backend (Node.js + Express + Socket.IO) : la synchronisation en direct
fonctionne partout où vous déployez ce serveur, pas seulement dans Claude.ai.

## Structure

```
quizlive-server/
  server.js       ← serveur (Express + Socket.IO), sert aussi le front-end
  public/
    index.html     ← l'application (hôte + joueur)
  data.json        ← créé automatiquement, stocke vos quiz/scores
  package.json
```

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrez `http://localhost:3000` dans votre navigateur.

⚠️ **Piège classique** : si vous ouvrez `http://localhost:3000` sur DEUX appareils différents
(un PC pour l'hôte, un téléphone pour un joueur), ça ne marchera PAS — "localhost" désigne
toujours l'appareil local de chacun, pas votre serveur. Pour tester sur plusieurs appareils
du même réseau Wi-Fi, utilisez l'adresse IP locale de votre machine, ex. `http://192.168.1.23:3000`
(trouvable avec `ipconfig` sur Windows ou `ifconfig`/`ip a` sur Mac/Linux). Pour un vrai usage
avec des joueurs à distance, déployez le serveur en ligne (voir plus bas) et utilisez cette URL
publique partout, y compris depuis votre propre écran d'hôte.

## Déployer en ligne (gratuit)

N'importe quel hébergeur Node.js fonctionne. Deux options simples :

**Render.com**
1. Créez un compte, "New +" → "Web Service"
2. Connectez ce dossier (via un repo GitHub, ou l'upload direct)
3. Build command : `npm install` — Start command : `npm start`
4. Render vous donne une URL publique (ex. `https://votre-quiz.onrender.com`)

**Railway.app**
1. "New Project" → "Deploy from local folder / GitHub repo"
2. Railway détecte Node.js automatiquement et lance `npm start`
3. Générez un domaine public depuis les réglages du service

Une fois déployé, partagez **la même URL publique** à tous vos joueurs et utilisez-la
vous-même en tant qu'hôte — tout le monde doit passer par cette URL pour être synchronisé.

## Limite de stockage

Les données sont sauvegardées dans `data.json` sur le disque du serveur. C'est largement
suffisant pour un usage classe/petit groupe. Sur certains hébergeurs gratuits, le disque peut
être réinitialisé au redémarrage du service (veille d'inactivité, redéploiement) — si vous
avez besoin de conserver vos quiz sur le très long terme, pensez à migrer vers une vraie base
de données (Postgres, MongoDB, etc.) ou à choisir un hébergeur avec disque persistant.

## "Aucune session trouvée avec ce code."

Ce message n'apparaît que si :
- l'hôte n'a pas encore créé la session (il faut d'abord cliquer "Créer un nouveau quiz" côté hôte,
  *avant* qu'un joueur puisse rejoindre avec ce code), ou
- le code a été mal recopié, ou
- l'hôte et le joueur ne pointent pas vers le même serveur déployé (ex. l'un est sur `localhost`,
  l'autre sur l'URL publique — voir l'avertissement plus haut).
