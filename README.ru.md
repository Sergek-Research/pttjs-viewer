<p align="right">
  <a href="README.ru.md">🇷🇺 Русский</a> |
  <a href="README.md">🇬🇧 English</a>
</p>

# Obsidian PTTJS Viewer

Плагин для визуализации таблиц PTTJS (Plain Text Table JavaScript) в [Obsidian](https://obsidian.md).

## Использование

![Демонстрация PTTJS](assets/demo.gif)

Создайте блок кода с языком `pttjs` и добавьте туда ваши данные в формате PTTJS:

````markdown
```pttjs
|PTTJS 1.0|encoding=UTF-8|
|H>Имя|H>Возраст|H>Профессия<|
|>Иван|>30|>Программист<|
|>Мария|>28|>Дизайнер<|
|>Алексей|>35|>Менеджер<|
```
````

## Ручная установка

### Из репозитория

1. Клонируйте этот репозиторий в папку `.obsidian/plugins/pttjs-viewer` вашего хранилища Obsidian
2. Установите зависимости: `npm install`
3. Соберите плагин: `npm run build`
4. Перезапустите Obsidian
5. Включите плагин в настройках Obsidian

## Разработка

- `npm run dev` - запуск режима разработки с автоматической пересборкой
- `npm run build` - сборка для production
- `npm version patch` - обновление версии

## Лицензия

[MIT](LICENSE)
