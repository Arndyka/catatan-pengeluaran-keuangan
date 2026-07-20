import json
import os
import re
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field


NVIDIA_BASE_URL = os.getenv(
    "NVIDIA_BASE_URL",
    "https://integrate.api.nvidia.com/v1",
).rstrip("/")

NVIDIA_TEXT_MODEL = os.getenv(
    "NVIDIA_TEXT_MODEL",
    "deepseek-ai/deepseek-v4-pro",
)

NVIDIA_VISION_MODEL = os.getenv(
    "NVIDIA_VISION_MODEL",
    "nvidia/nemotron-nano-12b-v2-vl",
)

MAX_CANDIDATES_PER_REQUEST = int(
    os.getenv("MAX_CANDIDATES_PER_REQUEST", "50")
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://arndyka.github.io",
    ).split(",")
    if origin.strip()
]


class NormalizeRequest(BaseModel):
    statements: list[dict[str, Any]] = Field(default_factory=list)
    accounts: list[dict[str, Any]] = Field(default_factory=list)
    candidates: list[dict[str, Any]]


class VisionRequest(BaseModel):
    image_data_url: str
    bank_hint: str = "generic"
    page_number: int = 1
    accounts: list[dict[str, Any]] = Field(default_factory=list)


app = FastAPI(
    title="Spendly NVIDIA AI Backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def get_client() -> OpenAI:
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "NVIDIA_API_KEY belum diset pada environment backend."
            ),
        )

    return OpenAI(
        base_url=NVIDIA_BASE_URL,
        api_key=api_key,
    )


def extract_json_object(value: str) -> dict[str, Any]:
    text = str(value or "").strip()

    fenced = re.search(
        r"```(?:json)?\s*(\{[\s\S]*\})\s*```",
        text,
        flags=re.IGNORECASE,
    )

    if fenced:
        text = fenced.group(1)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")

        if start < 0 or end <= start:
            raise HTTPException(
                status_code=502,
                detail="Model NVIDIA tidak mengembalikan JSON yang valid.",
            )

        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Respons model NVIDIA tidak dapat diparsing sebagai JSON."
                ),
            ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=502,
            detail="Respons model NVIDIA harus berupa object JSON.",
        )

    return parsed


def compact_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "index",
        "bank",
        "type",
        "date",
        "time",
        "amount",
        "signedAmount",
        "category",
        "merchant",
        "description",
        "sourceAccountId",
        "destinationAccountId",
        "possibleOwnTransfer",
        "internalMovement",
        "extractionMethod",
        "confidence",
        "validationStatus",
        "transactionCode",
        "reference",
        "counterpartyRaw",
        "balanceAfter",
        "balanceSource",
    }

    return {
        key: candidate.get(key)
        for key in allowed
        if key in candidate
    }


def validate_updates(
    raw_updates: Any,
    candidates: list[dict[str, Any]],
    accounts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(raw_updates, list):
        return []

    candidate_indexes = {
        int(candidate.get("index"))
        for candidate in candidates
        if str(candidate.get("index", "")).isdigit()
    }

    account_ids = {
        str(account.get("id"))
        for account in accounts
        if account.get("id")
    }

    valid_types = {"income", "expense", "transfer"}
    result: list[dict[str, Any]] = []

    for raw in raw_updates:
        if not isinstance(raw, dict):
            continue

        try:
            index = int(raw.get("index"))
        except (TypeError, ValueError):
            continue

        if index not in candidate_indexes:
            continue

        update: dict[str, Any] = {"index": index}

        tx_type = str(raw.get("type", "")).strip()
        if tx_type in valid_types:
            update["type"] = tx_type

        for field in ("category", "merchant", "description", "reason"):
            value = raw.get(field)
            if isinstance(value, str):
                update[field] = value.strip()[:500]

        for field in ("sourceAccountId", "destinationAccountId"):
            value = str(raw.get(field, "")).strip()
            if not value or value in account_ids:
                update[field] = value

        for field in ("possibleOwnTransfer", "transferNeedsMapping"):
            value = raw.get(field)
            if isinstance(value, bool):
                update[field] = value

        confidence = raw.get("confidence")
        if isinstance(confidence, (int, float)):
            update["confidence"] = max(
                0.0,
                min(0.99, float(confidence)),
            )

        result.append(update)

    return result


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "spendly-nvidia-ai",
        "text_model": NVIDIA_TEXT_MODEL,
        "vision_model": NVIDIA_VISION_MODEL,
        "api_key_configured": bool(
            os.getenv("NVIDIA_API_KEY", "").strip()
        ),
    }


