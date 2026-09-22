"""Loads app settings from config.yaml at import time."""

import os

import yaml

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")

with open(CONFIG_PATH, "r", encoding="utf-8") as _f:
    SETTINGS = yaml.safe_load(_f)
