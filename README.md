# Uč se — procvičování otázek

Responzivní webová aplikace pro procvičování znalostí. Rozhraní je v češtině, odpovědi se vyhodnocují přímo u otázky a pokrok se ukládá v prohlížeči.

## Spuštění

1. Nainstalujte závislosti: `npm install`
2. Spusťte vývojový server: `npm run dev`
3. Otevřete adresu, kterou vypíše Vite.

Kontrola před publikováním: `npm run build` a `npm run lint`.

## Publikování na GitHub Pages

1. Ve VS Code otevřete **Source Control**, inicializujte Git repozitář a zvolte **Publish to GitHub**. Doporučujeme veřejný repozitář.
2. Na GitHubu otevřete **Settings → Pages** a v části **Build and deployment** nastavte zdroj na **GitHub Actions**.
3. V záložce **Actions** počkejte na dokončení úlohy **Deploy to GitHub Pages**. Adresa webu se zobrazí v souhrnu nasazení i v nastavení Pages.

Při každém dalším odeslání změn do větve `main` nebo `master` se web automaticky znovu sestaví a publikuje. Aplikace běží jako statický web na GitHub Pages. Odpovědi se ukládají pouze do místního prohlížeče; nesynchronizují se mezi různými zařízeními.

## Otázky

Přiložená databáze 260 otázek je součástí aplikace a zobrazí se automaticky. Otázky zůstávají v původním anglickém znění; navigace a ovládání jsou česky. Aplikace je rozdělí do tematických částí, například základy ER modelování, vztahy mezi entitami, normalizace a klíče, fyzický model a SQL nebo čas a historie dat.

Otázky s více správnými odpověďmi (například „Choose Two“) lze vyřešit výběrem požadovaného počtu možností. Poté se správné odpovědi zvýrazní zeleně.

Tlačítko „Náhodný test 50 otázek“ spustí samostatný test z náhodně vybraných otázek (u menších sad použije všechny dostupné). Otázky se zobrazují postupně a správnost odpovědí se ukáže až po dokončení testu. Výsledek obsahuje procentuální úspěšnost a seznam chybných otázek se správnými odpověďmi.

Vlastní sadu lze načíst tlačítkem „Načíst JSON“. Podporované jsou kořenová pole i obálky s `questions`, `items`, `results`, `data` nebo `quiz`. Text otázky může být v `question`, `text`, `prompt` nebo `title`; možnosti v `options`, `choices`, `answers` nebo `variants`. Správné možnosti se určují podle `isCorrect: true` / `correct: true`, případně podle indexu nebo hodnoty odpovědi v běžných polích `correctIndex`, `answerIndex`, `correctAnswer`, `answer` a jejich variantách s podtržítkem.

Témata lze zadat přímo v `section`, `category`, `topic`, `subject` nebo `group`. Pokud chybí, aplikace je odhadne podle obsahu otázky.

## Ukládání

Aktuální otázky i odpovědi se ukládají do `localStorage` tohoto prohlížeče. Načtení jiné sady nahradí předchozí a vynuluje pokrok. Tlačítko „Vynulovat pokrok“ smaže pouze uložené odpovědi.
