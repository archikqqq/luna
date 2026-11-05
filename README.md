# Luna

Luna — десктопное приложение для работы с AI-провайдерами в Windows. Оно хранит чаты в локальной SQLite-базе, ключи — в Windows Credential Manager, а ответы получает потоково через OpenAI-compatible API или Anthropic Messages API.

> Скриншот интерфейса будет добавлен после первого подписанного релиза.

## Установка

Скачайте `Luna_0.1.0_x64-setup.exe` из GitHub Release и запустите установщик. Приложение устанавливается для текущего пользователя и не требует прав администратора. Нужен WebView2 Runtime; установщик использует встроенный bootstrapper WebView2.

Сборка не подписана сертификатом. Если Windows SmartScreen покажет предупреждение, выберите **«Подробнее» → «Выполнить в любом случае»**.

## Первый запуск

1. Нажмите **«Добавить провайдера»**.
2. Выберите пресет или **«Свой провайдер»**.
3. Введите API-ключ и сохраните провайдера.
4. Нажмите **«Проверить подключение»**, затем при необходимости **«Обновить модели»**.

Ключи никогда не попадают в SQLite, `localStorage`, логи или сообщения об ошибках.

## Разработка

Требуются Windows 10/11, Node.js 22, Rust stable MSVC и Visual Studio Build Tools с компонентом **Desktop development with C++**.

```powershell
npm ci
npm run tauri dev
```

В браузерном dev-режиме доступен только локальный провайдер Demo для проверки интерфейса. В release-сборке он не включается и сетевых заглушек нет.

## Сборка из исходников

```powershell
npm run build
npx tsc --noEmit
npm run lint
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Установщик NSIS появится в `src-tauri/target/release/bundle/nsis/`.

## Лицензия

Проект распространяется под лицензией MIT. См. [LICENSE](LICENSE).
