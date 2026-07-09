"""Конфигурация из переменных окружения.

Один и тот же конфиг читают и бот, и веб-бэкенд — у них общая база (источник
истины) и общее хранилище заметок. Локально всё работает без переменных:
база ложится в `data/spend.db` рядом с проектом.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Корень проекта (…/spendtrack-app)
ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """Подхватить переменные из файла `.env` в корне проекта, если он есть.

    Удобно для локального запуска: положил токен и PIN в `.env` — и бот с вебом
    их видят, ничего не экспортируя руками. Уже заданные переменные окружения
    имеют приоритет и не перезаписываются.
    """
    env_path = Path(os.environ.get("SPENDTRACK_ENV", ROOT / ".env"))
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _split_ids(raw: str) -> list[int]:
    out: list[int] = []
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            out.append(int(part))
    return out


@dataclass
class Config:
    # Все поля читают окружение через default_factory — то есть в момент
    # создания Config(), уже ПОСЛЕ _load_dotenv(). Если задать их обычными
    # значениями, дефолт вычислился бы при импорте модуля, до чтения .env.

    # --- общее ---
    db_path: Path = field(default_factory=lambda: Path(
        os.environ.get("SPENDTRACK_DB", ROOT / "data" / "spend.db")))
    # Веб-локальное состояние (бюджеты) — отдельный файл, чтобы «живое»
    # обновление боевой базы не затирало настроенные лимиты.
    web_state_db: Path = field(default_factory=lambda: Path(
        os.environ.get("SPENDTRACK_STATE_DB", ROOT / "data" / "web-state.db")))
    vault_root: Path = field(default_factory=lambda: Path(
        os.environ.get("SPENDTRACK_VAULT", ROOT / "data" / "vault")))
    default_currency: str = field(default_factory=lambda:
        os.environ.get("SPENDTRACK_CURRENCY", "PLN"))

    # --- бот ---
    token: str = field(default_factory=lambda: os.environ.get("SPENDTRACK_TOKEN", ""))
    allowed_ids: list[int] = field(default_factory=lambda: _split_ids(
        os.environ.get("SPENDTRACK_ALLOWED", "")))

    # --- режим ---
    # Многопользовательский режим: вход по коду из Telegram, данные на каждого
    # пользователя свои, Obsidian-выгрузка отключена. Пусто = личный режим (как был).
    multiuser: bool = field(default_factory=lambda:
        os.environ.get("SPENDTRACK_MULTIUSER", "").lower() in ("1", "true", "yes"))
    # @username бота — показываем на экране входа, чтобы получить код.
    bot_username: str = field(default_factory=lambda: os.environ.get("SPENDTRACK_BOT_USERNAME", ""))

    # --- веб ---
    web_host: str = field(default_factory=lambda: os.environ.get("SPENDTRACK_HOST", "127.0.0.1"))
    web_port: int = field(default_factory=lambda: int(os.environ.get("SPENDTRACK_PORT", "8770")))
    # PIN-код для входа в веб (пусто = без авторизации, удобно локально).
    web_pin: str = field(default_factory=lambda: os.environ.get("SPENDTRACK_PIN", ""))
    # Под каким user_id веб создаёт записи и фильтрует выборки.
    # По умолчанию — первый из разрешённых, иначе 0 (одиночный режим).
    web_user_id: int = field(default_factory=lambda: int(os.environ.get("SPENDTRACK_WEB_USER", "0")))

    # --- «живой» режим: подтянуть свежую копию боевой базы по SSH ---
    # SSH-алиас сервера (например mcr). Пусто = кнопка обновления скрыта.
    remote_host: str = field(default_factory=lambda: os.environ.get("SPENDTRACK_REMOTE", ""))
    remote_db: str = field(default_factory=lambda:
        os.environ.get("SPENDTRACK_REMOTE_DB", "/var/lib/spendtrack/spend.db"))

    # --- интеграция с банком через GoCardless Bank Account Data ---
    gocardless_id: str = field(default_factory=lambda: os.environ.get("GOCARDLESS_SECRET_ID", ""))
    gocardless_key: str = field(default_factory=lambda: os.environ.get("GOCARDLESS_SECRET_KEY", ""))
    # На этот адрес банк вернёт пользователя после согласия.
    base_url: str = field(default_factory=lambda:
        os.environ.get("SPENDTRACK_BASE_URL", "http://127.0.0.1:8770"))

    def __post_init__(self) -> None:
        if self.web_user_id == 0 and self.allowed_ids:
            self.web_user_id = self.allowed_ids[0]

    @property
    def records_dir(self) -> Path:
        # Можно задать папку записей напрямую (например, прямо в хранилище
        # Obsidian), иначе — стандартная подпапка внутри vault_root.
        override = os.environ.get("SPENDTRACK_RECORDS")
        if override:
            return Path(override)
        return self.vault_root / "Финансы" / "Записи"


def load_config() -> Config:
    _load_dotenv()
    return Config()
