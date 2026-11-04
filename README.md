# Luna

Luna — десктопный AI-клиент для Windows на Tauri 2, React и TypeScript. Текущая версия `0.1.0` работает как UI-прототип: ответы генерируются локальной имитацией, реальные API-запросы и хранение ключей ещё не подключены.

## Требования

- Windows 10 или 11 с WebView2 Runtime;
- Node.js 22 и npm;
- Rust stable с целевой платформой MSVC;
- Visual Studio Build Tools 2022 с компонентом **Desktop development with C++**.

## Установка

```powershell
git clone <URL-репозитория>
cd Luna
npm ci
```

## Запуск для разработки

Запуск полноценного десктопного приложения с Vite и Tauri:

```powershell
npm run tauri dev
```

Проверки фронтенда:

```powershell
npm run build
npx tsc --noEmit
npm run lint
```

## Сборка установщика

```powershell
npm run tauri build
```

Готовые установщики появятся в `src-tauri/target/release/bundle/`.

## Windows SmartScreen

Сборки ранних версий не подписаны цифровым сертификатом, поэтому Windows SmartScreen может показать предупреждение. Чтобы запустить доверенную сборку, выберите **«Подробнее» → «Выполнить в любом случае»**.

## Выпуск релиза

Workflow `.github/workflows/release.yml` запускается для тегов `v*`, собирает Windows-версию и создаёт черновик GitHub Release.
