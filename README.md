# Twitch Chat Integration

Porta la chat del tuo canale Twitch dentro la chat di Foundry VTT.

**Nessun token. Nessun server esterno. Nessuna dipendenza.**

## Come funziona

Twitch espone la sua chat via IRC su WebSocket (`wss://irc-ws.chat.twitch.tv:443`) e permette
connessioni **anonime in sola lettura**: basta presentarsi con un nickname nella forma
`justinfan<numero>` e nessuna password. Il modulo apre quella connessione direttamente dal
browser del GM, legge i messaggi e li trasforma in normali `ChatMessage` di Foundry.

Solo il **GM attivo** si connette. È lui a creare i documenti chat, che Foundry replica poi a
tutti i giocatori: così ogni messaggio compare una volta sola e non una per client connesso.

```
Twitch IRC ──wss──▶ browser del GM ──▶ ChatMessage.create() ──▶ tutti i giocatori
```

## Installazione

### Da manifest (dopo la prima release)

Setup → Add-on Modules → Install Module → incolla:

```
https://github.com/PSM90/foundry-twitch-chat-integration/releases/latest/download/module.json
```

### Manuale

1. Copia la cartella `twitch-chat-integration` dentro `Data/modules/` della tua installazione Foundry.
2. Riavvia Foundry (o ricarica la lista moduli).
3. Nel mondo, attiva il modulo in **Gestisci Moduli**.

Percorso tipico su Windows:
`C:\Users\<utente>\AppData\Local\FoundryVTT\Data\modules\twitch-chat-integration`

## Rilasciare una nuova versione

Il workflow `.github/workflows/release.yml` fa tutto da solo: crea un tag `vX.Y.Z`,
pubblica la release su GitHub e la action riscrive `version`/`download` in `module.json`,
crea `module.zip` e allega entrambi alla release.

```bash
git tag v1.0.0
git push origin v1.0.0
# poi pubblica la release dalla UI di GitHub (o con: gh release create v1.0.0 --generate-notes)
```

## Configurazione

Impostazioni → Configura Impostazioni → Twitch Chat Integration:

| Impostazione | Default | Cosa fa |
|---|---|---|
| Canale Twitch | *(vuoto)* | Il nome del canale, senza `#` e senza URL |
| Connessione attiva | off | Apre/chiude il ponte |
| Utenti ignorati | bot comuni | Username i cui messaggi vengono scartati |
| Ignora i comandi | on | Scarta i messaggi che iniziano con `!` |
| Mostra le emote | on | Sostituisce le emote Twitch con le immagini |
| Limite messaggi al minuto | 20 | Anti-flood: oltre questa soglia i messaggi vengono scartati |
| Lunghezza massima messaggio | 300 | Oltre questa soglia il messaggio viene troncato |

## Scheda laterale "Chat Twitch"

Nella barra laterale destra, accanto all'icona della chat, compare una scheda con l'icona di
Twitch che mostra **solo** i messaggi arrivati dalla live. I messaggi restano comunque anche
nella chat principale: la scheda è una vista filtrata sugli stessi `ChatMessage`, visibile a
GM e giocatori. Col tasto destro sull'icona la scheda si stacca in una finestra separata.

## Comando `/twitch`

Solo per il GM:

- `/twitch` o `/twitch status` — mostra lo stato della connessione
- `/twitch connect` — attiva il ponte
- `/twitch disconnect` — chiude il ponte
- `/twitch nomecanale` — cambia canale e connette

## API

```js
const api = game.modules.get("twitch-chat-integration").api;
api.connect("nomecanale");
api.disconnect();
api.client.isConnected;
```

## Sicurezza

Il testo che arriva da Twitch è input non fidato e finisce in `ChatMessage#content`, che Foundry
renderizza come HTML per tutti i giocatori. Per questo:

- ogni messaggio viene **escapato** (`&`, `<`, `>`, `"`, `'`) prima di essere inserito;
- il colore utente è accettato solo se nella forma `#RGB` / `#RRGGBB`;
- gli id delle emote sono validati e URL-encoded prima di costruire l'URL della CDN;
- il markup (corsivo per `/me`, `<img>` per le emote) lo aggiunge solo il modulo, mai l'utente.

## Limiti noti

- Il ponte è **unidirezionale**: i messaggi della partita non vengono inviati su Twitch. Per farlo
  servirebbe un token OAuth di un account bot.
- La connessione vive nel browser del GM: se il GM chiude la scheda, il ponte si chiude.
- Le emote di terze parti (BTTV, FFZ, 7TV) non sono supportate: Twitch non le include nei tag IRC.

## Struttura

```
twitch-chat-integration/
├── module.json
├── README.md
├── lang/
│   ├── en.json
│   └── it.json
├── scripts/
│   ├── module.js         # hook Foundry, settings, creazione ChatMessage
│   ├── streaming-tab.js  # scheda laterale con i soli messaggi della live
│   ├── twitch-client.js  # connessione WebSocket, JOIN, PING/PONG, riconnessione
│   ├── irc.js            # parser IRCv3 (tag, prefix, comando, parametri)
│   └── format.js         # escaping, emote, troncamento
└── styles/
    └── twitch-chat.css
```

## Compatibilità

Foundry VTT v13. Indipendente dal sistema di gioco.
