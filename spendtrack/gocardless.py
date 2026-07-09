"""Клиент GoCardless Bank Account Data (бывший Nordigen).

Это лицензированный агрегатор, который легально подключается к банкам по PSD2 и
отдаёт транзакции по API. Поток подключения такой:

  1. получить access-токен по secret_id/secret_key;
  2. найти институцию (PKO BP) по стране PL;
  3. создать requisition — это ссылка-согласие, по которой пользователь входит
     в свой банк и разрешает доступ; банк возвращает его на наш redirect;
  4. после согласия у requisition появляются account_id;
  5. по account_id тянуть транзакции.

Используем только стандартную библиотеку (urllib), чтобы не тащить зависимости.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

BASE = "https://bankaccountdata.gocardless.com/api/v2"


class GoCardlessError(Exception):
    pass


class GoCardless:
    def __init__(self, secret_id: str, secret_key: str):
        self.secret_id = secret_id
        self.secret_key = secret_key
        self._access = ""
        self._access_exp = 0.0

    def _call(self, method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise GoCardlessError(f"{exc.code}: {detail[:400]}")
        except urllib.error.URLError as exc:
            raise GoCardlessError(f"нет связи с GoCardless: {exc.reason}")

    def token(self) -> str:
        if self._access and time.time() < self._access_exp - 60:
            return self._access
        if not (self.secret_id and self.secret_key):
            raise GoCardlessError("не заданы ключи GoCardless (GOCARDLESS_SECRET_ID / _KEY)")
        r = self._call("POST", "/token/new/",
                       body={"secret_id": self.secret_id, "secret_key": self.secret_key})
        self._access = r["access"]
        self._access_exp = time.time() + int(r.get("access_expires", 86400))
        return self._access

    def institutions(self, country: str = "pl") -> list[dict]:
        return self._call("GET", f"/institutions/?country={country}", token=self.token())

    def institution(self, institution_id: str) -> dict:
        """Один банк по id — нужен при подключении выбранной пользователем институции."""
        return self._call("GET", f"/institutions/{institution_id}/", token=self.token())

    def find_institution(self, query: str = "PKO", country: str = "pl") -> dict | None:
        q = query.lower()
        # PKO BP в GoCardless обычно id вида PKO_BPKOPLPW; ищем по имени и id
        for inst in self.institutions(country):
            if q in inst.get("name", "").lower() or q in inst.get("id", "").lower():
                return inst
        return None

    def create_requisition(self, institution_id: str, redirect: str, reference: str) -> dict:
        return self._call("POST", "/requisitions/", token=self.token(), body={
            "institution_id": institution_id,
            "redirect": redirect,
            "reference": reference,
            "user_language": "PL",
        })

    def requisition(self, req_id: str) -> dict:
        return self._call("GET", f"/requisitions/{req_id}/", token=self.token())

    def transactions(self, account_id: str) -> dict:
        return self._call("GET", f"/accounts/{account_id}/transactions/", token=self.token())


def normalize_transactions(raw: dict) -> list[dict]:
    """Привести ответ /transactions/ к простым словарям.

    Берём проведённые (booked) операции. Сумма отрицательная — это расход.
    """
    out: list[dict] = []
    booked = (raw.get("transactions") or {}).get("booked", []) or []
    for t in booked:
        try:
            amount = float(t["transactionAmount"]["amount"])
            currency = t["transactionAmount"]["currency"]
        except (KeyError, TypeError, ValueError):
            continue
        date = t.get("bookingDate") or t.get("valueDate") or ""
        desc = (
            t.get("remittanceInformationUnstructured")
            or " ".join(t.get("remittanceInformationUnstructuredArray", []) or [])
            or t.get("creditorName")
            or t.get("debtorName")
            or ""
        ).strip()
        tx_id = (
            t.get("transactionId")
            or t.get("internalTransactionId")
            or f"{date}|{amount}|{desc[:24]}"
        )
        out.append({
            "id": str(tx_id),
            "date": date,
            "amount": amount,
            "currency": currency,
            "description": desc,
        })
    return out