@app.post("/api/nvidia/normalize-statement")
def normalize_statement(
    request: NormalizeRequest,
) -> dict[str, Any]:
    if not request.candidates:
        raise HTTPException(
            status_code=400,
            detail="Candidates tidak boleh kosong.",
        )

    if len(request.candidates) > MAX_CANDIDATES_PER_REQUEST:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Maksimal {MAX_CANDIDATES_PER_REQUEST} kandidat "
                "per permintaan."
            ),
        )

    candidates = [
        compact_candidate(candidate)
        for candidate in request.candidates
    ]

    account_catalog = [
        {
            "id": account.get("id"),
            "name": account.get("name"),
            "type": account.get("type"),
            "subtype": account.get("subtype"),
        }
        for account in request.accounts
    ]

    system_prompt = """
You are a financial-statement transaction normalization engine for an
Indonesian personal-finance application.

You receive transaction candidates extracted locally from Mandiri, BCA,
and Krom statements. Return strict JSON only.

Critical rules:
1. Never modify index, date, time, amount, signedAmount, bank, page, or
   any numeric value.
2. Use only account IDs present in account_catalog.
3. Correct transaction type only when the evidence is clear:
   - incoming money to the statement account: income, unless clearly an
     own-account transfer;
   - outgoing money: expense, unless clearly an own-account transfer;
   - own-account movement: transfer.
4. For transfer:
   - destination is the statement bank for incoming transfer;
   - source is the statement bank for outgoing transfer;
   - infer the counterparty bank only when its bank name is written;
   - never interpret branch code/CBG such as 501 as a bank identity;
   - use account id asset-transfer-clearing when the other bank cannot
     be proven.
5. BCA-specific rules:
   - TRSF_EBANKING_CR and BI_FAST_CR are credits.
   - TRSF_EBANKING_DB, CARD_INTERCHANGE_DB, DEBIT_CARD_DB,
     and ADMIN_FEE_DB are debits.
   - Google YouTubePrem means Google YouTube Premium.
   - DANA, GOPAY, and SHOPEEPAY are e-wallet top-ups when debit.
   - ALFAMART is shopping unless stronger evidence exists.
   - If balanceSource is calculated, do not treat that as an error.
6. Normalize merchant and category conservatively.
7. Do not invent missing transaction text.
8. Output:
{
  "updates": [
    {
      "index": 0,
      "type": "income|expense|transfer",
      "category": "...",
      "merchant": "...",
      "description": "...",
      "sourceAccountId": "...",
      "destinationAccountId": "...",
      "possibleOwnTransfer": false,
      "transferNeedsMapping": false,
      "confidence": 0.0,
      "reason": "brief Indonesian explanation"
    }
  ]
}
Only include candidates that need a meaningful correction or useful
normalization.
""".strip()

    user_payload = {
        "statements": request.statements,
        "account_catalog": account_catalog,
        "candidates": candidates,
    }

    client = get_client()

    try:
        completion = client.chat.completions.create(
            model=NVIDIA_TEXT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        user_payload,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
            ],
            temperature=0.1,
            max_tokens=8192,
            extra_body={
                "chat_template_kwargs": {
                    "thinking": False
                }
            },
            stream=False,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NVIDIA API error: {exc}",
        ) from exc

    content = completion.choices[0].message.content or ""
    parsed = extract_json_object(content)

    return {
        "model": NVIDIA_TEXT_MODEL,
        "updates": validate_updates(
            parsed.get("updates"),
            candidates,
            account_catalog,
        ),
    }


@app.post("/api/nvidia/read-page")
def read_page(
    request: VisionRequest,
) -> dict[str, Any]:
    """
    Optional route for future image/PDF-page fallback.
    The current frontend uses DeepSeek post-processing after local OCR.
    """
    if not request.image_data_url.startswith(
        ("data:image/png;base64,", "data:image/jpeg;base64,")
    ):
        raise HTTPException(
            status_code=400,
            detail="image_data_url harus berupa PNG/JPEG data URL.",
        )

    if len(request.image_data_url) > 9_000_000:
        raise HTTPException(
            status_code=413,
            detail="Ukuran gambar terlalu besar.",
        )

    prompt = f"""
Read this Indonesian bank-statement page.
Bank hint: {request.bank_hint}
Page: {request.page_number}

Extract every visible transaction as strict JSON:
{{
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "time": "HH:MM:SS",
      "description": "...",
      "merchant": "...",
      "direction": "incoming|outgoing|internal_transfer",
      "amount": 0,
      "balance_after": null,
      "confidence": 0.0
    }}
  ]
}}

Do not guess unreadable digits. Use null for uncertain numeric fields.
Return JSON only.
""".strip()

    client = get_client()

    try:
        completion = client.chat.completions.create(
            model=NVIDIA_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": request.image_data_url
                            },
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=8192,
            stream=False,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NVIDIA Vision API error: {exc}",
        ) from exc

    content = completion.choices[0].message.content or ""
    parsed = extract_json_object(content)

    return {
        "model": NVIDIA_VISION_MODEL,
        "result": parsed,
    }
