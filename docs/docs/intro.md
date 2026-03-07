---
sidebar_position: 1
---

# Установка B4

B4 - это модуль для обхода DPI, который работает локально на вашем роутере или любой другой Linux системе.

## Быстрая установка

### Автоматическая установка

Одна команда для большинства систем:

Через wget:

```bash
wget -qO- https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh
```

Через curl:

```bash
curl -fsSL https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh | sh
```

:::tip Совет
На некоторых системах может потребоваться выполнение под sudo

:::

## Установка на OpenWRT

### Подготовка системы

```bash
opkg update
opkg install kmod-nft-queue kmod-nf-conntrack-netlink \
             iptables-mod-nfqueue jq wget-ssl coreutils-nohup
```

:::warning Важно для OpenWRT
Если установка зависает на загрузке, откройте файл `/tmp/b4install.sh` и удалите параметр `--show-progress` из команд wget
:::

### Запуск установщика

```bash
wget -O /tmp/b4install.sh https://raw.githubusercontent.com/DanielLavrushin/b4/main/install.sh
chmod +x /tmp/b4install.sh
/tmp/b4install.sh
```

## Запуск сервиса

### Linux с systemd

```bash
systemctl start b4
systemctl enable b4  # для автозапуска
```

### OpenWRT

```bash
/etc/init.d/b4 start
/etc/init.d/b4 enable  # для автозапуска
```

### Entware/MerlinWRT

```bash
/opt/etc/init.d/S99b4 start
```

## Настройка

### Веб-интерфейс

После запуска сервиса откройте в браузере:

```text
http://IP-вашего-устройства:7000
```

:::info Локальный доступ
Веб-интерфейс доступен только из локальной сети. Замените IP на адрес вашего роутера (обычно 192.168.1.1 или 192.168.0.1)
:::

### Командная строка

Быстрая настройка доменов:

```bash
b4 --sni-domains youtube.com,netflix.com
```

С дополнительными параметрами:

```bash
b4 --queue-num 100 \
   --threads 4 \
   --fake-ttl 8 \
   --web-port 8080
```

## Управление

### Основные команды

```bash
# Проверка системы
~/b4install.sh --sysinfo

# Обновление до последней версии
~/b4install.sh --update

# Полное удаление
~/b4install.sh --remove
```

### Проверка статуса

```bash
# Systemd
systemctl status b4

# OpenWRT
/etc/init.d/b4 status

# Проверка процесса
ps | grep b4
```

## Решение проблем

### Failed to create queue

Загрузите модули ядра:

```bash
# Обычный Linux
modprobe xt_connbytes
modprobe xt_NFQUEUE

# OpenWRT (если modprobe не работает)
insmod xt_connbytes
insmod xt_NFQUEUE
```

:::caution Модули ядра
Некоторые минимальные сборки OpenWRT могут не содержать необходимых модулей. Установите пакеты kmod-\* как показано выше
:::

### Не открывается веб-интерфейс

1. **Проверьте, запущен ли сервис:**

   ```bash
   ps | grep b4
   ```

2. **Проверьте порт:**

   ```bash
   netstat -tulpn | grep 7000
   ```

3. **Посмотрите логи:**

   ```bash
   # Systemd
   journalctl -u b4 -f

   # OpenWRT
   logread | grep b4
   ```

## Дополнительные возможности

### GeoSite данные

Для фильтрации по категориям сайтов:

```bash
# Установщик предложит скачать при первом запуске
# Или вручную:
wget -O /etc/b4/geosite.dat \
  https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat

# Используйте категории
b4 --geosite /etc/b4/geosite.dat --geosite-categories youtube,netflix
```

:::info Источники GeoSite
Доступны разные источники данных:

- **Loyalsoldier** - универсальный
- **RUNET Freedom** - для РФ
- **Nidelon** - альтернативный для РФ
  :::

### Установка конкретной версии

```bash
~/b4install.sh v1.15.0
```

### Тихая установка

Без интерактивных вопросов (автоопределение платформы, загрузка geodata по умолчанию):

```bash
~/b4install.sh --quiet
```

С указанием директорий:

```bash
~/b4install.sh --quiet --bin-dir=/opt/bin --data-dir=/opt/etc/b4
```

## Конфигурационный файл

Конфигурационный файл `json`с создается при старте приложения.
Можно указать его путь параметром `--config=`. Если файл не существует, он будет создан.

:::note Приоритет настроек
Параметры командной строки имеют приоритет над конфигурационным файлом
:::

## Поддерживаемые платформы

- **x86_64** / amd64
- **ARM**: arm64, armv7, armv6, armv5
- **MIPS**: mips, mipsle, mips64, mips64le
- **Другие**: ppc64, ppc64le, riscv64, s390x

:::danger Несовместимые системы
B4 не работает на Windows и macOS. Требуется Linux с поддержкой netfilter
:::
