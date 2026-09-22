"""SQLite connection helpers and seed data."""

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "shop.db")

PRODUCTS = [
    ("Laptop Pro 14", 1999.00),
    ("Smartphone X", 899.00),
    ("Wireless Mouse", 49.90),
    ("USB-C Cable", 12.50),
    ("4K Monitor", 549.00),
]


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS products ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL)"
        )
        conn.execute("DELETE FROM products")
        conn.executemany(
            "INSERT INTO products (name, price) VALUES (?, ?)", PRODUCTS
        )
        conn.commit()
    finally:
        conn.close()
