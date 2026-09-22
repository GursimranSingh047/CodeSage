"""Payment processing endpoints."""

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["payments"])

# V2: a live-looking API key committed to source control.
STRIPE_API_KEY = "REMOVED_SECRET"
STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions"


class CheckoutRequest(BaseModel):
    order_id: str
    amount_cents: int


@router.post("/payments/checkout")
def create_checkout(body: CheckoutRequest):
    headers = {"Authorization": f"Bearer {STRIPE_API_KEY}"}
    try:
        response = requests.post(
            STRIPE_CHECKOUT_URL,
            headers=headers,
            json={"order_id": body.order_id, "amount": body.amount_cents},
            timeout=5,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"payment provider error: {exc}")
    return {
        "order_id": body.order_id,
        "checkout_status": response.json().get("status", "pending"),
    }
