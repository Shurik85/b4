# B4

![GitHub Release](https://img.shields.io/github/v/release/daniellavrushin/b4)
![GitHub Downloads](https://img.shields.io/github/downloads/daniellavrushin/b4/total)

[[English](readme.md)] [[telegram](https://t.me/byebyebigbro)]

Процессор сетевых пакетов для обхода систем глубокой инспекции пакетов (DPI) с помощью манипуляции очередью netfilter.

<img width="1187" height="787" alt="image" src="https://github.com/user-attachments/assets/3e4c105d-5b28-4e93-ab54-6d92338b1293" />

## Требования

- Linux-система (десктоп, сервер или роутер)
- Root-доступ (sudo)

Это всё. Установщик позаботится об остальном.

## Установка

> [!NOTE]
> В некоторых системах необходимо запускать `sudo b4install.sh`.

Через wget:

```bash
wget -qO- https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh
```

Через curl:

```bash
curl -fsSL https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh
```

Если что-то пошло не так, попробуйте запустить с флагом `--sysinfo` — это выполнит диагностику системы:

```bash
curl -fsSL https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh -s -- --sysinfo
```

Или передайте `--help` для получения дополнительной информации о доступных опциях:

```bash
curl -fsSL https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh -s -- --help
```

Удалить B4:

```bash
curl -fsSL https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh -s -- --remove
```

### Опции установщика

```bash
# Установить последнюю версию b4
./install.sh

# Показать справку
./install.sh -h

# Показать диагностику системы и статус b4
./install.sh --sysinfo

# Установить определённую версию
./install.sh v1.10.0

# Тихий режим (подавляет вывод, кроме ошибок)
./install.sh --quiet

# Указать источник и путь назначения geosite.dat
./install.sh --geosite-src=--geosite-src=https://example.com/geosite.dat --geosite-dst=/opt/etc/b4

# Обновить b4 до последней версии
./install.sh --update

# Удалить b4
./install.sh --remove
```

### Сборка из исходников

```bash
git clone https://github.com/daniellavrushin/b4.git
cd b4

# Собрать UI
cd src/http/ui
pnpm install && pnpm build
cd ../../..

# Собрать бинарник
make build

# Все архитектуры
make build-all

# Или собрать для конкретной
make linux-amd64
make linux-arm64
make linux-armv7
````

## Docker

### Быстрый старт

```bash
docker run --network host \
  --cap-add NET_ADMIN --cap-add NET_RAW --cap-add SYS_MODULE \
  -v /etc/b4:/etc/b4 \
  lavrushin/b4:latest --config /opt/etc/b4/b4.json
```

Веб-интерфейс: <http://localhost:7000>

### Docker Compose

```yaml
services:
  b4:
    image: lavrushin/b4:latest
    container_name: b4
    network_mode: host
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_MODULE
    volumes:
      - ./config:/etc/b4
    command: ["--config", "/etc/b4/b4.json"]
    restart: unless-stopped
```

### Требования для Docker

- **Только Linux-хост** — b4 использует netfilter queue (NFQUEUE), что является функцией ядра Linux
- `--network host` обязателен — b4 должен иметь прямой доступ к сетевому стеку хоста
- Capabilities: `NET_ADMIN` (правила файрвола), `NET_RAW` (raw-сокеты), `SYS_MODULE` (загрузка модулей ядра)
- Ядро хоста должно поддерживать `nfqueue` (модули `xt_NFQUEUE`, `nf_conntrack`)

## Использование

### Запуск B4

```bash

# Стандартный Linux (systemd)
sudo systemctl start b4
sudo systemctl enable b4 # Запуск при загрузке

# OpenWRT
/etc/init.d/b4 restart # start | stop

# Entware/MerlinWRT
/opt/etc/init.d/S99b4 restart # start | stop
```

### Веб-интерфейс

```text
http://ip-вашего-устройства:7000
```

### Командная строка

```bash

# Справка
b4 --help

# Базовое использование — указание доменов вручную
b4 --sni-domains youtube.com,netflix.com

# С категориями geosite
b4 --geosite /etc/b4/geosite.dat --geosite-categories youtube,netflix

# Пользовательский конфиг
b4 --config /path/to/config.json
```

## Веб-интерфейс

Веб-интерфейс доступен по адресу `http://ip-устройства:7000` (порт по умолчанию, можно изменить в файле `config`).

**Возможности:**

- Метрики в реальном времени (соединения, пакеты, пропускная способность)
- Потоковая передача логов с фильтрацией и горячими клавишами (p — приостановить, del — очистить)
- Управление доменами/IP на лету (добавление домена или IP в набор через вкладку Domains)
- Быстрые тесты доменов и автоподбор стратегий обхода
- Интеграция ipinfo.io API для сканирования ASN
- Захват пользовательских payload для faking

## Поддержка HTTPS/TLS

Включить HTTPS для веб-интерфейса можно в Web UI: **Settings > Network Configuration > Web Server** (поля TLS Certificate / TLS Key), или через конфиг:

```json
{
  "system": {
    "web_server": {
      "tls_cert": "/path/to/server.crt",
      "tls_key": "/path/to/server.key"
    }
  }
}
```

Установщик автоматически обнаруживает сертификаты на **OpenWrt** (uhttpd) и **Asus Merlin** и включает HTTPS в конфиге.

## SOCKS5 прокси

B4 включает встроенный SOCKS5 прокси-сервер. Приложения с поддержкой SOCKS5 (браузеры, curl, торрент-клиенты и т.д.) могут направлять трафик через B4 без системной настройки.

Включите в Web UI: **Settings > Network Configuration > SOCKS5 Server**, или через конфиг:

```json
{
  "system": {
    "socks5": {
      "enabled": true,
      "port": 1080,
      "bind_address": "0.0.0.0",
      "username": "",
      "password": ""
    }
  }
}
```

Оставьте `username` и `password` пустыми для работы без аутентификации.

**Примеры:**

```bash
# curl
curl --socks5 127.0.0.1:1080 https://example.com

# Firefox: Настройки > Параметры сети > Ручная настройка прокси
# Узел SOCKS: 127.0.0.1, Порт: 1080, SOCKS v5

# Git
git config --global http.proxy socks5://127.0.0.1:1080
```

> [!NOTE]
> Перезапустите B4 после изменения настроек SOCKS5.

## Интеграция Geosite

B4 поддерживает файлы [`geosite.dat` от v2ray/xray](https://github.com/v2fly/domain-list-community) из различных источников:

```bash
# Loyalsoldier
wget https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat

# RUNET Freedom
wget https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/geosite.dat

# Nidelon
wget https://github.com/Nidelon/ru-block-v2ray-rules/releases/latest/download/geosite.dat
```

Поместите файл в `/etc/b4/geosite.dat` и настройте категории:

```bash
sudo b4 --geosite /etc/b4/geosite.dat --geosite-categories youtube,netflix,facebook
```

> [!TIP]
> Все эти настройки можно настроить через веб-интерфейс.

## Участие в разработке

Вклад в проект принимается через pull request на GitHub.

## Благодарности

Основано на исследованиях:

- [youtubeUnblock](https://github.com/Waujito/youtubeUnblock) — обход DPI на C
- [GoodbyeDPI](https://github.com/ValdikSS/GoodbyeDPI) — обход DPI для Windows
- [zapret](https://github.com/bol-van/zapret) — продвинутые техники обхода DPI
- [dpi-detector](https://github.com/Runnin4ik/dpi-detector) — техники обнаружения DPI/ТСПУ

## Лицензия

Этот проект предоставляется в образовательных целях. Пользователи несут ответственность за соблюдение применимых законов и правил.
Авторы не несут ответственности за неправомерное использование данного программного обеспечения.
