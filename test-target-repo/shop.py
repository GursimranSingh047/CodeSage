"""Product search endpoints."""

import sqlite3

from fastapi import APIRouter, HTTPException

from database import get_connection

router = APIRouter(tags=["shop"])


@router.get("/products/search")
def search_products(q: str):
    conn = get_connection()
    try:
        # V1: q is concatenated straight into the SQL string.
        query = f"SELECT * FROM products WHERE name LIKE '%{q}%'"
        rows = conn.execute(query).fetchall()
        return {
            "results": [
                {"id": row["id"], "name": row["name"], "price": row["price"]}
                for row in rows
            ]
        }
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="query error")
    finally:
        conn.close()
