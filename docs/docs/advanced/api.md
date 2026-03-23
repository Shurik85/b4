---
sidebar_position: 3
title: API
---

# API

b4 предоставляет REST API для управления всеми аспектами конфигурации и мониторинга. Веб-интерфейс использует этот же API.

## Swagger UI

Для просмотра документации API включите Swagger в конфигурации:

В файле `b4.json`:

```json
{
  "system": {
    "web_server": {
      "swagger": true
    }
  }
}
```

После перезапуска Swagger UI доступен по адресу:

```text
http://<IP>:7000/swagger/
```

:::info
Swagger UI показывает все доступные эндпоинты, параметры запросов, форматы ответов и позволяет отправлять тестовые запросы прямо из браузера.
:::

## Основные группы эндпоинтов

| Группа | Базовый путь | Описание |
| --- | --- | --- |
| Config | `/api/config` | Чтение и сохранение системной конфигурации |
| Sets | `/api/sets` | CRUD-операции с сетами |
| Geodat | `/api/geodat` | Управление GeoSite/GeoIP базами |
| Discovery | `/api/discovery` | Запуск и управление дискавери |
| Detector | `/api/detector` | Запуск DPI-детектора |
| Connections | `/api/ws/logs` | WebSocket — поток соединений и логов |
| Metrics | `/api/ws/metrics` | WebSocket — метрики в реальном времени |
| Devices | `/api/devices` | Управление устройствами и алиасами |
| Capture | `/api/capture` | Генерация и управление TLS-пэйлоадами |
| Auth | `/api/auth/login` | Авторизация |
| Backup | `/api/backup` | Скачивание и восстановление конфигурации |
| Integration | `/api/integration` | RIPE, IPInfo и другие внешние сервисы |
| MTProto | `/api/mtproto` | Генерация секрета MTProto |
| SOCKS5 | `/api/socks5` | Конфигурация SOCKS5 |

## Авторизация

Если в настройках задан логин и пароль, API требует авторизацию. Получите токен через:

```bash
curl -X POST http://localhost:7000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

Используйте полученный токен в заголовке:

```bash
curl http://localhost:7000/api/config \
  -H "Authorization: Bearer <token>"
```

## WebSocket

Два WebSocket-эндпоинта обеспечивают данные в реальном времени:

- `/api/ws/logs` — поток логов и соединений (используется страницами Соединения и Логи)
- `/api/ws/metrics` — метрики системы (используется Дашбордом)
